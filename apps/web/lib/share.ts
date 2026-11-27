/** Helpers for the share landing pages (/c, /r, /book, /author, /community). */

const words = (s: string) =>
  s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** "the-alignment-8d2b0385" becomes "The Alignment". A trailing hex id is dropped. */
export function titleFromSlug(slug: string): string {
  return words(safeDecode(slug).replace(/-[0-9a-f]{6,}$/i, '')).slice(0, 80);
}

/** "ada-obi" or "Ada%20Obi" becomes "Ada Obi". */
export function nameFromSlug(name: string): string {
  return words(safeDecode(name)).slice(0, 80);
}

/** Room codes are letters and digits, up to 16 (flow 7), shown in capitals. */
export function cleanCode(code: string): string {
  return safeDecode(code)
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 16);
}

const seg = (s: string) => encodeURIComponent(safeDecode(s));

/** Where each shared link opens inside the app (custom scheme "arpedia", routes in apps/mobile/app). */
export const deepLink = {
  club: (id: string) => `arpedia://chat/${seg(id)}`,
  room: (code: string) => `arpedia://join-code?code=${encodeURIComponent(cleanCode(code))}`,
  book: (slug: string) => `arpedia://book/${seg(slug)}`,
  author: (name: string) => `arpedia://author/${seg(name)}`,
  community: (slug: string) => `arpedia://community/${seg(slug)}`,
};
