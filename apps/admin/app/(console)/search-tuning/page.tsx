import { NoAccess } from '@/components/no-access';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { sortRows } from '@/lib/table';
import { TuningView, type Promotion, type QueryRow, type Synonym, type ZeroRow } from './client';

const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Search tuning (s-search-tuning): top searches with tap-through, zero-result searches (Books
 * readers want), synonyms, promoted results and search behaviour. Operations admin and Super admin
 * (Default Q10; Manage settings also opens it).
 */
export default async function SearchTuningPage() {
  const staff = await requireStaff();
  if (!staff.permissions.includes('search_tuning') && !staff.permissions.includes('manage_settings'))
    return <NoAccess page="config" label="Search tuning" role={staff.role} />;
  const supabase = await serverSupabase();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [events, requests, synonyms, promos, settings] = await Promise.all([
    supabase
      .from('search_events')
      .select('query_norm, result_count, tapped_type')
      .gte('created_at', since)
      .limit(20000),
    supabase.from('book_requests').select('query_norm, status').in('status', ['open', 'wishlist']),
    supabase
      .from('search_synonyms')
      .select('id, terms, author:profiles!search_synonyms_created_by_fkey(full_name)')
      .order('id'),
    supabase
      .from('search_promotions')
      .select('id, query_norm, position, expires_at, book:books!search_promotions_book_id_fkey(title)')
      .order('query_norm'),
    supabase.from('search_settings').select('typo_distance, include_authors, show_unreleased').maybeSingle(),
  ]);

  const top = new Map<string, { n: number; tapped: number }>();
  const zero = new Map<string, number>();
  for (const e of events.data ?? []) {
    if (e.result_count > 0) {
      const t = top.get(e.query_norm) ?? { n: 0, tapped: 0 };
      t.n += 1;
      if (e.tapped_type) t.tapped += 1;
      top.set(e.query_norm, t);
    } else zero.set(e.query_norm, (zero.get(e.query_norm) ?? 0) + 1);
  }
  const wish = new Set((requests.data ?? []).filter(r => r.status === 'wishlist').map(r => r.query_norm));
  const asked = new Set((requests.data ?? []).map(r => r.query_norm));
  for (const r of requests.data ?? []) if (!zero.has(r.query_norm)) zero.set(r.query_norm, 0);

  const bySearches = { id: 'searches', value: (r: { searches: number }) => r.searches, desc: true };
  const topRows: QueryRow[] = sortRows(
    [...top.entries()].map(([query, t]) => ({
      query,
      searches: t.n,
      tapRate: t.n ? Math.round((t.tapped / t.n) * 100) : 0,
    })),
    [bySearches],
  ).slice(0, 10);
  const zeroRows: ZeroRow[] = sortRows(
    [...zero.entries()].map(([query, searches]) => ({
      query,
      searches,
      wishlisted: wish.has(query),
      requested: asked.has(query),
    })),
    [bySearches],
  ).slice(0, 10);

  return (
    <TuningView
      top={topRows}
      zero={zeroRows}
      synonyms={(synonyms.data ?? []).map(
        (s): Synonym => ({ id: s.id, terms: s.terms, by: s.author?.full_name ?? null }),
      )}
      promotions={(promos.data ?? []).map(
        (p): Promotion => ({
          id: p.id,
          query: p.query_norm,
          book: p.book?.title ?? 'Removed book',
          position: p.position,
          until: p.expires_at ? short(p.expires_at) : 'Ongoing',
        }),
      )}
      settings={{
        typo: (settings.data?.typo_distance ?? 2) > 0,
        authors: settings.data?.include_authors ?? true,
        unreleased: settings.data?.show_unreleased ?? false,
      }}
      canSeeEvents={!events.error}
    />
  );
}
