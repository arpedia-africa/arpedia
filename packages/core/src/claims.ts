// Flow 14 rules 29 and 30: copyright claims that arrive by email, and the "matching passages"
// hint on the claim page. Similarity is a hint for staff, never a verdict: it only says which
// passages of the claimant's text appear in the book, word for word or with small changes.

/** One chapter of the book being claimed against, as plain text paragraphs. */
export interface ClaimChapter {
  title: string;
  paragraphs: string[];
}

/** What `copyright_claims.similarity` holds (read by the admin claim page). */
export interface ClaimSimilarity {
  /** Share of the flagged passages' 5-word runs found in the book, 0–100. */
  score: number;
  /** Passages of the claimant's text that were found in the book. */
  flagged: number;
  /** Passages of the claimant's text that were checked. */
  checked: number;
  /** Chapters the flagged passages were found in. */
  chapters: number;
  /** The chapter most of them were found in ("Chapter 3"). */
  chapter: string | null;
  source_title: string;
  source_label: string;
  /** Up to 6 side-by-side pairs; matching words are wrapped in [[…]]. */
  passages: { source: string; book: string }[];
}

const N = 5;
const MIN_PASSAGE_WORDS = 8;
const MAX_PASSAGES = 40;
const MAX_SHOWN = 6;
/** A passage counts as found when this share of its 5-word runs is in one paragraph. */
const FOUND = 0.5;
/** Words kept either side of the match when a book paragraph is long. */
const CONTEXT = 20;

interface Token {
  raw: string;
  norm: string;
}

const normWord = (w: string) =>
  w
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Whitespace tokens with their normalised form; tokens that are only punctuation have norm ''. */
function tokens(text: string): Token[] {
  return text
    .replace(/\[\[|\]\]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, norm: normWord(raw) }));
}

/** The 5-word runs of a token list, each with the token indexes it covers. */
function runs(toks: Token[]): { key: string; at: number[] }[] {
  const words: number[] = [];
  toks.forEach((t, i) => {
    if (t.norm) words.push(i);
  });
  const out: { key: string; at: number[] }[] = [];
  for (let i = 0; i + N <= words.length; i++) {
    const at = words.slice(i, i + N);
    out.push({ key: at.map((j) => toks[j]!.norm).join(' '), at });
  }
  return out;
}

const wordCount = (s: string) => tokens(s).filter((t) => t.norm).length;

/**
 * The passages of a claimant's text worth checking: quoted runs of 8 words or more when the
 * claimant quotes the book, else every sentence of 8 words or more. At most 40.
 */
export function claimPassages(text: string): string[] {
  const clean = text.replace(/\r/g, '').replace(/\[\[|\]\]/g, '');
  const quoted = [...clean.matchAll(/["“]([^"“”]+)["”]/g)]
    .map((m) => m[1]!.replace(/\s+/g, ' ').trim())
    .filter((q) => wordCount(q) >= MIN_PASSAGE_WORDS);
  const list = quoted.length
    ? quoted
    : clean
        .split(/\n\s*\n|(?<=[.!?])\s+/)
        .map((s) => s.replace(/\s+/g, ' ').trim())
        .filter((s) => wordCount(s) >= MIN_PASSAGE_WORDS);
  return [...new Set(list)].slice(0, MAX_PASSAGES);
}

/** Wraps the marked tokens in [[…]], joining neighbours (and punctuation between them) into one run. */
function marked(toks: Token[], mark: Set<number>, from = 0, to = toks.length): string {
  const out: string[] = [];
  let open = false;
  for (let i = from; i < to; i++) {
    const on: boolean = mark.has(i) || (open && !toks[i]!.norm && mark.has(i + 1));
    if (on && !open) out.push('[[');
    if (!on && open) out.push(']] ');
    open = on;
    out.push(toks[i]!.raw, ' ');
  }
  let s = out.join('').replace(/ (?=\]\])/g, '');
  if (open) s = s.trimEnd() + ']]';
  return s.replace(/ \]\] /g, ']] ').trim();
}

/** A long book paragraph is cut to the match with 20 words either side. */
function window(toks: Token[], mark: Set<number>): string {
  if (toks.length <= CONTEXT * 6 || mark.size === 0) return marked(toks, mark);
  const first = Math.min(...mark);
  const last = Math.max(...mark);
  const from = Math.max(0, first - CONTEXT);
  const to = Math.min(toks.length, last + CONTEXT + 1);
  return `${from > 0 ? '… ' : ''}${marked(toks, mark, from, to)}${to < toks.length ? ' …' : ''}`;
}

