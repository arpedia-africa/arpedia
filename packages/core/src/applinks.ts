/**
 * App links (coordinator request, 27 Nov): https://arpedia.africa share links, and the website's
 * arpedia:// hand-offs, rewritten to the app's own routes. Paths the website serves for the app
 * (`apps/web/lib/aasa.ts`, `assetlinks.json`): /c, /r, /book, /author, /community and /account.
 */

/** Hosts whose links the app opens (Android intent filters and iOS associated domains). */
export const APP_LINK_HOSTS = ['arpedia.africa', 'www.arpedia.africa'] as const;

/** Path prefixes the app handles on those hosts. `/account` is the one exact path. */
export const APP_LINK_PREFIXES = ['/c/', '/r/', '/book/', '/author/', '/community/'] as const;
export const APP_LINK_PATHS = ['/account'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** "the-alignment-8d2b0385" or "Ada%20Obi" becomes words to search for; a trailing hex id is dropped. */
function wordsFrom(slug: string): string {
  return decode(slug)
    .replace(/-[0-9a-f]{6,}$/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .join(' ')
    .slice(0, 80);
}

const search = (slug: string) => {
  const q = wordsFrom(slug);
  return q ? `/search?q=${encodeURIComponent(q)}` : '/';
};

/** Room codes are letters and digits, up to 16 (flow 07), in capitals. */
const roomCode = (s: string) =>
  decode(s)
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 16);

type Parsed = { web: boolean; segments: string[]; query: URLSearchParams };

function parse(input: string): Parsed | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?/i.exec(input.trim());
  if (m) {
    const scheme = m[1]!.toLowerCase();
    const host = m[2]!.toLowerCase();
    if (scheme === 'https' || scheme === 'http') {
      if (!(APP_LINK_HOSTS as readonly string[]).includes(host)) return null;
      return {
        web: true,
        segments: m[3]!.split('/').filter(Boolean),
        query: new URLSearchParams(m[4] ?? ''),
      };
    }
    if (scheme !== 'arpedia') return null;
    // arpedia://chat/ID: the "host" is the first segment.
    return {
      web: false,
      segments: [host, ...m[3]!.split('/')].filter(Boolean),
      query: new URLSearchParams(m[4] ?? ''),
    };
  }
  // Already a path ("/book/ID").
  const [path, q] = input.trim().split('?', 2);
  if (!path?.startsWith('/')) return null;
  return {
    web: false,
    segments: path.split('/').filter(Boolean),
    query: new URLSearchParams(q ?? ''),
  };
}

/**
 * The app route for an incoming link, or null to leave it as it is (other schemes, other hosts and
 * arpedia:// paths that are not share links, such as the password reset).
 * - `/c/ID` and `/chat/ID` open the club chat; `/r/CODE` and `/join-code?code=` the room code screen.
 * - `/book/ID`, `/author/ID` and `/community/ID` open the page when ID is an id; the website's name
 *   slugs ("the-alignment-8d2b0385", "ada-obi") open Search with those words instead.
 * - `/account` opens Account. Any other arpedia.africa path opens Home (through the start screen).
 */
export function appLinkRoute(input: string): string | null {
  const p = parse(input);
  if (!p) return null;
  const [head, id] = p.segments.map(decode);
  const extra = p.segments.length > 2;
  // A deeper arpedia:// path ("book/ID/reviews") is already an app route.
  if (!p.web && extra) return null;
  switch (head) {
    case 'c':
    case 'chat':
      if (id && UUID.test(id) && !extra) return `/chat/${id.toLowerCase()}`;
      return p.web || head === 'c' ? '/community' : null;
    case 'r': {
      const code = id ? roomCode(id) : '';
      return code ? `/r/${code}` : '/join-code';
    }
    case 'join-code': {
      const code = roomCode(p.query.get('code') ?? '');
      return code ? `/join-code?code=${code}` : '/join-code';
    }
    case 'book':
      if (!id) return '/';
      if (UUID.test(id)) return `/book/${id.toLowerCase()}`;
      return search(p.segments[1]!);
    case 'author':
      if (!id) return '/';
      if (UUID.test(id)) return `/author/${id.toLowerCase()}`;
      return search(p.segments[1]!);
    case 'community':
      if (id && UUID.test(id)) return `/community/${id.toLowerCase()}`;
      return '/community';
    case 'account':
      return p.web || !id ? '/account' : null;
    default:
      return p.web ? '/' : null;
  }
}
