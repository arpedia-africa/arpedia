// One open book revision on this phone (flow 04 rules 2–7, 70–72): its sealed files (kept on disk
// exactly as received, ciphertext only), its key bundle (sealed under the local master key) and the
// licence clock. `read` answers the reader bundle's resource requests with decrypted bytes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { chapterAad, licenseValid, openFile, type ChapterAccess } from '@arpedia/core';
import { forgetReaderKeys, openLocal, sealLocal, unsealKey } from './crypto';
import { clearPendingCharges } from './state';
import { deviceId, fetchDownload, fetchKeys, WorkerError, type KeysResponse } from './worker';

export interface ManifestChapter {
  chapter_uid: string;
  ord: number;
  kind: 'chapter' | 'part';
  title: string;
  words: number;
  words_before: number;
  pages: number;
  price_credits: number;
  free_file: string | null;
  full_file: string;
  paragraphs: { id: string; words_before: number }[];
}
export interface BookManifest {
  book_id: string;
  revision_id: string;
  total_words: number;
  pages: number;
  price_credits: number;
  preview_cut: { chapter_uid: string; para_id: string; percent: number } | null;
  chapters: ManifestChapter[];
}

const CLOCK = 'reader.clock.last-seen';
const FREE = 'free';
const enc = new TextEncoder();
const dec = new TextDecoder();

interface StoredKeys {
  keys: Record<string, string>; // chapter_uid | 'free' → raw key, base64
  issued_at: number;
  valid_until: number;
  device_received_at: number;
}

export class BookFiles {
  private dir: Directory;
  private urls = new Map<string, string>();
  private urlsUntil = 0;
  private keys = new Map<string, Uint8Array>();
  private licence: Omit<StoredKeys, 'keys'> | null = null;
  /** Files already fetched again this session (rule 19 allows one re-download each). */
  private refetched = new Set<string>();
  manifest: BookManifest | null = null;

  constructor(
    readonly bookId: string,
    readonly revisionId: string,
    private owns: boolean,
  ) {
    this.dir = new Directory(Paths.document, 'reader', bookId, revisionId);
  }

  private file(path: string) {
    return new File(this.dir, 'f', ...path.split('/'));
  }
  private keysFile() {
    return new File(this.dir, 'keys.bin');
  }

  /** Short-lived read links for the sealed files, plus a fresh key bundle (online only). */
  async refreshLinks(): Promise<void> {
    const device_id = await deviceId();
    const r = await fetchDownload({
      book_id: this.bookId,
      revision_id: this.revisionId,
      device_id,
      scope: this.owns ? 'whole' : 'owned',
    });
    this.urls = new Map(r.files.map((f) => [f.path, f.url]));
    this.urlsUntil = Date.parse(r.expires_at) - 30_000;
    await this.storeKeys(r);
  }

  /** Keys for chapters the reader just became entitled to (after an unlock). */
  async refreshKeys(chapterUids?: string[]): Promise<void> {
    const device_id = await deviceId();
    const r = await fetchKeys({
      book_id: this.bookId,
      revision_id: this.revisionId,
      device_id,
      chapter_uids: chapterUids,
    });
    await this.storeKeys(r, !!chapterUids);
  }

  private async storeKeys(r: KeysResponse, merge = false) {
    const now = Date.now();
    const next = merge ? new Map(this.keys) : new Map<string, Uint8Array>();
    for (const k of r.keys) next.set(k.chapter_uid ?? FREE, await unsealKey(k.key));
    this.keys = next;
    // Server time at issue, measured forward with the device clock from when it arrived (rule 71).
    this.licence = {
      issued_at: Date.parse(r.licence.issued_at),
      valid_until: Date.parse(r.licence.valid_until),
      device_received_at: now,
    };
    await this.persist();
    await this.seeClock(now);
  }

  /** The key bundle on disk, sealed under the local master key (rule 4). */
  private async persist() {
    if (!this.licence) return;
    const stored: StoredKeys = {
      ...this.licence,
      keys: Object.fromEntries([...this.keys].map(([k, v]) => [k, btoa(String.fromCharCode(...v))])),
    };
    this.dir.create({ intermediates: true, idempotent: true });
    await this.keysFile().write(await sealLocal(enc.encode(JSON.stringify(stored)), this.label()));
  }

  private label() {
    return `${this.bookId}:${this.revisionId}`;
  }

