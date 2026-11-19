import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { CurationView, type SectionRow } from './client';

const KIND = { curated: 'Curated', automatic: 'Automatic', algorithm: 'Algorithm' } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const plural = (n: number, one: string) => `${n.toLocaleString('en-NG')} ${one}${n === 1 ? '' : 's'}`;

/** Discover curation (s-curation): Home sections in app order, show/hide, who edited, Edit. */
export default async function CurationPage() {
  const staff = await requireStaff();
  if (!canOpen('curation', staff.permissions))
    return <NoAccess page="curation" label="Discover curation" role={staff.role} />;
  const supabase = await serverSupabase();
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [sections, items, arrivals, coming, genres] = await Promise.all([
    supabase
      .from('home_sections')
      .select('id, key, title, kind, position, visible, config, updated_at, editor:profiles!home_sections_updated_by_fkey(full_name)')
      .order('position'),
    supabase.from('shelf_items').select('section_id, item_type, pinned, excluded'),
    supabase.from('catalog_books').select('id', { count: 'exact', head: true }).gte('published_at', since),
    supabase.from('coming_soon_entries').select('book_id', { count: 'exact', head: true }),
    supabase.from('genre_book_counts').select('id, visible'),
  ]);
  const rows = items.data ?? [];

  const detail = (s: NonNullable<typeof sections.data>[number]): string => {
    const mine = rows.filter(r => r.section_id === s.id);
    const live = mine.filter(r => !r.excluded);
    const pins = mine.filter(r => r.pinned).length;
    const out = mine.filter(r => r.excluded).length;
    const cfg = (s.config ?? {}) as { interest_weight?: number };
    const parts: string[] = [KIND[s.kind as keyof typeof KIND] ?? s.kind];
    switch (s.key) {
      case 'trending':
        parts.push(plural(live.length, 'book'));
        break;
      case 'authors':
        parts.push(plural(live.length, 'author'));
        break;
      case 'new_arrivals':
        parts.push(`last 30 days, ${plural(arrivals.count ?? 0, 'book')}`);
        break;
      case 'top10':
        parts.push(pins || out ? `${plural(pins, 'pin')}, ${out} excluded` : 'most read this week');
        break;
      case 'recommended':
        parts.push(`interests weighted ${Math.round((cfg.interest_weight ?? 0.6) * 100)}%`);
        break;
      case 'coming_soon':
        parts.push(plural(coming.count ?? 0, 'book'));
        break;
      case 'genres': {
        const g = genres.data ?? [];
        parts.push(`${plural(g.filter(x => x.visible).length, 'genre')} in set order`);
        break;
      }
    }
    if (!s.visible) parts.push('hidden');
    const editor = s.editor?.full_name;
    return `${parts.join(' · ')}${editor ? ` · edited by ${editor}, ${day(s.updated_at)}` : ''}`;
  };

  const list: SectionRow[] = (sections.data ?? []).map(s => ({
    id: s.id,
    key: s.key,
    title: s.title,
    kind: s.kind,
    visible: s.visible,
    detail: detail(s),
  }));
  return <CurationView sections={list} error={!!sections.error} />;
}
