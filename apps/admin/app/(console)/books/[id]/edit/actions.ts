'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface EditMeta {
  title?: string;
  subtitle?: string;
  description?: string;
  genres?: string[];
  language?: string;
  age?: string;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const plain = (status: number, error: string) => {
  if (status === 403) return 'Only Publishers can edit books.';
  if (status === 404) return 'This edit was replaced by a newer one. Start again.';
  if (error.includes('another revision of this book is open'))
    return 'Another revision of this book is still in the pipeline. Publish or send it back first.';
  if (error.includes('nothing changed')) return 'Nothing changed. Edit a field or choose a new cover.';
  if (error.includes('only a live book')) return 'Only a live book can be edited here.';
  if (error.includes('title required')) return 'Add the book title.';
  return error;
};

/**
 * Edit details or Replace cover (flow 03 admin rule 1, flow 12 rule 41): the api Worker makes a new
 * revision from the live one. Details alone go to review at once; a new cover returns a signed link
 * the browser uploads to, then `finishEdit` checks it and sends the revision to review.
 */
export async function startEdit(
  bookId: string,
  meta: EditMeta,
  cover: boolean,
  note: string,
): Promise<Result<{ revision_id: string; status: string; upload?: string }>> {
  const r = await api<{ revision_id: string; status: string; upload?: string }>('/v1/books/staff-edit', {
    book_id: bookId,
    meta,
    cover,
    ...(note.trim() ? { note: note.trim() } : {}),
  });
  if (!r.ok) return { ok: false, error: plain(r.status, r.error) };
  if (!r.data.upload) revalidatePath(`/books/${bookId}`, 'layout');
  return { ok: true, data: r.data };
}

export async function finishEdit(bookId: string, revisionId: string): Promise<Result<{ status: string }>> {
  const r = await api<{ status: string }>('/v1/books/staff-edit/finish', { revision_id: revisionId });
  if (!r.ok) return { ok: false, error: plain(r.status, r.error) };
  revalidatePath(`/books/${bookId}`, 'layout');
  return { ok: true, data: r.data };
}
