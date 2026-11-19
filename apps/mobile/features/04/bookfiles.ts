// One open book revision on this phone (flow 04 rules 2–7, 70–72): its sealed files (kept on disk
// exactly as received, ciphertext only), its key bundle (sealed under the local master key) and the
// licence clock. `read` answers the reader bundle's resource requests with decrypted bytes.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { chapterAad, licenseValid, openFile, type ChapterAccess } from '@arpedia/core';
import { openLocal, sealLocal, unsealKey } from './crypto';
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
    const stored: StoredKeys = {
      ...this.licence,
      keys: Object.fromEntries([...this.keys].map(([k, v]) => [k, btoa(String.fromCharCode(...v))])),
    };
    this.dir.create({ intermediates: true, idempotent: true });
    await this.keysFile().write(await sealLocal(enc.encode(JSON.stringify(stored)), this.label()));
    await this.seeClock(now);
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
  forgetKey(chapterUid: string) {
    this.keys.delete(chapterUid);
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
   */
  async read(path: string, access: Record<string, ChapterAccess>): Promise<Uint8Array | null> {
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

  /** Drop a cached file so the next read fetches it again (resource_missing / decrypt_failed). */
  evict(path: string) {
    const f = this.file(path);
    if (f.exists) f.delete();
  }
}

export const decodeText = (b: Uint8Array) => dec.decode(b);
