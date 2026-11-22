import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { dayLabel, num, shortDay } from '../pricing/format';
import { PromosList, type PromoRow } from './client';

export const metadata: Metadata = { title: 'Promo codes · Arpedia Admin' };

const KIND = {
  bonus_credits: 'Bonus credits',
  plan_discount: 'Web plan discount',
  trial_days: 'Free trial days',
} as const;

/** s-promos: every promo code with what it gives, uses and status. Super admin and Finance (change_prices). */
export default async function PromosPage({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const staff = await requireStaff();
  if (!canOpen('promos', staff.permissions)) return <NoAccess page="promos" label="Promo codes" role={staff.role} />;
  const { flash } = await searchParams;
  const supabase = await serverSupabase();
  const { data, error } = await supabase
    .from('promo_codes')
    .select(
      'code, kind, amount, max_uses, uses, starts_at, ends_at, status, creator:profiles!promo_codes_created_by_fkey(full_name)',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const now = new Date().toISOString();
  const rows: PromoRow[] = data.map(p => {
    const ended = p.status === 'ended';
    const usedUp = p.max_uses !== null && p.uses >= p.max_uses;
    const past = p.ends_at !== null && p.ends_at <= now;
    const upcoming = p.status === 'scheduled' || p.starts_at > now;
    let group: PromoRow['group'] = 'active';
    let status = 'Active';
    if (ended || (past && !usedUp)) [group, status] = ['expired', 'Expired'];
    else if (usedUp) [group, status] = ['expired', 'Used up'];
    else if (p.status === 'paused') [group, status] = ['paused', 'Paused'];
    else if (upcoming) [group, status] = ['scheduled', `Starts ${shortDay(p.starts_at)}`];
    return {
      code: p.code,
      type: `${KIND[p.kind as keyof typeof KIND] ?? p.kind} · ${p.creator?.full_name ?? 'Arpedia'}`,
      value:
        p.kind === 'bonus_credits'
          ? `${num(p.amount)} credits`
          : p.kind === 'plan_discount'
            ? `${p.amount}% off`
            : `${num(p.amount)} day${p.amount === 1 ? '' : 's'}`,
      uses: `${num(p.uses)} / ${p.max_uses === null ? 'no limit' : num(p.max_uses)}`,
      expires: p.ends_at === null ? 'No end date' : past ? `Expired ${shortDay(p.ends_at)}` : dayLabel(p.ends_at),
      status,
      group,
    };
  });

  return <PromosList rows={rows} flash={flash?.slice(0, 200) ?? null} />;
}
