// Signups by source (flow 15 rule 26): the app sends one `source` on `signup_completed`, and the
// api Worker's analytics-import groups it into Play Store search, shared book links, church
// referrals, Instagram, author referral codes or Unknown.

export type SignupSourceToken =
  'play_search' | 'book_link' | 'church' | 'instagram' | 'author_code' | 'unknown';

/** Query values of a Play install referrer ("utm_source=x&utm_medium=y", possibly encoded once more). */
export function referrerParams(referrer: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  let raw = (referrer ?? '').trim();
  if (!raw) return out;
  if (!raw.includes('=') || /%3D/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return out;
    }
  }
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  for (const part of q.split('&')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    let v = part.slice(i + 1).replace(/\+/g, ' ');
    try {
      v = decodeURIComponent(v);
    } catch {
      continue;
    }
    const k = part.slice(0, i).trim().toLowerCase();
    if (!out.has(k))
      out.set(
        k,
        v
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_'),
      );
  }
  return out;
}

/**
 * The reader's sign-up source. A tagged install link wins (author code, church, Instagram, book
 * link); then a shared book link that opened the app before sign-up; then a plain Play Store
 * install (organic); else Unknown.
 */
export function signupSourceFrom(input: { referrer?: string | null; bookLink?: boolean }): SignupSourceToken {
  const p = referrerParams(input.referrer);
  const tags = [p.get('ref'), p.get('utm_source'), p.get('utm_medium'), p.get('utm_campaign')].filter(
    (v): v is string => !!v,
  );
  if (tags.some((t) => t.startsWith('author'))) return 'author_code';
  if (tags.some((t) => t.startsWith('church'))) return 'church';
  if (tags.some((t) => t === 'ig' || t.includes('instagram'))) return 'instagram';
  if (tags.some((t) => ['book_link', 'shared_book', 'share', 'book'].includes(t))) return 'book_link';
  if (input.bookLink) return 'book_link';
  const source = p.get('utm_source');
  const medium = p.get('utm_medium');
  if (medium === 'organic' || source === 'google_play' || source === 'play_store') return 'play_search';
  return 'unknown';
}
