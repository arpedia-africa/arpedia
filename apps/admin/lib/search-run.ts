import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arpedia/core';
import { countryName as country } from '@/app/(console)/users/shared';
import {
  SEARCH_LIMIT,
  SEARCH_PAGES,
  authorHit,
  bookHit,
  matchAuthors,
  paymentHit,
  readerHit,
  searchKinds,
  searchTerm,
  type AuthorRow,
  type BookRow,
  type PaymentRow,
  type ReaderRow,
  type SearchGroup,
  type SearchHit,
  type SearchKind,
} from './search';

type Supa = SupabaseClient<Database>;

const like = (t: string) => `%${t.replace(/[\\%_]/g, m => `\\${m}`)}%`;
const countryName = (code: string | null) => country(code);

/** Each group through its own page's query, as the signed-in staff member. */
const SEARCH: Record<SearchKind, (supabase: Supa, term: string) => Promise<SearchHit[]>> = {
  // Readers (s-users): name, email, phone or id, through staff_list_readers (view_readers).
  async readers(supabase, term) {
    const { data, error } = await supabase.rpc('staff_list_readers', { p_query: term });
    if (error) throw error;
    const rows = ((data as unknown as { rows?: ReaderRow[] } | null)?.rows ?? []).slice(0, SEARCH_LIMIT);
    return rows.map(r => readerHit(r, countryName));
  },
  // Authors (s-authors): pen name, through admin_authors and author_stats, as the Authors list.
  async authors(supabase, term) {
    const [{ data, error }, stats] = await Promise.all([
      supabase.rpc('admin_authors'),
      supabase.from('author_stats').select('author_id, follower_count'),
    ]);
    if (error) throw error;
    const follows = new Map((stats.data ?? []).map(s => [s.author_id, s.follower_count]));
    return matchAuthors((data ?? []) as unknown as AuthorRow[], term).map(a => authorHit(a, follows.get(a.user_id) ?? 0));
  },
  // Books: title.
  async books(supabase, term) {
    const { data, error } = await supabase
      .from('books')
      .select('id, title, status, author:profiles!books_author_id_fkey(full_name)')
      .ilike('title', like(term))
      .order('reads_count', { ascending: false })
      .limit(SEARCH_LIMIT);
    if (error) throw error;
    return ((data ?? []) as BookRow[]).map(bookHit);
  },
  // Payments (s-transactions): store order id or the reader's name, newest first.
  async payments(supabase, term) {
    const { data: people } = await supabase.from('profiles').select('id').ilike('full_name', like(term)).limit(50);
    const ids = (people ?? []).map(p => p.id);
    const { data, error } = await supabase
      .from('transactions')
      .select(
        `id, created_at, kind, plan_code, topup_code, store, store_txn_id, gross_kobo, status,
         user:profiles!transactions_user_id_fkey(full_name)`,
      )
      .or(`store_txn_id.ilike.${like(term)}${ids.length ? `,user_id.in.(${ids.join(',')})` : ''}`)
      .order('created_at', { ascending: false })
      .limit(SEARCH_LIMIT);
    if (error) throw error;
    return ((data ?? []) as PaymentRow[]).map(paymentHit);
  },
};

export interface SearchResult {
  groups: SearchGroup[];
  /** A group could not be searched (network or server); the others still show. */
  failed: boolean;
}

/** Records matching the query, only in the groups these permissions can open. */
export async function runSearch(supabase: Supa, permissions: readonly string[], raw: string): Promise<SearchResult> {
  const term = searchTerm(raw);
  if (!term) return { groups: [], failed: false };
  const kinds = searchKinds(permissions);
  const found = await Promise.allSettled(kinds.map(k => SEARCH[k](supabase, term)));
  const groups = kinds.flatMap((kind, i): SearchGroup[] => {
    const r = found[i]!;
    return r.status === 'fulfilled' && r.value.length ? [{ kind, label: SEARCH_PAGES[kind].label, hits: r.value }] : [];
  });
  return { groups, failed: found.some(r => r.status === 'rejected') };
}
