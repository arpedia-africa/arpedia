// Flow 13 · author earnings and payouts (docs/prd/13-earnings-payouts.md). Pure maths shared by the
// Studio, the admin console and the payout Worker. The database (close_cycle) is the source of truth;
// these mirror it so screens and Workers agree with it to the kobo.

/** ₦1.60 per credit, in kobo (rule 1). The live value is `pricing_rule_versions.rules.author_rate_kobo`. */
export const AUTHOR_RATE_KOBO = 160;
/** Earning settings defaults (rule 9, 10; `earning_settings`). */
export const EARNING_DEFAULTS = { holdDays: 30, minPayoutKobo: 100_000, payoutDay: 15 } as const;
/** Bank names scoring at or above this are verified without a person (rule 22). */
export const AUTO_VERIFY_SCORE = 90;
/** Hours payouts to a new or changed bank account wait (rule 23). */
export const BANK_CHANGE_PAUSE_HOURS = 48;
/** Transient transfer errors retry automatically after these delays, then stop (rule 20). */
export const AUTO_RETRY_DELAYS_HOURS = [1, 6] as const;
export const MAX_AUTO_ATTEMPTS = 3;

const WAT_OFFSET_MS = 60 * 60 * 1000; // West Africa Time is UTC+1 all year.

/** Credits × rate in kobo, integers only (no float error). */
export function earningKobo(credits: number, rateKobo: number = AUTHOR_RATE_KOBO): number {
  if (!Number.isSafeInteger(credits) || !Number.isSafeInteger(rateKobo) || rateKobo < 0)
    throw new RangeError('credits and rate must be whole numbers');
  return credits * rateKobo;
}

/** First instant (UTC) of the WAT month containing `at`, and of the next month: [start, end). */
export function cycleBounds(at: Date): { month: string; start: Date; end: Date } {
  const wat = new Date(at.getTime() + WAT_OFFSET_MS);
  const y = wat.getUTCFullYear();
  const m = wat.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - WAT_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - WAT_OFFSET_MS);
  return { month: `${y}-${String(m + 1).padStart(2, '0')}-01`, start, end };
}

/**
 * Payout date (rule 9, open question 1 default): the first payout day on or after close + hold days,
 * counted on WAT calendar dates. Returned as `YYYY-MM-DD`.
 */
