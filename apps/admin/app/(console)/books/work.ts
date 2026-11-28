import type { WorkCopy } from '@arpedia/convert';
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
  return (await loadWorkCopy(revisionId))?.work ?? null;
}

/**
 * The whole working copy (packages/convert `WorkCopy`), with the link its images are under, for
 * the reader preview (rule 19). Null when it cannot be loaded.
 */
export async function loadWorkCopy(
  revisionId: string,
): Promise<{ work: WorkCopy; imagesUrl: string } | null> {
  const link = await api<{ book_url: string; images_url: string }>('/v1/books/preview-url', {
    revision_id: revisionId,
  });
  if (!link.ok) return null;
  const res = await fetch(link.data.book_url, { cache: 'no-store' }).catch(() => null);
  const work = res?.ok ? ((await res.json().catch(() => null)) as WorkCopy | null) : null;
  return work ? { work, imagesUrl: link.data.images_url } : null;
}

/** Image bytes (base64) by path in the book, up to `budget` bytes in all; the rest show blank. */
export async function loadImages(
  imagesUrl: string,
  images: Record<string, string>,
  budget = 3_000_000,
): Promise<Record<string, string>> {
  const got = await Promise.all(
    Object.entries(images).map(async ([target, src]) => {
      const res = await fetch(imagesUrl + src.split('/').map(encodeURIComponent).join('/'), {
        cache: 'no-store',
      }).catch(() => null);
      return [target, res?.ok ? new Uint8Array(await res.arrayBuffer()) : null] as const;
    }),
  );
  const out: Record<string, string> = {};
  let used = 0;
  for (const [target, bytes] of got) {
    if (!bytes || used + bytes.length > budget) continue;
    used += bytes.length;
    out[target] = Buffer.from(bytes).toString('base64');
  }
  return out;
}
