import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { coverClass } from '../../books/shared';
import { TrendingEditor, type ShelfBook } from './client';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Edit Trending this week (s-curation-trending): order, pins, draft vs live, rotation, taps. */
export default async function TrendingPage() {
  const staff = await requireStaff();
  if (!canOpen('curation', staff.permissions))
    return <NoAccess page="curation" label="Discover curation" role={staff.role} />;
  const supabase = await serverSupabase();
  const { data: section } = await supabase
    .from('home_sections')
    .select('id, title, config, updated_at, editor:profiles!home_sections_updated_by_fkey(full_name)')
    .eq('key', 'trending')
    .maybeSingle();
  if (!section) notFound();

  const [live, draft, taps] = await Promise.all([
    supabase
      .from('shelf_items')
      .select('item_id, position, pinned, excluded')
      .eq('section_id', section.id)
      .eq('item_type', 'book')
      .order('position'),
    supabase
      .from('shelf_drafts')
      .select('item_id, position, pinned, excluded')
      .eq('section_id', section.id)
      .eq('item_type', 'book')
      .order('position'),
    supabase
      .from('shelf_tap_counts')
      .select('week_start, position, taps')
      .eq('section_key', 'trending')
      .order('week_start', { ascending: false })
      .limit(40),
  ]);
  const ids = [...new Set([...(live.data ?? []), ...(draft.data ?? [])].map(r => r.item_id))];
  const { data: books } = ids.length
    ? await supabase.from('catalog_books').select('id, title, author_name').in('id', ids)
    : { data: [] as { id: string | null; title: string | null; author_name: string | null }[] };
  const byId = new Map((books ?? []).map(b => [b.id!, b]));
  const toBook = (r: { item_id: string; pinned: boolean }): ShelfBook => {
    const b = byId.get(r.item_id);
    return {
      id: r.item_id,
      title: b?.title ?? 'No longer live',
      author: b?.author_name ?? '',
      pinned: r.pinned,
      live: !!b,
      cover: coverClass(r.item_id),
    };
  };
  const liveBooks = (live.data ?? []).filter(r => !r.excluded).map(toBook);
  const draftBooks = draft.data?.length ? draft.data.filter(r => !r.excluded).map(toBook) : null;

  // Last full week (Monday start, as date_trunc('week')); this week is still counting.
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const week = taps.data?.find(t => t.week_start < monday.toISOString().slice(0, 10))?.week_start;
  const lastWeek = (taps.data ?? []).filter(t => t.week_start === week).sort((a, b) => a.position - b.position);
  const cfg = (section.config ?? {}) as { rotate_weekly?: boolean };

  return (
    <TrendingEditor
      sectionId={section.id}
      live={liveBooks}
      draft={draftBooks}
      rotate={cfg.rotate_weekly ?? false}
      edited={section.editor?.full_name ? `Last edited by ${section.editor.full_name}, ${day(section.updated_at)}` : null}
      taps={lastWeek.map(t => ({ position: t.position + 1, taps: t.taps }))}
      tapsWeek={week ? new Date(week).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null}
    />
  );
}
