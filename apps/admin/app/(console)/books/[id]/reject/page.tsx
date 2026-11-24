import { notFound } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import ReviewPage from '../review/page';
import { RejectModal } from './modal';

/** Reject from Quick review (rule 39), drawn over the review like Send back. */
export default async function RejectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const { data: rev } = await supabase
    .from('book_revisions')
    .select('id, book:books!book_revisions_book_id_fkey(title, author:profiles!books_author_id_fkey(full_name))')
    .eq('id', id)
    .maybeSingle();
  if (!rev) notFound();
  return (
    <>
      <ReviewPage params={params} />
      <RejectModal
        revisionId={id}
        title={rev.book?.title ?? ''}
        author={rev.book?.author?.full_name ?? ''}
        closeHref={`/books/${id}/review`}
      />
    </>
  );
}
