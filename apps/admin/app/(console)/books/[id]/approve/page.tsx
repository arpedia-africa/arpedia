import { notFound } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import ReviewPage from '../review/page';
import { ApproveModal } from '../review/client';

const n0 = (n: number) => n.toLocaleString('en-NG');

/** Approve and publish over Quick review (s-book-approve, rules 37–38). */
export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const { data: rev } = await supabase
    .from('book_revisions')
    .select(
      'id, words, pages, price_credits, book:books!book_revisions_book_id_fkey(id, title, author:profiles!books_author_id_fkey(full_name))',
    )
    .eq('id', id)
    .maybeSingle();
  if (!rev) notFound();
  const price = rev.price_credits ?? 0;
  return (
    <>
      <ReviewPage params={params} />
      <ApproveModal
        revisionId={id}
        bookId={rev.book?.id ?? ''}
        title={rev.book?.title ?? ''}
        author={rev.book?.author?.full_name ?? ''}
        working={`${n0(rev.words ?? 0)} words → ${n0(rev.pages ?? 0)} pages → ${n0(price)} credits (₦${n0(price * 3)})`}
        price={`${n0(price)} credits`}
        closeHref={`/books/${id}/review`}
      />
    </>
  );
}