  /** Keys kept from an earlier session (offline opening). */
  async loadStoredKeys(): Promise<boolean> {
    const f = this.keysFile();
    if (!f.exists) return false;
    try {
      const s = JSON.parse(dec.decode(await openLocal(await f.bytes(), this.label()))) as StoredKeys;
      this.keys = new Map(
        Object.entries(s.keys).map(([k, v]) => [k, Uint8Array.from(atob(v), (c) => c.charCodeAt(0))]),
      );
      this.licence = {
        issued_at: s.issued_at,
        valid_until: s.valid_until,
        device_received_at: s.device_received_at,
      };
      return true;
    } catch {
      return false;
    }
  }

  private async seeClock(now: number) {
    const last = Number((await AsyncStorage.getItem(CLOCK)) ?? 0);
    if (now > last) await AsyncStorage.setItem(CLOCK, String(now));
  }

  /** Rule 71: a key counts only while the licence is valid; a clock moved back expires it. */
  async licenceValid(): Promise<boolean> {
    if (!this.licence) return false;
    const now = Date.now();
    const last = Number((await AsyncStorage.getItem(CLOCK)) ?? 0);
    const ok = licenseValid(this.licence, now, last);
    if (ok) await this.seeClock(now);
    return ok;
  }

  hasKey(chapterUid: string) {
    return this.keys.has(chapterUid);
  }
  hasFreeKey() {
    return this.keys.has(FREE);
  }
  /** Undo (rule 59): the chapter's key leaves memory and the sealed bundle on disk. */
  async forgetKey(chapterUid: string) {
    if (!this.keys.delete(chapterUid)) return;
    await this.persist().catch(() => undefined);
  }

