import { naira } from '@arpedia/core';

/** One plan as get_plans returns it (the version in effect now). */
export interface Plan {
  code: 'monthly' | 'quarterly' | 'yearly';
  name: string;
  months: number;
  credits: number;
  bonus_credits: number;
  total_credits: number;
  price_play_kobo: number;
  price_web_kobo: number;
  play_product_id: string;
  badge: string | null;
  active: boolean;
  sort: number;
}

/** "web price ₦900 → ₦1,000, 300 → 320 credits" for a proposed plan change (only what moves). */
export function describePlanChange(
  now: Pick<Plan, 'price_web_kobo' | 'credits' | 'bonus_credits'> | undefined,
  next: Pick<Plan, 'price_web_kobo' | 'credits' | 'bonus_credits'>,
): string {
  const parts: string[] = [];
  if (!now || now.price_web_kobo !== next.price_web_kobo)
    parts.push(now ? `web price ${naira(now.price_web_kobo)} → ${naira(next.price_web_kobo)}` : `web price ${naira(next.price_web_kobo)}`);
  if (!now || now.credits !== next.credits)
    parts.push(now ? `${now.credits.toLocaleString('en-NG')} → ${next.credits.toLocaleString('en-NG')} credits` : `${next.credits.toLocaleString('en-NG')} credits`);
  if (now && now.bonus_credits !== next.bonus_credits)
    parts.push(`${now.bonus_credits.toLocaleString('en-NG')} → ${next.bonus_credits.toLocaleString('en-NG')} bonus credits`);
  return parts.join(', ') || 'no price change';
}

export interface Topup {
  code: string;
  credits: number;
  price_kobo: number;
  play_product_id: string;
}

/** The pricing_rule_versions.rules document. */
export interface Rules {
  words_per_page: number;
  credits_per_page: number;
  credit_value_kobo: number;
  preview_pct: number;
  split_pages: number;
  undo_minutes: number;
  author_rate_kobo: number;
  rollover_cap_plans: number;
  pause_max_months: number;
  auto_unlock_default: boolean;
  store_fee_pct: number;
}

export const RULE_LABEL: Record<keyof Rules, string> = {
  words_per_page: 'Words per standard page',
  credits_per_page: 'Credits per page',
  credit_value_kobo: 'Credit value',
  preview_pct: 'Free preview',
  split_pages: 'Split chapters longer than',
  undo_minutes: 'Undo window',
  author_rate_kobo: 'Author rate',
  rollover_cap_plans: 'Rollover cap',
  pause_max_months: 'Longest pause',
  auto_unlock_default: 'Unlock the next chapter automatically',
  store_fee_pct: 'Store fee',
};

/** A rule value as staff read it: kobo as naira, flags as On or Off. */
export function ruleValue(key: keyof Rules, v: Rules[keyof Rules]): string {
  if (key === 'credit_value_kobo' || key === 'author_rate_kobo') return nairaDec(Number(v), Number(v) % 100 !== 0);
  if (key === 'auto_unlock_default') return v ? 'On' : 'Off';
  if (key === 'preview_pct' || key === 'store_fee_pct') return `${v}%`;
  return String(v);
}

/** "Words per standard page 275 to 250" for every rule that differs. */
export function describeChange(before: Partial<Rules> | null, after: Partial<Rules>): string[] {
  return (Object.keys(RULE_LABEL) as (keyof Rules)[]).flatMap(k => {
    if (after[k] === undefined || before?.[k] === after[k]) return [];
    if (before?.[k] === undefined) return [`${RULE_LABEL[k]} set to ${ruleValue(k, after[k])}`];
    return [`${RULE_LABEL[k]} ${ruleValue(k, before[k])} to ${ruleValue(k, after[k])}`];
  });
}

/** ₦ from kobo, with kobo shown when asked: 160 → "₦1.60". */
export function nairaDec(kobo: number, force = true): string {
  if (!force) return naira(kobo);
  return '₦' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const num = (n: number) => n.toLocaleString('en-NG');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1 Dec 2026" (or 2026-12-01) as 00:00 WAT that day, an ISO string; null when it isn't a date. */
export function parseDay(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/,/g, '');
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const words = /^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  else if (words && MONTHS.includes(words[2]!)) [y, m, d] = [Number(words[3]), MONTHS.indexOf(words[2]!), Number(words[1])];
  else return null;
  const day = new Date(Date.UTC(y, m, d));
  if (day.getUTCMonth() !== m || day.getUTCDate() !== d) return null;
  return new Date(day.getTime() - 3_600_000).toISOString();
}

/** "1 Dec 2026" in Lagos time. */
export function dayLabel(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  return `${d.getUTCDate()} ${MONTH_LABEL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "30 Apr" in Lagos time. */
export function shortDay(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  return `${d.getUTCDate()} ${MONTH_LABEL[d.getUTCMonth()]}`;
}
