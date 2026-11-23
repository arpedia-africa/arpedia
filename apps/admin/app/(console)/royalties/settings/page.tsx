import type { Metadata } from 'next';
import { guard } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { SettingsForm, type Settings } from './client';

export const metadata: Metadata = { title: 'Earnings settings · Arpedia Admin' };

interface Data {
  current: Settings;
  can_save: boolean;
  author_rate_kobo: number;
  last_month: string | null;
  exclusions: Partial<Record<string, { credits: number; readers: number }>>;
  log: (Settings & { effective_from: string; changed_name: string | null; note: string | null })[];
}

/** s-royalty-settings: Finance views, Super admin saves (rule 32). The author rate is Pricing rules'. */
export default async function EarningsSettingsPage() {
  const { denied } = await guard('royalties', 'Author earnings');
  if (denied) return denied;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('admin_earning_settings');
  if (error) throw error;
  const d = data as unknown as Data;
  return (
    <SettingsForm
      current={d.current}
      canSave={d.can_save}
      rate={`₦${(d.author_rate_kobo / 100).toFixed(2)}`}
      lastMonth={d.last_month}
      undone={d.exclusions.undone?.credits ?? 0}
      refunded={d.exclusions.refund_clawback?.credits ?? 0}
      giftLoop={d.exclusions.gift_loop ?? { credits: 0, readers: 0 }}
      log={d.log}
    />
  );
}
