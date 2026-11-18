import { notFound, redirect } from 'next/navigation';
import { getStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import RevisionsPage from '../revisions/page';
import { UnpublishModal } from './client';

/**
 * Unpublish book (s-book-unpublish) for a live book. The prototype draws it over the book's Details
 * tab, which flow 03 builds; until then it opens over the book's Revisions tab.
 */
export default async function UnpublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverSupabase();
  const [{ data: book }, staff, preview] = await Promise.all([
    supabase.from('books').select('id, title, status').eq('id', id).maybeSingle(),
    getStaff(),
    supabase.rpc('unpublish_preview', { p_book: id }),
  ]);
  if (!book) notFound();
  if (book.status !== 'live') redirect(`/books/${id}/revisions`);
  const counts = (preview.data ?? {}) as { readers?: number; credits?: number };
  return (
    <>
      <RevisionsPage params={params} />
      <UnpublishModal
        bookId={book.id}
        title={book.title}
        readers={counts.readers ?? 0}
        credits={counts.credits ?? 0}
        superAdmin={staff?.role === 'super_admin'}
        closeHref={`/books/${id}/revisions`}
      />
    </>
  );
}