export function payoutDate(
  closedAt: Date,
  holdDays: number = EARNING_DEFAULTS.holdDays,
  payoutDay: number = EARNING_DEFAULTS.payoutDay,
): string {
  if (!(payoutDay >= 1 && payoutDay <= 28)) throw new RangeError('payout day must be 1–28');
  const wat = new Date(closedAt.getTime() + WAT_OFFSET_MS);
  const due = new Date(Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate() + holdDays));
  let y = due.getUTCFullYear();
  let m = due.getUTCMonth();
  if (due.getUTCDate() > payoutDay) m += 1;
  const d = new Date(Date.UTC(y, m, payoutDay));
  y = d.getUTCFullYear();
  m = d.getUTCMonth();
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(payoutDay).padStart(2, '0')}`;
}

export type EarningStatus =
  | 'payable'
  | 'carried'
  | 'held_unverified'
  | 'held_paused'
  | 'held_dispute'
  | 'queued'
  | 'paid'
  | 'partly_failed';

export interface EarningLineInput {
  amountKobo: number;
  carryInKobo: number;
  adjustmentKobo: number;
  minPayoutKobo?: number;
  bankVerified: boolean;
  paused: boolean;
  dispute: boolean;
}

/**
 * One author's line in a closed cycle (rules 6, 10–12, "Chapter returned after cycle close"): what is
 * owed, and whether it is paid now, carried below the minimum (a debit also carries), or held.
 */
export function earningLine(i: EarningLineInput): { payableKobo: number; status: EarningStatus } {
  const payableKobo = i.amountKobo + i.carryInKobo + i.adjustmentKobo;
  const min = i.minPayoutKobo ?? EARNING_DEFAULTS.minPayoutKobo;
  if (payableKobo < min) return { payableKobo, status: 'carried' };
  if (i.dispute) return { payableKobo, status: 'held_dispute' };
  if (i.paused) return { payableKobo, status: 'held_paused' };
  if (!i.bankVerified) return { payableKobo, status: 'held_unverified' };
  return { payableKobo, status: 'payable' };
}

/** `ARP-PO-{cycle}-{author}-{attempt}` (rule 15): cycle as YYYYMM, author id without dashes. */
export function payoutReference(month: string, authorId: string, attempt: number): string {
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new RangeError('month must be YYYY-MM-01');
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt starts at 1');
  return `ARP-PO-${month.slice(0, 4)}${month.slice(5, 7)}-${authorId.replace(/-/g, '')}-${attempt}`;
}

export type TransferStatus = 'queued' | 'pending' | 'successful' | 'failed' | 'reversed';
const RANK: Record<TransferStatus, number> = { queued: 0, pending: 1, successful: 2, failed: 2, reversed: 3 };

/**
 * Whether a transfer event may replace the stored status ("Double webhook"): never backwards (a late
 * `pending` never overwrites `successful`), and only a reversal follows a settled success.
 */
export function transferStatusApplies(current: TransferStatus, next: TransferStatus): boolean {
  if (current === next) return false;
  if (current === 'failed' || current === 'reversed') return false;
  if (current === 'successful') return next === 'reversed';
  return RANK[next] > RANK[current];
}

/** Transient errors retry automatically; name and account errors never do (rule 20). */
export function autoRetryAfterHours(attempt: number, transient: boolean): number | null {
  if (!transient || attempt >= MAX_AUTO_ATTEMPTS) return null;
  return AUTO_RETRY_DELAYS_HOURS[attempt - 1] ?? null;
}

/** Account and name problems never retry on their own; anything else (bank down, timeouts) may. */
const PERMANENT_FAILURE =
  /account|name|invalid|dormant|blocked|restricted|closed|beneficiary|not found|does not exist/i;

/**
 * A Flutterwave transfer, as re-queried by id, mapped to our status (Flutterwave says NEW, PENDING,
 * SUCCESSFUL, FAILED, REVERSED). `transient` marks a failure that may retry automatically (rule 20).
 */
export function flwTransferStatus(
  status: string,
  message?: string | null,
): { status: Exclude<TransferStatus, 'queued'>; transient: boolean } | null {
  switch (status.toUpperCase()) {
    case 'NEW':
    case 'PENDING':
      return { status: 'pending', transient: false };
    case 'SUCCESSFUL':
      return { status: 'successful', transient: false };
    case 'REVERSED':
      return { status: 'reversed', transient: false };
    case 'FAILED':
      return { status: 'failed', transient: !PERMANENT_FAILURE.test(message ?? '') };
    default:
      return null;
  }
}

/**
 * Flutterwave transfer webhooks carry no event id: one transfer reaching one status is one event, so a
 * repeated webhook (or a poll that sees the same status) is a duplicate.
 */
export const transferEventId = (transferId: string | number, status: TransferStatus) =>
  `flw-transfer:${transferId}:${status}`;

/** Additional data an encrypted account number is bound to (rule 21). */
export const accountAad = (authorId: string) => `bank:${authorId}`;

/** Last four digits only (rule 21). */
export function maskAccount(last4: string): string {
  return `•••• ${last4.slice(-4)}`;
}

/** Nigerian NUBAN: exactly 10 digits (rule 21). */
export const isAccountNumber = (s: string) => /^\d{10}$/.test(s.trim());

const TITLES = new Set([
  'mr',
  'mrs',
  'miss',
  'ms',
  'dr',
  'prof',
  'chief',
  'pastor',
  'rev',
  'alh',
  'alhaji',
  'hajia',
]);
const nameTokens = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !TITLES.has(t));

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n]! / Math.max(m, n);
}

/**
 * Fuzzy match of the bank's account name to the legal name (rule 22), 0–100. Word order, case,
 * accents and titles don't matter; each legal-name word is matched to its closest bank word, and a
 * bank name with extra middle names still matches. An initial matches a word starting with it.
 */
export function nameMatchScore(bankName: string, legalName: string): number {
  const bank = nameTokens(bankName);
  const legal = nameTokens(legalName);
  if (!bank.length || !legal.length) return 0;
  const [short, long] = legal.length <= bank.length ? [legal, bank] : [bank, legal];
  const used = new Set<number>();
  let total = 0;
  for (const t of short) {
    let best = 0;
    let at = -1;
    long.forEach((u, k) => {
      if (used.has(k)) return;
      const sc =
        (t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u)) ? 0.9 : similarity(t, u);
      if (sc > best) [best, at] = [sc, k];
    });
    if (at >= 0) used.add(at);
    total += best;
  }
  // Words of the legal name the bank doesn't carry at all cost a little (a missing surname matters).
  const missing = Math.max(0, legal.length - bank.length);
  return Math.max(0, Math.round((total / short.length) * 100 - missing * 15));
}

/** Payout settings as Studio reads them from `studio_home` / `studio_earnings` (11-5, 13-13). */
export interface PayoutRules {
  minPayoutKobo: number;
  holdDays: number;
  payoutDay: number;
}

/** The server's settings, or the launch defaults while they load. */
export function payoutRules(
  d?: { min_payout_kobo?: number | null; hold_days?: number | null; payout_day?: number | null } | null,
): PayoutRules {
  return {
    minPayoutKobo: d?.min_payout_kobo ?? EARNING_DEFAULTS.minPayoutKobo,
    holdDays: d?.hold_days ?? EARNING_DEFAULTS.holdDays,
    payoutDay: d?.payout_day ?? EARNING_DEFAULTS.payoutDay,
  };
}

/**
 * When a month (`YYYY-MM`) is paid: its cycle's own date once it closed, otherwise the date the
 * rules give a month that closes at its end (the same date admin shows for an open month).
 */
export function monthPayoutDate(month: string, rules: PayoutRules, cycleDate?: string | null): string {
  if (cycleDate) return cycleDate.slice(0, 10);
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  const end = new Date(Date.UTC(y, m + 1, 1) - WAT_OFFSET_MS);
  return payoutDate(end, rules.holdDays, rules.payoutDay);
}

/** 1st, 2nd, 3rd, 15th, 22nd (payout day copy). */
export function ordinalDay(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
