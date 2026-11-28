'use server';

import { runSearch, type SearchResult } from './search-run';
import { getStaff } from './staff';
import { serverSupabase } from './supabase/server';

export type { SearchResult } from './search-run';

/** s-cmdk: records matching the query, as the signed-in staff member, in the groups the role can open. */
export async function searchRecords(raw: string): Promise<SearchResult> {
  const staff = await getStaff();
  if (!staff?.mfaOk) return { groups: [], failed: false };
  return runSearch(await serverSupabase(), staff.permissions, raw);
}
