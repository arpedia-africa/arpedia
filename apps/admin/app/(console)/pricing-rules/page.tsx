import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { loadPricing } from '../pricing/data';
import { dayLabel, describeChange } from '../pricing/format';
import { RulesForm } from './client';

export const metadata: Metadata = { title: 'Pricing rules · Arpedia Admin' };

/** s-pricing-rules: every rule that turns a book into a price and a credit into author pay. */
export default async function PricingRulesPage() {
  const staff = await requireStaff();
  if (!canOpen('pricing-rules', staff.permissions)) return <NoAccess page="pricing-rules" label="Pricing rules" role={staff.role} />;
  const { plans, topups, rules, currentVersion, ruleVersions, latestVersion, scheduled } = await loadPricing();
  if (!rules || !currentVersion) throw new Error('No pricing rules found');

  const supabase = await serverSupabase();
  const [live, sample] = await Promise.all([
    supabase.from('books').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    supabase
      .from('books')
      .select('title, current_revision_id')
      .eq('status', 'live')
      .not('current_revision_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const rev = sample.data?.current_revision_id
    ? await supabase.from('book_revisions').select('words').eq('id', sample.data.current_revision_id).maybeSingle()
    : null;
  const example = sample.data && rev?.data?.words ? { title: sample.data.title, words: rev.data.words } : null;

  const now = new Date().toISOString();
  const log = ruleVersions.map((v, i) => ({
    title: describeChange(ruleVersions[i + 1]?.rules ?? null, v.rules).slice(0, 3).join(', ') || v.note || 'Pricing rules saved',
    small: [dayLabel(v.effective_at), v.by, v.note].filter(Boolean).join(' · '),
    pending: v.effective_at > now,
  }));

  return (
    <RulesForm
      rules={rules}
      plans={plans}
      topups={topups}
      liveBooks={live.count ?? 0}
      example={example}
      lastChange={{ at: currentVersion.effective_at, by: currentVersion.by }}
      log={log}
      canSave={staff.role === 'super_admin'}
      version={latestVersion}
      scheduledId={scheduled?.id ?? null}
    />
  );
}
