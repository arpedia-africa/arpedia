import { notFound } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import ReviewPage from '../review/page';
import { SendBackModal } from '../../send-back-modal';

/** Send back from Quick review (s-book-sendback): no flags, so the list starts empty (rule 36). */
export default async function SendBackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const { data: rev } = await supabase
    .from('book_revisions')
    .select('id, source_type, book:books!book_revisions_book_id_fkey(title, author:profiles!books_author_id_fkey(full_name))')
    .eq('id', id)
    .maybeSingle();
  if (!rev) notFound();
  return (
    <>
      <ReviewPage params={params} />
      <SendBackModal
        revisionId={id}
        title={rev.book?.title ?? ''}
        author={rev.book?.author?.full_name ?? ''}
        ext={rev.source_type ?? 'docx'}
        issues={[]}
        source="quick_review"
        closeHref={`/books/${id}/review`}
      />
    </>
  );
}
