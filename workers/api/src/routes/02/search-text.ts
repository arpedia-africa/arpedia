// Story search index (docs/prd/02-discovery.md, book_search_text). Only the free preview is ever
// indexed: the text up to the preview cut, one row per chapter. Runs from the cron: each live
// revision without rows is indexed once from its sealed working copy (flow 12).
import type { Json } from '@arpedia/core';
import type { WorkCopy } from '@arpedia/convert';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import { loadWork } from '../12/pipeline';

/** Longest text stored per chapter row (the generated tsvector reads the first 100,000). */
const MAX_ROW = 100_000;

export interface SearchTextRow {
  ord: number;
  text: string;
}

/** Preview text by chapter ord: every block up to and including the cut, front matter skipped. */
export function previewText(work: Pick<WorkCopy, 'chapters' | 'preview'>): SearchTextRow[] {
  const { chapter: cutChapter, paragraph: cutPara } = work.preview;
  const rows: SearchTextRow[] = [];
  work.chapters.forEach((c, ord) => {
    if (ord > cutChapter || c.front) return;
    const blocks = ord === cutChapter ? c.blocks.slice(0, cutPara + 1) : c.blocks;
    const text = blocks
      .map((b) => b.text.trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, MAX_ROW);
    if (text) rows.push({ ord, text });
  });
  return rows;
}

/** Index up to `limit` live revisions that have no search text yet. */
export async function indexSearchText(env: Env, limit = 5) {
  const db = serviceDb(env);
  const { data, error } = await db.rpc('revisions_needing_search_text', { p_limit: limit });
  if (error) throw error;
  for (const rev of data ?? []) {
    const work = await loadWork(env, rev.revision_id, rev.work_version);
    if (!work) continue;
    const { error: e } = await db.rpc('set_book_search_text', {
      p_rev: rev.revision_id,
      p_rows: previewText(work) as unknown as Json,
    });
    if (e) throw e;
  }
}
