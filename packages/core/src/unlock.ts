// Book page and unlock maths (docs/prd/03-book-page-unlock.md). The app shows these numbers before
// any tap that spends; the server (Postgres RPCs) recomputes and checks every one of them.
import { AUTHOR_RATE, CREDIT_NAIRA } from './pricing';

/** Reading speed for "about N hr read" (rule 2). */
export const WORDS_PER_MINUTE = 230;
/** Share of the book a reader must reach to review it and join the discussion. */
export const FINISHED_PERCENT = 95;
/** Default config `avg_book_price_credits` (rule 28). */
export const AVG_BOOK_PRICE = 125;
/** Default config `tip_presets` (rule 36). */
export const TIP_PRESETS = [20, 50, 100] as const;
export const TIP_DEFAULT = 50;
/** Longest gift message and tip note. */
export const NOTE_MAX = 140;
/** Longest review text. */
export const REVIEW_MAX = 1000;

export interface TopupPack {
  credits: number;
  naira: number;
}
/** The three fixed top-up packs (rule 28); flow 09 replaces them with the store products. */
export const TOPUP_PACKS: readonly TopupPack[] = [
  { credits: 200, naira: 600 },
  { credits: 500, naira: 1500 },
  { credits: 1000, naira: 3000 },
];

/** Reading time in minutes: words ÷ 230 a minute, rounded to the nearest 5 minutes. */
export function readMinutes(words: number): number {
  return Math.round(words / WORDS_PER_MINUTE / 5) * 5;
}

/** Book page meta: "about 5 hr read" (whole hours from an hour up), "about 45 min read". */
export function readTimeShort(minutes: number): string {
  return minutes < 60 ? `about ${minutes} min read` : `about ${Math.round(minutes / 60)} hr read`;
}

/** About facts: "about 4 h 30 min", "about 5 h", "about 45 min". */
export function readTimeLong(minutes: number): string {
  if (minutes < 60) return `about ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `about ${h} h` : `about ${h} h ${m} min`;
}

/** Counts above 999 as "1.2K", "18K", "3.4M" (rule 3). */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const [d, unit] = n < 1_000_000 ? [1000, 'K'] : [1_000_000, 'M'];
  const v = n / d;
  const s = v >= 10 ? String(Math.floor(v)) : String(Math.floor(v * 10) / 10);
  return s.replace(/\.0$/, '') + unit;
}

/** "≈ N a chapter": the price spread over the chargeable chapters, rounded (rule 5). */
export function perChapter(price: number, chargeableChapters: number): number | null {
  return chargeableChapters > 0 ? Math.round(price / chargeableChapters) : null;
}

/** Balance after spending; never shown below zero. */
export const balanceAfter = (balance: number, spend: number) => Math.max(0, balance - spend);

/** What the whole book still costs after chapter payments (rule 18, "Pay the rest"). */
export function remainingPrice(price: number, paid: number, snapshotPrice?: number | null): number {
  const cap = snapshotPrice == null ? price : Math.min(price, snapshotPrice);
  return Math.max(0, cap - paid);
}

/**
 * How many consecutive unpaid chapters, from the first unpaid one, the balance can pay (rule 27).
 * `unpaidPrices` are the chapter prices in reading order, starting at the first unpaid chapter.
 */
export function chaptersCovered(balance: number, unpaidPrices: number[]): number {
  let k = 0;
  let left = balance;
  for (const p of unpaidPrices) {
    if (p > left) break;
    left -= p;
    k++;
  }
  return k;
}

/**
 * The pack preselected on "You need N more credits" (rule 28): the smallest that covers `missing`,
 * or the largest when none does (the copy then says a second top-up is needed).
 */
export function pickTopupPack(missing: number, packs: readonly TopupPack[] = TOPUP_PACKS) {
  const sorted = [...packs].sort((a, b) => a.credits - b.credits);
  const fit = sorted.find((p) => p.credits >= missing);
  return { pack: fit ?? sorted[sorted.length - 1]!, enough: fit !== undefined };
}

/** "≈ N books" for a pack. */
export const packBooks = (credits: number, avgBookPrice = AVG_BOOK_PRICE) =>
  Math.max(1, Math.round(credits / avgBookPrice));

export type PlanState = 'plan' | 'none';
export type SpendSheet = 'confirm' | 'low' | 'nosub';

/** Which sheet a spending tap opens (rule 14). */
export function spendSheet(need: number, balance: number, plan: PlanState): SpendSheet {
  if (balance >= need) return 'confirm';
  return plan === 'plan' ? 'low' : 'nosub';
}

/** Naira an author receives for a tip, shown live on the tip sheet (rule 36). */
export const tipNaira = (credits: number) => Math.round(credits * AUTHOR_RATE * 100) / 100;

/** Naira value of credits, e.g. "125 credits (₦375)". */
export const creditsNaira = (credits: number) => credits * CREDIT_NAIRA;

/** How many books at this price a plan's credits cover, rounded down (rule 31). */
export const booksCovered = (planCredits: number, price: number) =>
  price > 0 ? Math.floor(planCredits / price) : 0;

/** The main button's label (rule 4). */
export function mainButton(state: {
  comingSoon: boolean;
  percent: number | null;
  maxPercent: number | null;
  previewPercent: number;
}): string {
  if (state.comingSoon) return 'Notify me';
  if (state.maxPercent != null && state.maxPercent >= 100) return 'Read again';
  if (state.percent != null && state.percent > 0) return `Continue reading · ${Math.floor(state.percent)}%`;
  return `Start reading · first ${state.previewPercent}% free`;
}

/** Pages inside the free preview, for "First 10% (about N pages)". */
export const previewPages = (pages: number, previewPercent: number) =>
  Math.max(1, Math.round((pages * previewPercent) / 100));

/** Bar widths for the 5 → 1 rating breakdown, as fractions of the review count. */
export function ratingBars(h: readonly number[], count: number): number[] {
  return [4, 3, 2, 1, 0].map((i) => (count > 0 ? (h[i] ?? 0) / count : 0));
}

/** One rating everywhere: 1 decimal. */
export const ratingLabel = (avg: number) => avg.toFixed(1);
