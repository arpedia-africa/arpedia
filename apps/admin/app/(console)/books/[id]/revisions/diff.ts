import type { Work } from '../../work';

/** One run of a word diff: kept, removed or added words. */
export type Seg = { t: 'eq' | 'del' | 'ins'; s: string };

/** A changed passage: consecutive changed, removed or added paragraphs of one chapter (rule 47). */
export interface Passage {
  /** "chapter 14", or the chapter's title in quotes when it has no number. */
  where: string;
  /** Each paragraph as diff runs. */
  paras: Seg[][];
}

const tokens = (t: string) => t.split(/\s+/).filter(Boolean);

/** Word-level diff of two paragraphs (LCS); a very long pair falls back to remove-all, add-all. */
export function wordDiff(a: string, b: string): Seg[] {
  const x = tokens(a);
  const y = tokens(b);
  if (x.length * y.length > 250_000)
    return [
      { t: 'del', s: x.join(' ') },
      { t: 'ins', s: y.join(' ') },
    ];
  const L = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      L[i]![j] = x[i] === y[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const out: Seg[] = [];
  const push = (t: Seg['t'], w: string) => {
    const last = out[out.length - 1];
    if (last?.t === t) last.s += ` ${w}`;
    else out.push({ t, s: w });
  };
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      push('eq', x[i++]!);
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) push('del', x[i++]!);
    else push('ins', y[j++]!);
  }
  while (i < x.length) push('del', x[i++]!);
  while (j < y.length) push('ins', y[j++]!);
  // A removal directly followed by its replacement reads better as del then ins.
  for (let k = 0; k + 2 < out.length; k++)
    if (out[k]!.t === 'ins' && out[k + 1]!.t === 'del') [out[k], out[k + 1]] = [out[k + 1]!, out[k]!];
  return out;
}

/**
 * Changed passages between a base and a new working copy, paragraphs aligned by their ids (which
 * the pipeline keeps for matched paragraphs, rule 16). `label` names a chapter by its uid.
 */
export function passages(base: Work, next: Work, label: (uid: string, title: string) => string): Passage[] {
  const baseAt = new Map<string, number>();
  base.anchors.uids.forEach((u, i) => baseAt.set(u, i));
  const out: Passage[] = [];
  next.chapters.forEach((ch, i) => {
    const uid = next.anchors.uids[i]!;
    const where = label(uid, ch.title);
    const nIds = next.anchors.ids[i] ?? [];
    const bi = baseAt.get(uid);
    if (bi === undefined) {
      // A new chapter: its opening paragraphs, all added.
      const paras = ch.blocks
        .filter(b => b.text.trim())
        .slice(0, 2)
        .map(b => [{ t: 'ins' as const, s: b.text }]);
      if (paras.length) out.push({ where, paras });
      return;
    }
    const bIds = base.anchors.ids[bi] ?? [];
    const bText = base.chapters[bi]!.blocks.map(b => b.text);
    const nSet = new Set(nIds);
    const bSet = new Set(bIds);
    let run: Seg[][] = [];
    const flush = () => {
      if (run.length) out.push({ where, paras: run });
      run = [];
    };
    let b = 0;
    let n = 0;
    while (b < bIds.length || n < nIds.length) {
      if (b < bIds.length && n < nIds.length && bIds[b] === nIds[n]) {
        const old = bText[b]!;
        const now = ch.blocks[n]!.text;
        if (old === now) flush();
        else run.push(wordDiff(old, now));
        b++;
        n++;
      } else if (b < bIds.length && (!nSet.has(bIds[b]!) || n >= nIds.length)) {
        if (bText[b]!.trim()) run.push([{ t: 'del', s: bText[b]! }]);
        b++;
      } else {
        const now = ch.blocks[n]!.text;
        if (now.trim() && !bSet.has(nIds[n]!)) run.push([{ t: 'ins', s: now }]);
        n++;
      }
    }
    flush();
  });
  return out;
}
