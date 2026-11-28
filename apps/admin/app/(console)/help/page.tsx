import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { sortRows } from '@/lib/table';
import { HelpView, type HelpRow } from './help-view';

export const metadata: Metadata = { title: 'Help articles · Arpedia Admin' };

/** s-help: every article, most viewed first; category chips and search filter in the browser. */
export default async function HelpPage() {
  const staff = await requireStaff();
  if (!canOpen('help', staff.permissions))
    return <NoAccess page="help" label="Help articles" role={staff.role} />;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_list_help');
  const unsorted: HelpRow[] = (data ?? [])
    .map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      showsIn: a.shows_in,
      state: a.state as 'draft' | 'published',
      views: Number(a.views_30d),
      helpful: a.helpful_pct,
      needsRewrite: a.needs_rewrite,
      updatedAt: a.updated_at,
    }));
  const rows = sortRows(unsorted, [
    { id: 'views', value: a => a.views, desc: true },
    { id: 'title', value: a => a.title },
  ]);
  return <HelpView rows={rows} failed={!!error} />;
}
