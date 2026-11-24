// Flow 01 · sign-up validation, onboarding step order and paywall maths. The database checks the
// same rules again (save_onboarding_step); these give instant feedback under each field.

/** Minimum password length (OPEN-QUESTIONS Q88 default: 8; prototype said 6). */
export const PASSWORD_MIN = 8;
/** Readers must be at least this old (owner decision, Q1). */
export const MIN_AGE = 16;
export const NAME_MAX = 80;

export const ONBOARDING_STEPS = ['signup', 'interests', 'theme', 'role', 'profile', 'plans', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const stepOrd = (step: OnboardingStep) => ONBOARDING_STEPS.indexOf(step);

/** The step saved after finishing `step`. Reaching the paywall finishes onboarding (rule 29). */
export function nextStep(step: OnboardingStep): OnboardingStep {
  if (step === 'plans' || step === 'done') return 'done';
  return ONBOARDING_STEPS[stepOrd(step) + 1]!;
}

/** Steps only move forward: going back and saving again keeps the furthest step. */
export const laterStep = (a: OnboardingStep, b: OnboardingStep): OnboardingStep =>
  stepOrd(a) >= stepOrd(b) ? a : b;

/** Screen a reader resumes on for a saved step; null means Home. */
export function resumeScreen(step: OnboardingStep): 'interests' | 'theme' | 'role' | 'profile' | null {
  switch (step) {
    case 'signup':
    case 'interests':
      return 'interests';
    case 'theme':
      return 'theme';
    case 'role':
      return 'role';
    case 'profile':
      return 'profile';
    default:
      return null; // plans (closed on the paywall) and done
  }
}

// ─── Field checks ───────────────────────────────────────────────────────────
export const validName = (name: string) => {
  const n = name.trim().length;
  return n >= 1 && n <= NAME_MAX;
};
export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
export const validPassword = (pw: string) => pw.length >= PASSWORD_MIN;

/**
 * Normalise a phone number typed after a calling code into E.164. Spaces, dashes and brackets are
 * ignored, a repeated calling code or a leading 0 is dropped. Nigeria (+234) needs exactly 10 digits
 * after the code; other codes accept 6 to 12, and the whole number 8 to 15 digits (the database's
 * E.164 check). Returns null when it can't be right.
 */
export function normalisePhone(input: string, callingCode = '234'): string | null {
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) {
    if (!d.startsWith(`+${callingCode}`)) return null;
    d = d.slice(callingCode.length + 1);
  } else if (d.startsWith(`00${callingCode}`)) d = d.slice(callingCode.length + 2);
  else if (d.startsWith(callingCode) && d.length > 10) d = d.slice(callingCode.length);
  if (d.startsWith('0')) d = d.slice(1);
  if (!/^[1-9][0-9]*$/.test(d)) return null;
  if (callingCode === '234' ? d.length !== 10 : d.length < 6 || d.length > 12) return null;
  const total = callingCode.length + d.length;
  if (total < 8 || total > 15) return null;
  return `+${callingCode}${d}`;
}

/** Parse "DD / MM / YYYY" (any separators) into an ISO date, or null if it isn't a real date. */
export function parseDob(text: string): string | null {
  const m = /^\s*(\d{1,2})\D+(\d{1,2})\D+(\d{4})\s*$/.exec(text);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** Whole years between an ISO birth date and `today` (local calendar date, ISO). */
export function ageOn(dobIso: string, todayIso: string): number {
  const [by, bm, bd] = dobIso.split('-').map(Number) as [number, number, number];
  const [ty, tm, td] = todayIso.split('-').map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export const oldEnough = (dobIso: string, todayIso: string) =>
  dobIso >= '1900-01-01' && ageOn(dobIso, todayIso) >= MIN_AGE;

// ─── Paywall ────────────────────────────────────────────────────────────────
export type PlanId = 'monthly' | 'quarterly' | 'yearly';
export interface Plan {
  id: PlanId;
  name: string;
  priceNaira: number;
  /** Google Play's own price text, when the store gave one. */
  priceText?: string;
  /** Google Play's own per-month text, when the store gave one. */
  monthText?: string | null;
  credits: number;
  months: number;
}

/** Launch plans (flow 01 rule 26). Flow 09's `plans` table and the store price replace these. */
export const LAUNCH_PLANS: readonly Plan[] = [
  { id: 'monthly', name: 'Monthly', priceNaira: 900, credits: 300, months: 1 },
  { id: 'quarterly', name: 'Quarterly', priceNaira: 2400, credits: 800, months: 3 },
  { id: 'yearly', name: 'Yearly', priceNaira: 8400, credits: 3000, months: 12 },
];

/** The large "per month" figure: ₦900, ₦800, ₦700. */
export const perMonthNaira = (plan: Pick<Plan, 'priceNaira' | 'months'>) =>
  Math.round(plan.priceNaira / plan.months);

/** "≈ N books": a typical book costs 125 credits (250 pages at half a credit a page). */
export const BOOK_CREDITS = 125;
export const approxBooks = (credits: number) => Math.max(1, Math.round(credits / BOOK_CREDITS));

export const formatNaira = (n: number) => `₦${n.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

/** What the store charges: its own text when it gave one. */
export const planPriceText = (plan: Pick<Plan, 'priceNaira' | 'priceText'>) =>
  plan.priceText ?? formatNaira(plan.priceNaira);
/** The large "per month" figure: the store's own when it gave one. */
export const planMonthText = (plan: Pick<Plan, 'priceNaira' | 'months' | 'monthText'>) =>
  plan.monthText ?? formatNaira(perMonthNaira(plan));

export const TERMS_URL = 'https://arpedia.africa/terms';
export const PRIVACY_URL = 'https://arpedia.africa/privacy';

/** "A", "A and B", "A, B and C". */
const listWords = (words: string[]) =>
  words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

/**
 * Paywall headline and sub line (rule 24): "<first name>, your shelf is ready" and
 * "<N> books in <up to three picked genres>. Start reading tonight." With no picks: "Your shelf is
 * ready" and the whole catalogue. With no catalogue yet only the call to read stays.
 */
export function paywallCopy(firstName: string | null, genres: string[], bookCount: number) {
  const picked = genres.slice(0, 3);
  const title = firstName && picked.length ? `${firstName}, your shelf is ready` : 'Your shelf is ready';
  const books = `${bookCount.toLocaleString('en-NG')} ${bookCount === 1 ? 'book' : 'books'}`;
  const sub =
    bookCount === 0
      ? 'Start reading tonight.'
      : picked.length
        ? `${books} in ${listWords(picked)}. Start reading tonight.`
        : `${books} on Arpedia. Start reading tonight.`;
  return { title, sub };
}

/** "12 Feb" for a renewal date (ISO, calendar date). */
export function shortDate(iso: string) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [, m, d] = iso.split('-').map(Number) as [number, number, number];
  return `${d} ${months[m - 1]}`;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Renewal date for a plan bought on `startIso` (same day of month, clamped to month end). */
export function renewalDate(startIso: string, months: number): string {
  const [y, m, d] = startIso.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** We remind readers 3 days before each renewal. */
export const reminderDate = (renewalIso: string) => addDays(renewalIso, -3);

/** "Day N" on the How it works timeline: days from today to the reminder. */
export const reminderDay = (startIso: string, months: number) =>
  daysBetween(startIso, reminderDate(renewalDate(startIso, months)));
