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
  if (error.includes('another revision of this book is open'))
    return 'Another revision of this book is still in the pipeline. Publish or send it back first.';
  if (error.includes('nothing changed')) return 'Nothing changed. Edit a field or choose a new cover.';
  if (error.includes('only a live book')) return 'Only a live book can be edited here.';
  if (error.includes('book not found')) return 'This book no longer exists.';
  if (error.includes('title required')) return 'Add the book title.';
  if (error.includes('at least one genre')) return 'Pick at least one genre.';
  return error;
};

/** Replace cover, step 1: a signed link the browser uploads the new cover to (nothing is saved yet). */
export async function startCover(bookId: string): Promise<Result<{ cover_token: string; upload: string; expires_at: string }>> {
  const r = await api<{ cover_token: string; upload: string; expires_at: string }>('/v1/books/staff-edit/cover', {
    book_id: bookId,
  });
  if (!r.ok) return { ok: false, error: plain(r.status, r.error) };
  return { ok: true, data: r.data };
}

/**
 * Edit details or Replace cover (flow 03 admin rule 1, flow 12 rule 41): the api Worker makes a new
 * revision from the live one (with the uploaded cover when `coverToken` is set) and sends it to review.
 */
export async function saveEdit(
  bookId: string,
  meta: EditMeta,
  note: string,
  coverToken?: string,
): Promise<Result<{ revision_id: string; revision_no: number; status: string }>> {
  const r = await api<{ revision_id: string; revision_no: number; status: string }>('/v1/books/staff-edit', {
    book_id: bookId,
    meta,
    ...(note.trim() ? { note: note.trim() } : {}),
    ...(coverToken ? { cover_token: coverToken } : {}),
  });
  if (!r.ok) return { ok: false, error: plain(r.status, r.error) };
  revalidatePath(`/books/${bookId}`, 'layout');
  return { ok: true, data: r.data };
}
