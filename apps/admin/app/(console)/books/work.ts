import { api } from '@/lib/api';

/** The parts of the working copy (packages/convert `WorkCopy`) the staff screens show. */
export interface Work {
  chapters: {
    title: string;
    blocks: {
      text: string;
      sceneBreak?: boolean;
      html: string;
      images?: { path: string; bytes: number; alone: boolean }[];
    }[];
  }[];
  anchors: { uids: string[]; ids: string[][] };
}

/** The working copy as the Worker serves it to staff (rule 19). Null when it cannot be loaded. */
export async function loadWork(revisionId: string): Promise<Work | null> {
  const link = await api<{ book_url: string }>('/v1/books/preview-url', { revision_id: revisionId });
  if (!link.ok) return null;
  const res = await fetch(link.data.book_url, { cache: 'no-store' }).catch(() => null);
  return res?.ok ? ((await res.json()) as Work) : null;
}
