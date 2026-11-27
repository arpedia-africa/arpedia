import { notFound, redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import BookDetailPage from '../page';
import { EditBookModal } from './client';

const OPEN = ['draft', 'processing', 'with_desk', 'needs_fixes', 'ready_for_review', 'scheduled'] as const;

/**
 * Edit details and Replace cover (s-book ⋯ menu, flow 03 admin rule 1, flow 12 rule 41), drawn over
 * the book's Details tab. `?cover=1` opens the cover. Both save a new revision through the api
 * Worker; readers keep the live one until another Publisher publishes it.
 */
export default async function EditBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cover?: string }>;
}) {
  const { id } = await params;
  const { cover } = await searchParams;
  const supabase = await serverSupabase();
  const { data: book } = await supabase
    .from('books')
    .select('id, title, subtitle, description, genres, status, current_revision_id')
    .eq('id', id)
    .maybeSingle();
  if (!book) notFound();
  if (book.status !== 'live' || !book.current_revision_id) redirect(`/books/${id}`);

  const [{ data: rev }, { data: open }, { data: genreRows }] = await Promise.all([
    supabase
      .from('book_revisions')
      .select('revision_no, language, age_rating')
      .eq('id', book.current_revision_id)
      .maybeSingle(),
    supabase
      .from('book_revisions')
      .select('revision_no')
      .eq('book_id', id)
      .in('status', [...OPEN])
      .order('revision_no', { ascending: false })
      .limit(1),
    supabase.from('books').select('genres').in('status', ['live', 'scheduled']).limit(500),
  ]);
  const blocking = open?.[0];
  const genres = [...new Set([...(genreRows ?? []).flatMap(b => b.genres ?? []), ...book.genres])].sort();

  return (
    <>
      <BookDetailPage params={params} />
      <EditBookModal
        bookId={id}
        mode={cover ? 'cover' : 'details'}
        liveNo={rev?.revision_no ?? 1}
        openNo={blocking?.revision_no ?? null}
        genres={genres}
        current={{
          title: book.title,
          subtitle: book.subtitle ?? '',
          description: book.description ?? '',
          genres: book.genres,
          language: rev?.language ?? 'en',
          age: rev?.age_rating ?? 'Everyone',
        }}
      />
    </>
  );
}
