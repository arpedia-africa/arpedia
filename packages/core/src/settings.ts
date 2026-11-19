// Flow 16 · Admin settings: pricing-rule maths, the 00:00 WAT effective time, feature-flag rollout
// buckets and app version comparison. The database mirrors each of these (_repriced, _plan_check,
// _next_wat_midnight, _rollout_bucket, _version_cmp).

/** VAT withheld on store revenue, for the "margin with VAT withheld" line (rule 33). */
export const VAT_PCT = 7.5;

/** Book price under the rules: ceil(pages × credits per page), at least 1 (rule 32). */
export function priceForPages(pages: number, creditsPerPage: number): number {
  if (!(pages >= 0) || !(creditsPerPage > 0)) throw new RangeError('pages ≥ 0 and credits per page > 0');
  // Round away float noise first so 250 × 0.5 never becomes 125.00000001 → 126.
  return Math.max(1, Math.ceil(Math.round(pages * creditsPerPage * 1e6) / 1e6));
}

/** The rule 32 live example: words → standard pages → credits → naira. */
export function priceExample(words: number, rules: { wordsPerPage: number; creditsPerPage: number; creditNaira: number }) {
  const pages = Math.ceil(words / rules.wordsPerPage);
  const credits = priceForPages(pages, rules.creditsPerPage);
  return { pages, credits, naira: credits * rules.creditNaira };
}

export interface MarginRow {
  code: string;
  netPerCreditKobo: number;
  marginKobo: number;
  marginVatKobo: number;
  ok: boolean;
}

/**
 * Plan check (rule 33): net per credit = price × (1 − store fee) ÷ credits; margin = net − author
 * rate. With VAT withheld the net is divided by (1 + VAT) first. Saving is blocked when any margin
 * (without VAT) is zero or below.
 */
export function marginRow(
  code: string,
  priceKobo: number,
  credits: number,
  rules: { authorRateKobo: number; storeFeePct: number; vatPct?: number },
): MarginRow {
  if (!(credits > 0)) throw new RangeError('credits must be > 0');
  const net = (priceKobo * (1 - rules.storeFeePct / 100)) / credits;
  const netVat = net / (1 + (rules.vatPct ?? VAT_PCT) / 100);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    code,
    netPerCreditKobo: r2(net),
    marginKobo: r2(net - rules.authorRateKobo),
    marginVatKobo: r2(netVat - rules.authorRateKobo),
    ok: net - rules.authorRateKobo > 0,
  };
}

/** Next 00:00 in Africa/Lagos (UTC+1 all year, no daylight saving) after `now` (rule 35). */
export function nextWatMidnight(now: Date = new Date()): Date {
  const wat = new Date(now.getTime() + 3_600_000);
  const next = Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate() + 1);
  return new Date(next - 3_600_000);
}

/** Compare `major.minor` versions numerically: -1, 0 or 1; null when either is malformed. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const re = /^(\d+)\.(\d+)$/;
  const ma = re.exec(a.trim());
  const mb = re.exec(b.trim());
  if (!ma || !mb) return null;
  const d = Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2]);
  return d < 0 ? -1 : d > 0 ? 1 : 0;
}

export const isVersion = (v: string) => /^\d+\.\d+$/.test(v.trim());

/**
 * Stable 0–99 rollout bucket for a user and flag (rule 27). Same as the database:
 * first 8 hex digits of md5("<flag>:<user id>") as an unsigned 32-bit number, mod 100.
 */
export function rolloutBucket(userId: string, flag: string, md5Hex: (s: string) => string): number {
  return parseInt(md5Hex(`${flag}:${userId}`).slice(0, 8), 16) % 100;
}

/** Whether a flag is on for this user and app version. */
export function flagOn(
  flag: { key: string; enabled: boolean; rolloutPercent: number; minAppVersion?: string | null },
  userId: string,
  appVersion: string,
  md5Hex: (s: string) => string,
): boolean {
  if (!flag.enabled) return false;
  if (flag.minAppVersion && (compareVersions(appVersion, flag.minAppVersion) ?? -1) < 0) return false;
  return rolloutBucket(userId, flag.key, md5Hex) < flag.rolloutPercent;
}

/** Placeholders like {credits} that a remote copy text must keep (rule 29). */
export function missingPlaceholders(text: string, required: readonly string[]): string[] {
  return required.filter((p) => !text.includes(p));
}
