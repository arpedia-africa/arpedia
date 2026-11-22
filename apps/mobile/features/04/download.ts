// Download for offline from the book page (flow 03 rule 15, flow 04 rule 70): the whole book when
// the reader owns it, else their unlocked chapters plus the free preview, else the preview only.
import { supabase } from '@/lib/supabase';
import { BookFiles } from './bookfiles';
import type { ReaderState } from './state';

export type DownloadScope = 'whole' | 'some' | 'preview';

/** Reads the scope from the server first, then saves every file in it (ciphertext, resumes). */
export async function downloadBook(
  bookId: string,
  onScope?: (scope: DownloadScope) => void,
): Promise<DownloadScope> {
  const { data, error } = await supabase.rpc('get_reader_state', { p_book: bookId });
  if (error) throw error;
  const st = data as unknown as ReaderState;
  const owns = st.owns_book || st.is_author;
  const scope: DownloadScope = owns
    ? 'whole'
    : st.chapters.some((c) => c.access === 'unlocked')
      ? 'some'
      : 'preview';
  onScope?.(scope);
  await new BookFiles(bookId, st.revision.id, owns).downloadAll();
  return scope;
}

export const DOWNLOAD_STARTED: Record<DownloadScope, string> = {
  whole: 'Downloading for offline',
  some: 'Downloading your chapters and the free preview',
  preview: 'Downloading the free preview only. Unlock the book to read all of it offline.',
};
