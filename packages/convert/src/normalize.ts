// Typographic normaliser (docs/prd/12-book-pipeline.md section D, flow 11 rule on conversion):
// straight quotes become curly, double hyphens become dashes, three dots an ellipsis, and a
// paragraph that is only a scene-break mark (* * *, #, ~~~) becomes `<div class="scene-break"/>`.
// It runs on the HTML a converter produced (the desk's pandoc or PDF output, the phone's Word
// conversion) before the EPUB is written, so text inside tags is touched and markup is not.

const SCENE_BREAK = /^(?:(?:\*\s*){1,5}|#|(?:~\s*){1,5}|(?:-\s*){3,5}|(?:•\s*){1,5}|⁂)$/;
/** Tags that start a new run of text, so a quote after them opens. */
const BLOCK = /^<\/?(p|h[1-6]|li|blockquote|div|figcaption|br|td|th|section)\b/i;

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#0*34;/g, '"');

/** Curly quotes and dashes for one run of text; `prev` is the character before it. */
export function normalizeText(text: string, prev = ''): string {
  let out = '';
  let before = prev;
  const s = text.replace(/\.\.\./g, '…').replace(/---?/g, '—');
  for (const ch of s) {
    let c = ch;
    const opens = before === '' || /[\s([{—–‘“]/.test(before);
    if (ch === '"') c = opens ? '“' : '”';
    else if (ch === "'") c = opens ? '‘' : '’';
    out += c;
    before = c;
  }
  return out;
}

/** Normalise the text of an HTML fragment, then turn scene-break paragraphs into the marker. */
export function normalizeHtml(html: string): string {
  let prev = '';
  const parts = html.split(/(<[^>]*>)/);
  const out = parts.map((part) => {
    if (part.startsWith('<')) {
      if (BLOCK.test(part)) prev = '';
      return part;
    }
    if (!part) return part;
    const text = normalizeText(decode(part), prev);
    if (/\S/.test(part)) prev = [...text].at(-1) ?? prev;
    return text;
  });
  return out
    .join('')
    .replace(/<p(?:\s[^>]*)?>\s*([^<]*?)\s*<\/p>/g, (m, inner: string) =>
      SCENE_BREAK.test(inner.trim()) && inner.trim() ? '<div class="scene-break"></div>' : m,
    );
}
