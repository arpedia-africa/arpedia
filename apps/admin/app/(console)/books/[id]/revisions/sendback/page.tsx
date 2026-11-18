import { notFound } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase/server';
import RevisionsPage from '../page';
import { SendBackModal } from '../../../send-back-modal';

/** Send back an update from Revisions: the open flags start the issue list, as on Fix flagged issues. */
export default async function RevisionSendBackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const [{ data: rev }, { data: flags }] = await Promise.all([
    supabase
      .from('book_revisions')
      .select(
        'id, status, source_type, book:books!book_revisions_book_id_fkey(title, author:profiles!books_author_id_fkey(full_name))',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('book_flags')
      .select('message')
      .eq('revision_id', id)
      .eq('status', 'open')
      .order('blocking', { ascending: false })
      .order('created_at'),
  ]);
  if (!rev) notFound();
  const issues = (flags ?? []).map(f => f.message);
  return (
    <>
      <RevisionsPage params={params} />
      <SendBackModal
        revisionId={id}
        title={rev.book?.title ?? ''}
        author={rev.book?.author?.full_name ?? ''}
        ext={rev.source_type ?? 'docx'}
        issues={issues}
        source={rev.status === 'needs_fixes' ? 'fixer' : 'quick_review'}
        closeHref={`/books/${id}/revisions`}
      />
    </>
  );
}
