import { cache } from 'react';
import { serverSupabase } from '@/lib/supabase/server';
import type { Plan, Rules, Topup } from './format';

export interface RuleVersion {
  id: string;
  version: number;
  effective_at: string;
  created_at: string;
  rules: Rules;
  note: string | null;
  by: string | null;
}

export interface PlanVersion {
  id: number;
  plan_code: string;
  name: string;
  price_web_kobo: number;
  credits: number;
  bonus_credits: number;
  effective_from: string;
  note: string | null;
  by: string | null;
}

/** A plan price change waiting for a Super admin (rule 17: Finance proposes, a Super admin confirms). */
export interface PriceChange {
  id: string;
  plan_code: string;
  name: string;
  price_web_kobo: number;
  credits: number;
  bonus_credits: number;
  effective_from: string;
  requested_by: string;
  by: string | null;
  created_at: string;
}

/**
 * Plans, top-ups, the pricing rules in effect and the change history, read once per request
 * (get_plans plus the staff-readable version tables). Errors throw to the console error page.
 */
export const loadPricing = cache(async () => {
  const supabase = await serverSupabase();
  const [plansRes, rulesRes, plansHist, changesRes] = await Promise.all([
    supabase.rpc('get_plans'),
    supabase
      .from('pricing_rule_versions')
      .select('id, version, effective_at, created_at, rules, note, changer:profiles!pricing_rule_versions_changed_by_fkey(full_name)')
      .is('cancelled_at', null)
      .order('effective_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('plan_price_versions')
      .select(
        'id, plan_code, name, price_web_kobo, credits, bonus_credits, effective_from, note, changer:profiles!plan_price_versions_changed_by_fkey(full_name)',
      )
      .order('effective_from', { ascending: false })
      .order('id', { ascending: false })
      .limit(12),
    // RLS shows a request to the person who asked and to the staff who may decide it.
    supabase
      .from('approval_requests')
      .select('id, payload, requested_by, created_at, requester:profiles!approval_requests_requested_by_fkey(full_name)')
      .eq('kind', 'price_change')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at'),
  ]);
  if (plansRes.error) throw plansRes.error;
  if (changesRes.error) throw changesRes.error;
  if (rulesRes.error) throw rulesRes.error;
  if (plansHist.error) throw plansHist.error;

  const catalog = plansRes.data as unknown as {
    plans: Plan[];
    topups: Topup[];
    avg_book_price_credits: number;
    credit_value_kobo: number;
  };
  const ruleVersions: RuleVersion[] = rulesRes.data.map(r => ({
    id: r.id,
    version: r.version,
    effective_at: r.effective_at,
    created_at: r.created_at,
    rules: r.rules as unknown as Rules,
    note: r.note,
    by: r.changer?.full_name ?? null,
  }));
  const now = new Date().toISOString();
  const current = ruleVersions.find(v => v.effective_at <= now);
  const planVersions: PlanVersion[] = plansHist.data.map(v => ({
    id: v.id,
    plan_code: v.plan_code,
    name: v.name,
    price_web_kobo: v.price_web_kobo,
    credits: v.credits,
    bonus_credits: v.bonus_credits,
    effective_from: v.effective_from,
    note: v.note,
    by: v.changer?.full_name ?? null,
  }));
  const priceChanges: PriceChange[] = changesRes.data.map(r => {
    const p = r.payload as unknown as Omit<PriceChange, 'id' | 'requested_by' | 'by' | 'created_at'>;
    return {
      id: r.id,
      plan_code: p.plan_code,
      name: p.name,
      price_web_kobo: p.price_web_kobo,
      credits: p.credits,
      bonus_credits: p.bonus_credits,
      effective_from: p.effective_from,
      requested_by: r.requested_by,
      by: r.requester?.full_name ?? null,
      created_at: r.created_at,
    };
  });
  return {
    plans: catalog.plans,
    priceChanges,
    topups: catalog.topups,
    avgBook: catalog.avg_book_price_credits,
    rules: current?.rules ?? null,
    currentVersion: current ?? null,
    /** Latest saved version (scheduled or in effect): sent back on save so a concurrent save is refused. */
    latestVersion: ruleVersions.reduce((m, v) => Math.max(m, v.version), 0),
    /** A save waiting for 00:00 WAT, which Undo cancels. */
    scheduled: ruleVersions.find(v => v.effective_at > now) ?? null,
    ruleVersions,
    planVersions,
  };
});
