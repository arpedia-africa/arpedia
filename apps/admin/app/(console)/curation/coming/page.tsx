import CurationPage from '../page';
import { serverSupabase } from '@/lib/supabase/server';
import { ComingDrawer, type Candidate } from './client';
import { coverClass } from '../../books/shared';

/**
 * Coming soon entry (s-curation-coming): a drawer over Discover curation. Picks a scheduled book
 * (`?book=`; the first entry, else the first scheduled book), its 140-character teaser and the
 * release date, which follows the book's schedule, and a warning when a copyright claim is open.
 */
export default async function ComingPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const { book } = await searchParams;
  const supabase = await serverSupabase();
  const [revs, entries] = await Promise.all([
    supabase
      .from('book_revisions')
      .select('book_id, schedule_at, book:books!book_revisions_book_id_fkey(title, author:profiles!books_author_id_fkey(full_name))')
      .eq('status', 'scheduled')
      .order('schedule_at'),
    supabase.from('coming_soon_entries').select('book_id, teaser, release_at, notify_count'),
  ]);
  const byBook = new Map((entries.data ?? []).map(e => [e.book_id, e]));
  // An open copyright claim (new or waiting on the author) warns before the book launches.
  const ids = (revs.data ?? []).map(r => r.book_id);
  const { data: claims } = ids.length
    ? await supabase
        .from('copyright_claims')
        .select('book_id, claimant_name, created_at')
        .in('book_id', ids)
        .in('status', ['new', 'waiting_on_author'])
        .order('created_at')
    : { data: [] };
  const claimOf = new Map<string, string>();
  for (const cl of claims ?? []) if (!claimOf.has(cl.book_id)) claimOf.set(cl.book_id, cl.claimant_name);
  const candidates: Candidate[] = (revs.data ?? []).map(r => {
    const e = byBook.get(r.book_id);
    return {
      bookId: r.book_id,
      title: r.book?.title ?? 'Untitled',
      author: r.book?.author?.full_name ?? '',
      releaseAt: r.schedule_at ?? e?.release_at ?? null,
      teaser: e?.teaser ?? '',
      notify: e?.notify_count ?? 0,
      onShelf: !!e,
      cover: coverClass(r.book_id),
      claimant: claimOf.get(r.book_id) ?? null,
    };
  });
  const pick =
    candidates.find(c => c.bookId === book) ?? candidates.find(c => c.onShelf) ?? candidates[0] ?? null;
  return (
    <>
      <CurationPage />
      <ComingDrawer candidates={candidates} initial={pick?.bookId ?? null} />
    </>
  );
}
