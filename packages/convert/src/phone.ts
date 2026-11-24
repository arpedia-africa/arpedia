// On-device conversion for Studio step 2 (docs/prd/12-book-pipeline.md rules 6–7). Word goes
// through the DOCX reader, EPUB through the same reader the Worker uses; both are normalised,
// sanitised and rewritten as a clean EPUB3. The counts are hints for the author's screen only:
// the Worker recounts everything. Anything that goes wrong returns a fallback reason, and the
// app uploads the original for the desk instead.
import { countWords } from '@arpedia/core';
import { docxToHtml } from './docx';
import { writeEpub } from './epub-write';
import { normalizeHtml } from './normalize';
import { safeUnzip, sanitizeHtml } from './sanitize';
import { verifyPackage, type VerifyOk } from './verify';

/** Rule 7: longer books are checked on the server. */
export const PHONE_WORD_CAP = 300_000;

export type ConvertFallback = 'conversion_failed' | 'out_of_memory' | 'too_large';

export interface ConvertHints {
  words: number;
  pages: number;
  price: number;
  chapters: number;
  previewPercent: number;
}

export type PhoneConvert =
  | { ok: true; epub: Uint8Array; hints: ConvertHints }
  | { ok: false; reason: ConvertFallback; detail: string };

export interface PhoneConvertMeta {
  title: string;
  language?: string;
  /** `urn:uuid:<revision id>`. */
  identifier: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainWords = (html: string) => countWords(html.replace(/<[^>]*>/g, ' '));

/** Body HTML from a verified EPUB: one <h1> per chapter (parts of a chapter share it). */
function bodyOf(v: VerifyOk) {
  return v.chapters
    .map((c, i) => {
      const prev = v.chapters[i - 1];
      const continues = c.kind === 'part' && prev?.kind === 'part' && prev.parentOrd === c.parentOrd;
      const title = c.title.replace(/\s·\spart\s\d+$/, '');
      const head = c.titled && !continues && !v.untitledBook ? `<h1>${esc(title)}</h1>` : '';
      return head + c.blocks.map((b) => b.html).join('');
    })
    .join('');
}

function hintsOf(v: VerifyOk): ConvertHints {
  return {
    words: v.words,
    pages: v.pages,
    price: v.price,
    chapters: v.chapters.filter((c) => !c.front).length,
    previewPercent: v.preview.percent,
  };
}

export function convertForUpload(
  bytes: Uint8Array,
  source: 'docx' | 'epub',
  meta: PhoneConvertMeta,
): PhoneConvert {
  try {
    let html: string;
    let images: Record<string, Uint8Array>;
    if (source === 'docx') {
      const got = docxToHtml(bytes);
      if (plainWords(got.html) > PHONE_WORD_CAP)
        return { ok: false, reason: 'too_large', detail: 'over 300,000 words' };
      html = sanitizeHtml(normalizeHtml(got.html), { image: (src) => (got.images[src] ? src : null) }).html;
      images = got.images;
    } else {
      const v = verifyPackage(safeUnzip(bytes));
      if (!v.ok) return { ok: false, reason: 'conversion_failed', detail: v.message };
      if (v.words > PHONE_WORD_CAP) return { ok: false, reason: 'too_large', detail: 'over 300,000 words' };
      html = sanitizeHtml(normalizeHtml(bodyOf(v)), { image: (src) => (v.images[src] ? src : null) }).html;
      images = v.images;
    }
    if (!html.replace(/<[^>]*>/g, '').trim())
      return { ok: false, reason: 'conversion_failed', detail: 'no text found' };
    const epub = writeEpub({
      title: meta.title,
      language: meta.language ?? 'en',
      identifier: meta.identifier,
      html,
      images,
    });
    // The same check the Worker runs, for the "Readers pay N credits" hint.
    const v = verifyPackage(safeUnzip(epub));
    if (!v.ok) return { ok: false, reason: 'conversion_failed', detail: v.message };
    return { ok: true, epub, hints: hintsOf(v) };
  } catch (e) {
    // Hermes and V8 both report allocation failures as RangeError.
    if (e instanceof RangeError) return { ok: false, reason: 'out_of_memory', detail: e.message };
    return { ok: false, reason: 'conversion_failed', detail: (e as Error).message ?? String(e) };
  }
}
