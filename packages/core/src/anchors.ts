// Paragraph anchors (docs/prd/12-book-pipeline.md rule 16). Paragraph ids survive updates so
// highlights and passage discussions stay put; removed paragraphs map to the nearest kept one.

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** New paragraph id: `p_` plus 10 base32 characters. */
export function newParaId(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
) {
  return 'p_' + Array.from(random(10), (b) => BASE32[b & 31]).join('');
}

/** Lower-cased text with punctuation and symbols removed and whitespace collapsed. */
export const normaliseText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** SHA-1 of the normalised text, hex. */
export async function fingerprint(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(normaliseText(text)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const trigrams = (text: string) => {
  const w = normaliseText(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  if (w.length < 3) out.add(w.join(' '));
  for (let i = 0; i + 3 <= w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
};

/** Share of word 3-grams two paragraphs have in common (of the larger set). */
export function trigramOverlap(a: string, b: string): number {
  const x = trigrams(a);
  const y = trigrams(b);
  let common = 0;
  for (const g of x) if (y.has(g)) common++;
  return common / Math.max(x.size, y.size, 1);
}

export const FUZZY_OVERLAP = 0.6;

export interface BasePara {
  id: string;
  fp: string;
  text: string;
}
export interface NextPara {
  fp: string;
  text: string;
}
export interface AnchorMigration {
  old_para_id: string;
  new_para_id: null;
  nearest_para_id: string;
  method: 'nearest';
}
export interface Alignment {
  /** Id for each paragraph of the new chapter. */
  ids: string[];
  method: ('exact' | 'fuzzy' | 'new')[];
  /** Old paragraphs with no match, each pointed at the nearest preceding kept paragraph. */
  migrations: AnchorMigration[];
}

/** Longest common subsequence of two fingerprint lists, as index pairs in order. */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

/**
 * Align a chapter's new paragraphs with the base revision's: exact fingerprint matches in order
 * (LCS) keep their ids; between matches, pairs with ≥ 60% 3-gram overlap keep theirs; the rest are
 * new. `fallback` is used for a removed paragraph with no kept paragraph before it.
 */
export function alignParagraphs(
  base: BasePara[],
  next: NextPara[],
  makeId: () => string = () => newParaId(),
  fallback?: string,
): Alignment {
  const pairs = lcs(
    base.map((p) => p.fp),
    next.map((p) => p.fp),
  );
  const ids: (string | null)[] = next.map(() => null);
  const method: Alignment['method'] = next.map(() => 'new');
  const kept = new Set<number>();
  for (const [i, j] of pairs) {
    ids[j] = base[i]!.id;
    method[j] = 'exact';
    kept.add(i);
  }
  // fuzzy matches inside each gap between exact matches, in order
  const bounds: [number, number][] = [[-1, -1], ...pairs, [base.length, next.length]];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [i0, j0] = bounds[k]!;
    const [i1, j1] = bounds[k + 1]!;
    let from = i0 + 1;
    for (let j = j0 + 1; j < j1; j++) {
      for (let i = from; i < i1; i++) {
        if (trigramOverlap(base[i]!.text, next[j]!.text) >= FUZZY_OVERLAP) {
          ids[j] = base[i]!.id;
          method[j] = 'fuzzy';
          kept.add(i);
          from = i + 1;
          break;
        }
      }
    }
  }
  const finalIds = ids.map((id) => id ?? makeId());
  const migrations: AnchorMigration[] = [];
  let nearest: string | undefined;
  base.forEach((p, i) => {
    if (kept.has(i)) nearest = p.id;
    else {
      const to = nearest ?? fallback ?? finalIds[0];
      if (to)
        migrations.push({ old_para_id: p.id, new_para_id: null, nearest_para_id: to, method: 'nearest' });
    }
  });
  return { ids: finalIds, method, migrations };
}

export interface ChapterPrint {
  title: string;
  fps: string[];
}

/** Share of the larger chapter's paragraphs the two chapters share exactly. */
export function chapterOverlap(a: string[], b: string[]): number {
  const y = new Set(b);
  return a.filter((f) => y.has(f)).length / Math.max(a.length, b.length, 1);
}

const titleKey = (t: string) => normaliseText(t);

/**
 * Match new chapters to base chapters so they keep `chapter_uid`: the best unused base chapter with
 * at least 60% paragraph overlap (ties go to the same title). Empty chapters match by title.
 * Returns the base index for each new chapter, or null for a new chapter.
 */
export function matchChapters(base: ChapterPrint[], next: ChapterPrint[]): (number | null)[] {
  const used = new Set<number>();
  return next.map((n) => {
    let best: number | null = null;
    let bestScore = -1;
    base.forEach((b, i) => {
      if (used.has(i)) return;
      const empty = b.fps.length === 0 && n.fps.length === 0;
      const sameTitle = titleKey(b.title) === titleKey(n.title);
      const overlap = empty ? (sameTitle ? 1 : 0) : chapterOverlap(b.fps, n.fps);
      if (overlap < FUZZY_OVERLAP) return;
      const score = overlap + (sameTitle ? 0.001 : 0);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best !== null) used.add(best);
    return best;
  });
}
