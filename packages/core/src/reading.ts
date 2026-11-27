// Flow 04 · reader maths shared by the app and the reader bundle: positions and percent from the
// manifest (never foliate's byte fraction), standard pages, time left, the pay-as-you-read pending
// charge table, and the offline licence clock.
import { WORDS_PER_PAGE } from './pricing';
import { WORDS_PER_MINUTE } from './unlock';

export interface ReadingParagraph {
  id: string;
  /** Words in the whole book before this paragraph. */
  words_before: number;
}

export interface ReadingChapter {
  chapter_uid: string;
  ord: number;
  title: string;
  kind: 'chapter' | 'part';
  words: number;
  words_before: number;
  pages: number;
  price_credits: number;
  paragraphs: ReadingParagraph[];
}

/** The parts of the sealed manifest (BookManifest) the reader maths needs. */
export interface ReadingManifest {
  book_id: string;
  revision_id: string;
  total_words: number;
  preview_cut: { chapter_uid: string; para_id: string } | null;
  chapters: ReadingChapter[];
}

export type ChapterAccess = 'open' | 'partial' | 'unlocked' | 'locked';

export interface ParaPosition {
  chapter_uid: string;
  para_id: string;
  /** Words inside the paragraph before the position. */
  offset_words: number;
}

/** Index paragraphs once per manifest: para_id → {chapter, index, words_before, words}. */
export function indexParagraphs(m: ReadingManifest) {
  const out = new Map<
    string,
    { chapter: ReadingChapter; index: number; words_before: number; words: number }
  >();
  for (const c of m.chapters) {
    c.paragraphs.forEach((p, i) => {
      const next = c.paragraphs[i + 1]?.words_before ?? c.words_before + c.words;
      out.set(p.id, {
        chapter: c,
        index: i,
        words_before: p.words_before,
        words: Math.max(0, next - p.words_before),
      });
    });
  }
  return out;
}

/** Words before a position. Unknown paragraphs fall back to the chapter start. */
export function wordsAt(m: ReadingManifest, pos: ParaPosition): number {
  const p = indexParagraphs(m).get(pos.para_id);
  if (!p) return m.chapters.find((c) => c.chapter_uid === pos.chapter_uid)?.words_before ?? 0;
  return p.words_before + Math.min(Math.max(0, pos.offset_words), p.words);
}

/** Percent read, 0–100 with one decimal (rule 15). */
export function positionToPercent(m: ReadingManifest, pos: ParaPosition): number {
  if (m.total_words <= 0) return 0;
  return Math.min(100, Math.round((wordsAt(m, pos) * 1000) / m.total_words) / 10);
}

/** The paragraph (and words into it) at a percent: the slider's target. */
export function percentToParagraph(m: ReadingManifest, percent: number): ParaPosition | null {
  const target = (Math.min(100, Math.max(0, percent)) / 100) * m.total_words;
  let found: ParaPosition | null = null;
  for (const c of m.chapters) {
    for (const p of c.paragraphs) {
      if (p.words_before > target) return found;
      found = {
        chapter_uid: c.chapter_uid,
        para_id: p.id,
        offset_words: Math.round(target - p.words_before),
      };
    }
  }
  if (found) {
    const p = indexParagraphs(m).get(found.para_id);
    if (p) found.offset_words = Math.min(found.offset_words, p.words);
  }
  return found;
}

/** Standard page at a position, "page 84 of 250" (rule 16): device independent. */
export function pageAt(m: ReadingManifest, pos: ParaPosition): { page: number; of: number } {
  const of = Math.max(1, Math.ceil(m.chapters.reduce((s, c) => s + c.pages, 0)));
  return { page: Math.min(of, Math.floor(wordsAt(m, pos) / WORDS_PER_PAGE) + 1), of };
}

/** Words left in the chapter from a position. */
export function wordsLeftInChapter(m: ReadingManifest, pos: ParaPosition): number {
  const c = m.chapters.find((x) => x.chapter_uid === pos.chapter_uid);
  if (!c) return 0;
  return Math.max(0, c.words_before + c.words - wordsAt(m, pos));
}

/** "11 min left in chapter" or "Less than a minute" (rule 17). */
export function timeLeftLabel(wordsLeft: number): string {
  const min = Math.floor(wordsLeft / WORDS_PER_MINUTE);
  return min < 1 ? 'Less than a minute' : `${min} min left in chapter`;
}

