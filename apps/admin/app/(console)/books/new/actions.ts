'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface NewBook {
  authorId: string;
  title: string;
  sourceType: 'docx' | 'epub' | 'pdf';
  subtitle?: string;
  description?: string;
  genres?: string[];
  language?: string;
  age?: string;
}

export interface Started {
  revision_id: string;
  book_id: string;
  expires_at: string;
  uploads: { source: string; cover: string; converted?: string };
}

/**
 * Upload a book for an author (rule 51): `create_revision` through the Worker with the author and the
 * rights confirmation; the upload is logged against this staff member and the author is told.
 * Returns signed object URLs the browser uploads to directly.
 */
export async function startUpload(b: NewBook): Promise<{ ok: true; data: Started } | { ok: false; error: string }> {
  const meta = {
    source_type: b.sourceType,
    title: b.title.trim(),
    author_id: b.authorId,
    rights_confirmed: true,
    ...(b.subtitle?.trim() ? { subtitle: b.subtitle.trim() } : {}),
    ...(b.description?.trim() ? { description: b.description.trim() } : {}),
    ...(b.genres?.length ? { genres: b.genres } : {}),
    ...(b.language ? { language: b.language } : {}),
    ...(b.age ? { age: b.age } : {}),
  };
  const r = await api<Started>('/v1/books/upload', { meta });
  if (!r.ok) {
    if (r.error.includes('not an author')) return { ok: false, error: 'That person is not an author yet.' };
    if (r.status === 403) return { ok: false, error: 'Only publishers can upload books for authors.' };
    return { ok: false, error: r.error };
  }
  return { ok: true, data: r.data };
}

/**
 * The files are in: verify an EPUB straight away; a Word file goes to the desk for conversion
 * (there is no in-browser converter), and a PDF always does (rule 20).
 */
export async function finishUpload(
  revisionId: string,
  converted: boolean,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const r = await api<{ status: string }>('/v1/books/finalize', {
    revision_id: revisionId,
    converted,
    ...(converted ? {} : { reason: 'conversion_skipped' }),
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath('/books');
  return { ok: true, status: r.data.status };
}
