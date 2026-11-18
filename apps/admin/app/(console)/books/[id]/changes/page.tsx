import { notFound } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import FixPage from '../fix/page';
import { SendBackModal } from '../../send-back-modal';

/** Send back to author from Fix flagged issues (s-book-changes): the list starts from the open flags. */
export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const [{ data: rev }, { data: flags }] = await Promise.all([
    supabase
      .from('book_revisions')
      .select(
        'id, source_type, book:books!book_revisions_book_id_fkey(title, author:profiles!books_author_id_fkey(full_name))',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('book_flags')
      .select('message')
      .eq('revision_id', id)
      .eq('status', 'open')
      .order('blocking', { ascending: false })
      .order('created_at', { ascending: true }),
  ]);
  if (!rev) notFound();
  return (
    <>
      <FixPage params={params} searchParams={Promise.resolve({})} />
      <SendBackModal
        revisionId={id}
        title={rev.book?.title ?? ''}
        author={rev.book?.author?.full_name ?? ''}
        ext={rev.source_type ?? 'docx'}
        issues={(flags ?? []).map(f => f.message)}
        source="fixer"
        closeHref={`/books/${id}/fix`}
      />
    </>
  );
}