/**
 * Which of the claimant's passages appear in the book. A passage is flagged when half or more
 * of its 5-word runs are in one paragraph of the book; `score` is the share of the flagged
 * passages' runs found there.
 */
export function claimSimilarity(claimText: string, book: ClaimChapter[]): ClaimSimilarity {
  const passages = claimPassages(claimText);
  // Every 5-word run of the book → the paragraphs it is in.
  const paras: { chapter: number; toks: Token[]; runs: { key: string; at: number[] }[] }[] = [];
  const index = new Map<string, number[]>();
  book.forEach((ch, c) => {
    for (const text of ch.paragraphs) {
      const toks = tokens(text);
      const r = runs(toks);
      if (!r.length) continue;
      const p = paras.push({ chapter: c, toks, runs: r }) - 1;
      for (const { key } of r) {
        const list = index.get(key);
        if (!list) index.set(key, [p]);
        else if (list[list.length - 1] !== p) list.push(p);
      }
    }
  });

  const found: {
    ratio: number;
    hits: number;
    size: number;
    chapter: number;
    source: string;
    book: string;
  }[] = [];
  let checked = 0;
  for (const passage of passages) {
    const toks = tokens(passage);
    const r = runs(toks);
    const keys = new Set(r.map((x) => x.key));
    if (!keys.size) continue;
    checked++;
    const hits = new Map<number, number>();
    for (const k of keys) for (const p of index.get(k) ?? []) hits.set(p, (hits.get(p) ?? 0) + 1);
    let best = -1;
    let bestHits = 0;
    for (const [p, h] of hits) if (h > bestHits) [best, bestHits] = [p, h];
    if (best < 0 || bestHits / keys.size < FOUND) continue;
    const para = paras[best]!;
    const paraKeys = new Set(para.runs.map((x) => x.key));
    const srcMark = new Set(r.filter((x) => paraKeys.has(x.key)).flatMap((x) => x.at));
    const bookMark = new Set(para.runs.filter((x) => keys.has(x.key)).flatMap((x) => x.at));
    found.push({
      ratio: bestHits / keys.size,
      hits: bestHits,
      size: keys.size,
      chapter: para.chapter,
      source: marked(toks, srcMark),
      book: window(para.toks, bookMark),
    });
  }

  const perChapter = new Map<number, number>();
  for (const f of found) perChapter.set(f.chapter, (perChapter.get(f.chapter) ?? 0) + 1);
  let top: number | null = null;
  for (const [c, n] of perChapter) if (top === null || n > perChapter.get(top)!) top = c;
  const size = found.reduce((s, f) => s + f.size, 0);
  const hits = found.reduce((s, f) => s + f.hits, 0);

  return {
    score: size ? Math.round((hits / size) * 100) : 0,
    flagged: found.length,
    checked,
    chapters: perChapter.size,
    chapter: top === null ? null : book[top]!.title.trim() || `Chapter ${top + 1}`,
    source_title: "the claimant's text",
    source_label: 'From the claimant',
    passages: [...found]
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, MAX_SHOWN)
      .map(({ source, book: b }) => ({ source, book: b })),
  };
}

// ─── Email intake ────────────────────────────────────────────────────────────

export type ClaimType = 'copyright' | 'plagiarism' | 'impersonation';

/** The claim type an email asks about, from its subject first, then its body. Copyright by default. */
export function claimTypeOf(subject: string, body: string): ClaimType {
  for (const text of [subject, body]) {
    const t = text.toLowerCase();
    if (/plagiari[sz]/.test(t)) return 'plagiarism';
    if (/impersonat|pretending to be|posing as/.test(t)) return 'impersonation';
    if (/copyright|infring|pirat|stolen|without (my|our) permission/.test(t)) return 'copyright';
  }
  return 'copyright';
}

/** True when the email went to the copyright address (to or cc). */
export function isClaimAddress(to: unknown, address = 'copyright@arpedia.africa'): boolean {
  const list = Array.isArray(to) ? to : [to];
  return list.some((v) => {
    const s =
      typeof v === 'string'
        ? v
        : typeof (v as { email?: unknown })?.email === 'string'
          ? (v as { email: string }).email
          : '';
    return s.toLowerCase().includes(address);
  });
}

/** The sender's display name ("Barr. Yetunde Coker <legal@…>" → "Barr. Yetunde Coker"), else null. */
export function senderName(from: unknown): string | null {
  const s =
    typeof from === 'string'
      ? from
      : typeof (from as { name?: unknown })?.name === 'string'
        ? (from as { name: string }).name
        : '';
  const name = s
    .replace(/<[^>]*>/g, '')
    .replace(/["']/g, '')
    .trim();
  return name && !name.includes('@') ? name.slice(0, 120) : null;
}
