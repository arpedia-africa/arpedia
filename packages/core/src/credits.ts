// Credits and plans maths (docs/prd/09-credits-plans.md). Postgres is the source of truth for every
// credit movement; these helpers mirror its rules for the screens, the admin previews and the tests.

export type Bucket = 'rollover' | 'plan' | 'promo' | 'topup';

/** Rule 12: expiring credits first: rolled over, this period's plan, promo bonus, then top-up. */
export const SPEND_ORDER: readonly Bucket[] = ['rollover', 'plan', 'promo', 'topup'];

export type Balances = Record<Bucket, number>;

export interface PlanInfo {
  code: 'monthly' | 'quarterly' | 'yearly';
  months: number;
  credits: number;
  bonusCredits: number;
  pricePlayKobo: number;
  priceWebKobo: number;
}

export const PLANS: readonly PlanInfo[] = [
  { code: 'monthly', months: 1, credits: 300, bonusCredits: 0, pricePlayKobo: 90000, priceWebKobo: 80000 },
  { code: 'quarterly', months: 3, credits: 800, bonusCredits: 0, pricePlayKobo: 240000, priceWebKobo: 210000 },
  { code: 'yearly', months: 12, credits: 2800, bonusCredits: 200, pricePlayKobo: 840000, priceWebKobo: 750000 },
];

export const planCredits = (p: Pick<PlanInfo, 'credits' | 'bonusCredits'>) => p.credits + p.bonusCredits;

/** Rule 4: about how many books a number of credits buys (125-credit example book), rounded down. */
export const aboutBooks = (credits: number, avgBookPrice = 125) =>
  Math.max(0, Math.floor(credits / avgBookPrice));

/**
 * Rule 26: what Arpedia keeps per credit after the store fee. Must exceed the author rate.
 * net = price × (1 − fee) ÷ credits, in kobo.
 */
export function netPerCreditKobo(priceKobo: number, credits: number, storeFeePct = 15): number {
  if (credits <= 0) throw new RangeError('credits must be > 0');
  return (priceKobo * (1 - storeFeePct / 100)) / credits;
}

export interface PlanCheckRow {
  code: string;
  store: 'play' | 'web' | 'any';
  netPerCreditKobo: number;
  ok: boolean;
}

/** Plan check over every plan (Play and web price) and top-up. Save is disabled if any row fails. */
export function planCheck(
  plans: readonly PlanInfo[],
  topups: readonly { code: string; credits: number; priceKobo: number }[],
  rules: { authorRateKobo: number; storeFeePct: number },
): PlanCheckRow[] {
  const row = (code: string, store: PlanCheckRow['store'], price: number, credits: number): PlanCheckRow => {
    const net = netPerCreditKobo(price, credits, rules.storeFeePct);
    return { code, store, netPerCreditKobo: Math.round(net * 100) / 100, ok: net > rules.authorRateKobo };
  };
  return [
    ...plans.flatMap((p) => [
      row(p.code, 'play', p.pricePlayKobo, planCredits(p)),
      row(p.code, 'web', p.priceWebKobo, planCredits(p)),
    ]),
    ...topups.map((t) => row(t.code, 'any', t.priceKobo, t.credits)),
  ];
}

export interface RolloverResult {
  /** Rolled-over credits from the period before last, now expired. */
  expiredRollover: number;
  /** Unused plan credits moved to rollover (capped). */
  rolledOver: number;
  /** Unused plan credits over the cap, now expired. */
  expiredOverCap: number;
}

/**
 * Rule 11: at renewal into `nextPlan`, rolled-over credits still unspent expire; unused plan credits
 * carry over one period up to one plan's worth of the plan renewed into; the excess expires.
 */
export function rollOver(balances: Pick<Balances, 'plan' | 'rollover'>, nextPlan: PlanInfo, capPlans = 1): RolloverResult {
  const unused = Math.max(0, balances.plan);
  const cap = Math.floor(planCredits(nextPlan) * capPlans);
  const rolledOver = Math.min(unused, cap);
  return { expiredRollover: Math.max(0, balances.rollover), rolledOver, expiredOverCap: unused - rolledOver };
}

/** Rule 12: how a spend is taken from each bucket. Throws when the balance is short. */
export function spendFromBuckets(balances: Balances, amount: number): Partial<Record<Bucket, number>> {
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError('amount must be a whole number > 0');
  const out: Partial<Record<Bucket, number>> = {};
  let left = amount;
  for (const b of SPEND_ORDER) {
    const take = Math.min(left, Math.max(0, balances[b]));
    if (take > 0) out[b] = take;
    left -= take;
  }
  if (left > 0) throw new RangeError(`insufficient_credits: missing ${left}`);
  return out;
}

/** Add whole calendar months, keeping the day where it exists (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Next renewal for a plan that started (or last renewed) at `periodStart`. */
export const nextPeriodEnd = (periodStart: Date, plan: Pick<PlanInfo, 'months'>) => addMonths(periodStart, plan.months);

/** Rule 17: a pause of 1–3 months starts when the paid period ends; billing resumes after it. */
export function pauseResumeDate(periodEnd: Date, months: number, maxMonths = 3): Date {
  if (!Number.isInteger(months) || months < 1 || months > maxMonths) {
    throw new RangeError(`months must be 1 to ${maxMonths}`);
  }
  return addMonths(periodEnd, months);
}

/** Rule 22: the renewal reminder goes out three days before, at 09:00 WAT (08:00 UTC). */
export function reminderAt(periodEnd: Date): Date {
  const d = new Date(periodEnd.getTime() - 3 * 86_400_000);
  // 09:00 in Lagos (UTC+1, no daylight saving).
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Rule 14: readable dates in Lagos time: "12 Nov 2026, 09:14". */
export function ledgerDate(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** Short date in Lagos time: "12 Nov 2026". */
export function ledgerDay(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** ₦ with thousands separators from kobo: 240000 → "₦2,400". */
export function naira(kobo: number): string {
  const n = kobo / 100;
  const whole = Number.isInteger(n) ? n.toString() : n.toFixed(2);
  return '₦' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Rule 32: full refund if asked within 7 days and under 25% of the period's credits were used. */
export function refundRecommendation(daysSincePurchase: number, creditsGranted: number, creditsUsed: number) {
  return daysSincePurchase <= 7 && creditsUsed * 4 < Math.max(creditsGranted, 1) ? 'full' : 'partial';
}

/** Refund after spend: only unspent credits from the purchase come back; never below zero. */
export function clawback(granted: number, unspentInBuckets: number) {
  const removed = Math.min(Math.max(granted, 0), Math.max(unspentInBuckets, 0));
  return { removed, notRecoverable: Math.max(granted, 0) - removed };
}

/** Promo codes: 4 to 16 letters or digits, case-insensitive. */
export const normalizePromo = (code: string) => code.trim().toLowerCase();
export const isPromoCode = (code: string) => /^[a-z0-9]{4,16}$/.test(normalizePromo(code));
