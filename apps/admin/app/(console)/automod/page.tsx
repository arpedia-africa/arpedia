import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { AutomodView, type AutomodData } from './automod-view';

export const metadata: Metadata = { title: 'Safety rules · Arpedia Admin' };

/** s-automod: muted words, report reasons, auto-hide and the folded link / limit / spam rules. */
export default async function AutomodPage() {
  const staff = await requireStaff();
  if (!canOpen('automod', staff.permissions))
    return <NoAccess page="automod" label="Safety rules" role={staff.role} />;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_get_automod');
  return <AutomodView data={(data as unknown as AutomodData | null) ?? null} failed={!!error} />;
}