  /** The sealed bytes of a file: from disk, else fetched once and kept (ciphertext only). */
  private async sealed(path: string): Promise<Uint8Array | null> {
    const f = this.file(path);
    if (f.exists) return f.bytes();
    if (!this.urls.has(path) || Date.now() > this.urlsUntil) await this.refreshLinks();
    const url = this.urls.get(path);
    if (!url) return null;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new WorkerError('offline', 0);
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new WorkerError('download_failed', res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    new Directory(this.dir, 'f', ...path.split('/').slice(0, -1)).create({
      intermediates: true,
      idempotent: true,
    });
    await f.write(bytes);
    return bytes;
  }

  async loadManifest(): Promise<BookManifest> {
    const bytes = await this.sealed('manifest.json');
    if (!bytes) throw new Error('manifest_missing');
    this.manifest = JSON.parse(dec.decode(bytes)) as BookManifest;
    return this.manifest;
  }

  /**
   * Decrypted bytes for a path the reader bundle asked for. A chapter gets its full file only when
   * its access is open or unlocked (and the key is here); otherwise its free file (rule 7).
   * A missing or undecryptable file is fetched again once with fresh links (rule 19).
   */
  async read(path: string, access: Record<string, ChapterAccess>): Promise<Uint8Array | null> {
    let failed: unknown = null;
    try {
      const bytes = await this.readOnce(path, access);
      if (bytes) return bytes;
    } catch (e) {
      if (e instanceof WorkerError) throw e;
      failed = e;
    }
    const file = this.fileFor(path, access);
    if (!file || this.refetched.has(file)) {
      if (failed) throw failed;
      return null;
    }
    this.refetched.add(file);
    this.evict(file);
    await this.refreshLinks();
    return this.readOnce(path, access);
  }

  /** The stored file behind a requested path: the chapter's free file when its full file is closed. */
  private fileFor(path: string, access: Record<string, ChapterAccess>): string | null {
    const spine = /^c(\d+)\.full\.xhtml$/.exec(path);
    if (!spine) return path;
    const c = this.manifest?.chapters.find((x) => x.ord === Number(spine[1]));
    if (!c) return null;
    const a = access[c.chapter_uid];
    if (a === 'unlocked' && this.keys.has(c.chapter_uid)) return path;
    if (a === 'open' && !c.free_file) return path;
    return c.free_file;
  }

  private async readOnce(path: string, access: Record<string, ChapterAccess>): Promise<Uint8Array | null> {
    const m = this.manifest;
    if (!m) throw new Error('not_open');
    let file = path;
    let keyId: string = FREE;
    const spine = /^c(\d+)\.full\.xhtml$/.exec(path);
    const img = /^img\/c(\d+)-/.exec(path);
    if (spine) {
      const c = m.chapters.find((x) => x.ord === Number(spine[1]));
      if (!c) return null;
      const a = access[c.chapter_uid];
      if (a === 'unlocked' && this.keys.has(c.chapter_uid)) keyId = c.chapter_uid;
      else if (a === 'open' && !c.free_file) keyId = FREE;
      else if (c.free_file) file = c.free_file;
      else return null;
    }
    const sealed = await this.sealed(file);
    if (!sealed) return null;
    const free = this.keys.get(FREE);
    const tryKeys: Uint8Array[] = [];
    if (keyId !== FREE) tryKeys.push(this.keys.get(keyId)!);
    if (free) tryKeys.push(free);
    if (img) {
      const c = m.chapters.find((x) => x.ord === Number(img[1]));
      const k = c && this.keys.get(c.chapter_uid);
      if (k) tryKeys.push(k);
    }
    for (const k of tryKeys) {
      try {
        return await openFile(k, sealed, chapterAad(this.revisionId, file));
      } catch {
        // wrong key for this file: try the next
      }
    }
    throw new Error('decrypt_failed');
  }

  /**
   * Download (rule 70): every file in scope, saved as received (ciphertext). Files already on disk
   * are skipped, so an interrupted download resumes where it stopped.
   */
  async downloadAll(onProgress?: (done: number, total: number) => void): Promise<void> {
    await this.refreshLinks();
    const paths = [...this.urls.keys()];
    let done = 0;
    for (const p of paths) {
      await this.sealed(p);
      onProgress?.(++done, paths.length);
    }
  }

  /** The licence end (ms) of the stored key bundle, or null when none is stored. */
  licenceUntil(): number | null {
    return this.licence?.valid_until ?? null;
  }

  /** Drop a cached file so the next read fetches it again (resource_missing / decrypt_failed). */
  evict(path: string) {
    const f = this.file(path);
    if (f.exists) f.delete();
  }
}

export const decodeText = (b: Uint8Array) => dec.decode(b);

/** A book with chapter files on this phone (Library › Offline, flow 05 rule 5). */
export interface OfflineBook {
  bookId: string;
  revisionId: string;
  /** Sealed bytes on disk (rule 26). */
  bytes: number;
  /** Chapter files on disk (`c{n}.full.xhtml` / free files), not counting package files. */
  chapterFiles: number;
  /** Licence end in ms, null without a stored key bundle. */
  validUntil: number | null;
  /** Newest file write, as the download date (Offline sorts by it). */
  downloadedAt: number;
}

const root = () => new Directory(Paths.document, 'reader');
const EXPIRED_PURGE_MS = 30 * 86_400_000;

function walk(d: Directory, out: { bytes: number; chapters: number; newest: number }) {
  for (const e of d.list()) {
    if (e instanceof Directory) walk(e, out);
    else {
      out.bytes += e.size ?? 0;
      out.newest = Math.max(out.newest, e.modificationTime ?? 0);
      if (/^c\d+\.(full|free)\.xhtml$/.test(e.name)) out.chapters += 1;
    }
  }
}

/** Every book on this phone with at least one downloaded chapter file. */
export async function offlineBooks(): Promise<OfflineBook[]> {
  const r = root();
  if (!r.exists) return [];
  const out: OfflineBook[] = [];
  for (const b of r.list()) {
    if (!(b instanceof Directory)) continue;
    for (const rev of b.list()) {
      if (!(rev instanceof Directory)) continue;
      const files = new Directory(rev, 'f');
      const t = { bytes: 0, chapters: 0, newest: 0 };
      if (files.exists) walk(files, t);
      if (t.chapters === 0) continue;
      const bf = new BookFiles(b.name, rev.name, false);
      await bf.loadStoredKeys();
      // Rule 72: files whose licence ended more than 30 days ago are deleted.
      const until = bf.licenceUntil();
      if (until !== null && Date.now() > until + EXPIRED_PURGE_MS) {
        rev.delete();
        continue;
      }
      out.push({
        bookId: b.name,
        revisionId: rev.name,
        bytes: t.bytes,
        chapterFiles: t.chapters,
        validUntil: bf.licenceUntil(),
        downloadedAt: t.newest,
      });
    }
  }
  return out;
}

/** Flow 16 rule 26: a book with files on this phone stays readable in maintenance mode. */
export function hasBookFiles(bookId: string): boolean {
  try {
    return new Directory(root(), bookId).exists;
  } catch {
    return false;
  }
}

/** Remove download (flow 05 rule 14): files and keys of this book on this phone; unlocks stay. */
export function removeDownload(bookId: string) {
  const d = new Directory(root(), bookId);
  if (d.exists) d.delete();
}

/** Rule 72: sign-out and account deletion wipe every book file, key bundle and device key. */
export async function wipeReaderData() {
  try {
    const r = root();
    if (r.exists) r.delete();
  } catch {
    // a file still open: the purge below and the next wipe get it
  }
  await Promise.all([forgetReaderKeys().catch(() => undefined), clearPendingCharges()]);
}