/** Can the reader be at this position? Locked chapters allow only the peek; partial up to the cut. */
export function positionAllowed(
  m: ReadingManifest,
  access: Record<string, ChapterAccess>,
  pos: ParaPosition,
): boolean {
  const a = access[pos.chapter_uid];
  if (a === 'open' || a === 'unlocked') return true;
  const idx = indexParagraphs(m);
  const p = idx.get(pos.para_id);
  if (!a || !p || p.chapter.chapter_uid !== pos.chapter_uid) return false;
  if (a === 'partial') {
    const cut = m.preview_cut && idx.get(m.preview_cut.para_id);
    return !cut || p.words_before <= cut.words_before;
  }
  return p.words_before - p.chapter.words_before <= Math.min(PEEK_WORDS, p.chapter.words * PEEK_MAX_SHARE);
}

export const PEEK_WORDS = 300;
export const PEEK_MAX_SHARE = 0.4;

// ─── Pay as you read: pending charges (rule 56) ─────────────────────────────
export interface PendingCharge {
  user_id: string;
  book_id: string;
  chapter_uid: string;
  key: string;
  created_at: number;
}

export interface PendingStore {
  get(id: string): PendingCharge | undefined;
  set(id: string, value: PendingCharge): void;
  delete(id: string): void;
  values(): Iterable<PendingCharge>;
}

const pendingId = (user: string, chapter: string) => `${user}:${chapter}`;

/**
 * The idempotency key for a chapter charge: made once per (user, chapter) and reused by every retry
 * until the server confirms, so a double tap, a retry or an app restart charges once.
 */
export function chargeKey(
  store: PendingStore,
  c: Omit<PendingCharge, 'key' | 'created_at'>,
  newKey: () => string,
  now: number = Date.now(),
): string {
  const id = pendingId(c.user_id, c.chapter_uid);
  const found = store.get(id);
  if (found) return found.key;
  const key = newKey();
  store.set(id, { ...c, key, created_at: now });
  return key;
}

/** The server answered ok or already_unlocked: forget the key. */
export function confirmCharge(store: PendingStore, user: string, chapter: string): void {
  store.delete(pendingId(user, chapter));
}

/** Pending charges to retry with their original keys (app restart, reconnect). */
export const pendingCharges = (store: PendingStore, user: string) =>
  [...store.values()].filter((p) => p.user_id === user);

export function memoryPendingStore(): PendingStore {
  const m = new Map<string, PendingCharge>();
  return {
    get: (k) => m.get(k),
    set: (k, v) => void m.set(k, v),
    delete: (k) => void m.delete(k),
    values: () => m.values(),
  };
}

// ─── Offline licence (rule 71) ──────────────────────────────────────────────
export const LICENSE_DAYS = 7;
/** Flow 10 rule 31: a device past the download limit still reads online, on a short licence. */
export const ONLINE_LICENSE_MINUTES = 60;

/**
 * The licence a key request gets. A download, or any device under the limit, gets the full 7 days
 * (recorded). Reading online on a device past the limit gets a short licence that is not recorded,
 * so it never takes a download slot; a download there is refused.
 */
export function licenceTerms(
  issuedAt: number,
  online: boolean,
  limitReached: boolean,
): { validUntil: number; record: boolean } | 'device_limit' {
  if (!limitReached) return { validUntil: issuedAt + LICENSE_DAYS * 86_400_000, record: true };
  if (!online) return 'device_limit';
  return { validUntil: issuedAt + ONLINE_LICENSE_MINUTES * 60_000, record: false };
}

export interface License {
  /** Server time at issue (ms). */
  issued_at: number;
  /** Server time the licence ends (ms). */
  valid_until: number;
  /** Device wall clock when the bundle arrived (ms). */
  device_received_at: number;
}

/**
 * Is a licence still valid? Time is measured from the server's issue time plus device time elapsed
 * since it arrived. If the device clock has gone back past the last time we saw, treat it as expired.
 */
export function licenseValid(l: License, deviceNow: number, lastSeenDeviceTime: number): boolean {
  if (deviceNow < lastSeenDeviceTime || deviceNow < l.device_received_at) return false;
  const serverNow = l.issued_at + (deviceNow - l.device_received_at);
  return serverNow < l.valid_until;
}
