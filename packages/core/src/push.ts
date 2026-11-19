// Flow 15 · Engage: the push decision the dispatcher makes for each recipient (rules 1–10),
// quiet-hours maths across time zones, batching, the A/B title winner, retention cohorts and the
// small display rules Insights shares (fewer than 5, period change). Pure: the Workers feed it rows
// from push_recipients() and act on the result.

export type PushCategory = 'messages' | 'authors' | 'reminders' | 'marketing' | 'account';
export type QuietAction = 'hold' | 'deliver' | 'drop' | 'none';
export type MessagesLevel = 'all' | 'mentions' | 'off';

/** The push_types row the dispatcher needs. */
export interface PushTypeRule {
  key: string;
  category: PushCategory;
  enabled: boolean;
  quiet_action: QuietAction;
  capped: boolean;
  collapse_key: string | null;
  ttl_seconds: number;
  title_template: string;
  body_template: string;
}

/** push_prefs(): the reader's preferences in flow 15's shape. */
export interface PushPrefs {
  messages_level: MessagesLevel;
  authors_new: boolean;
  note_replies: boolean;
  reading_reminders: boolean;
  marketing: boolean;
  quiet_hours_on: boolean;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
}

/** One push_recipients() row. */
export interface PushRecipient {
  user_id: string;
  tokens: string[];
  prefs: PushPrefs;
  marketing_7d: number;
  is_minor: boolean;
  group_muted: boolean;
  blocked: boolean;
  author_pushed_today: boolean;
}

export interface PushContext {
  at: Date;
  /** Campaign marked service: not marketing, so no prefs, cap or minor rule. */
  isService?: boolean;
  /** Campaign "skip readers at the frequency cap" (on by default). */
  skipCapped?: boolean;
  /** Campaign "respect quiet hours" (off only for urgent service pushes, Super admin). */
  respectQuiet?: boolean;
  /** club_message: the reader was mentioned or replied to. */
  mentioned?: boolean;
  /** club_message: the reader has this group's chat open (socket connected). */
  chatOpen?: boolean;
}

export type SkipStatus = 'skipped_pref' | 'skipped_cap' | 'skipped_quiet';

export type PushDecision =
  | { action: 'send' }
  | { action: 'hold'; releaseAt: Date; dropIfOlder: boolean }
  | { action: 'skip'; status: SkipStatus; reason: string };

export const MARKETING_CAP_7D = 2;
/** Platform rule: no marketing 22:00 to 07:00 WAT for anyone (rule 4). */
export const MARKETING_BLOCK = { tz: 'Africa/Lagos', start: '22:00', end: '07:00' } as const;
export const DEFAULT_TZ = 'Africa/Lagos';
/** Held pushes older than this are dropped at release (rule 4). */
export const HELD_MAX_AGE_MS = 12 * 3_600_000;
/** More than this many held messages for one reader become one summary push (rule 4). */
export const HELD_SUMMARY_OVER = 3;
export const EXPO_BATCH = 100;
export const CAMPAIGN_CHUNK = 1000;
export const AB_TEST_SHARE = 0.2;
export const AB_WAIT_MS = 2 * 3_600_000;
export const GROUP_PREVIEW_MAX = 80;

const MESSAGE_TYPES = new Set(['club_message', 'room_starting', 'room_finished']);

const minutesOf = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? (Number(m[1]) % 24) * 60 + Number(m[2]) : 0;
};

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
};

/** Minutes past local midnight of `at` in `tz` (an unknown zone falls back to Africa/Lagos). */
export function localMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: validTz(tz),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** True inside [start, end) local time; a window may cross midnight. Same as SQL in_quiet_window. */
export function inQuietWindow(at: Date, tz: string, start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  const m = localMinutes(at, tz);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** When the window ends (at the minute), or `at` itself when outside it. */
export function quietWindowEnd(at: Date, tz: string, start: string, end: string): Date {
  if (!inQuietWindow(at, tz, start, end)) return at;
  const m = localMinutes(at, tz);
  const wait = (minutesOf(end) - m + 1440) % 1440;
  const floored = at.getTime() - (at.getTime() % 60_000);
  return new Date(floored + wait * 60_000);
}

export const inMarketingBlock = (at: Date) =>
  inQuietWindow(at, MARKETING_BLOCK.tz, MARKETING_BLOCK.start, MARKETING_BLOCK.end);

/** Does the reader's preference allow this type? Account pushes always pass (rule 2). */
function prefAllows(type: PushTypeRule, p: PushPrefs, ctx: PushContext): string | null {
  switch (type.category) {
    case 'messages':
      if (type.key === 'note_reply') return p.note_replies ? null : 'pref_off';
      if (!MESSAGE_TYPES.has(type.key)) return null; // author_reply: a DM, always wanted
      if (p.messages_level === 'off') return 'pref_off';
      if (p.messages_level === 'mentions' && type.key === 'club_message' && !ctx.mentioned) return 'pref_mentions';
      return null;
    case 'authors':
      return p.authors_new ? null : 'pref_off';
    case 'reminders':
      return p.reading_reminders ? null : 'pref_off';
    case 'marketing':
      return ctx.isService || p.marketing ? null : 'pref_off';
    default:
      return null;
  }
}

/**
 * What to do with one push for one reader. Order: staff switch, blocks and mutes, no device,
 * preference, minors, author batching, marketing cap, platform marketing block, reader quiet hours.
 */
export function decidePush(type: PushTypeRule, r: PushRecipient, ctx: PushContext): PushDecision {
  const skip = (status: SkipStatus, reason: string): PushDecision => ({ action: 'skip', status, reason });
  const marketing = type.category === 'marketing' && !ctx.isService;
  if (!type.enabled) return skip('skipped_pref', 'type_off');
  if (r.blocked) return skip('skipped_pref', 'blocked');
  if (type.key === 'club_message' && r.group_muted) return skip('skipped_pref', 'muted');
  if (ctx.chatOpen) return skip('skipped_pref', 'chat_open');
  if (r.tokens.length === 0) return skip('skipped_pref', 'no_token');
  const pref = prefAllows(type, r.prefs, ctx);
  if (pref) return skip('skipped_pref', pref);
  if (marketing && r.is_minor) return skip('skipped_pref', 'minor');
  if (type.category === 'authors' && r.author_pushed_today) return skip('skipped_pref', 'author_batched');
  if (marketing && type.capped && (ctx.skipCapped ?? true) && r.marketing_7d >= MARKETING_CAP_7D)
    return skip('skipped_cap', 'cap');
  if (ctx.respectQuiet === false) return { action: 'send' };
  if (marketing && inMarketingBlock(ctx.at)) return skip('skipped_quiet', 'marketing_block');
  const p = r.prefs;
  if (!p.quiet_hours_on || !inQuietWindow(ctx.at, p.timezone, p.quiet_start, p.quiet_end)) return { action: 'send' };
  // Service campaigns are never dropped: they wait for morning like Account pushes.
  const action: QuietAction = ctx.isService && type.category === 'marketing' ? 'deliver' : type.quiet_action;
  if (action === 'none') return { action: 'send' };
  if (action === 'drop') return skip('skipped_quiet', 'quiet_hours');
  return {
    action: 'hold',
    releaseAt: quietWindowEnd(ctx.at, p.timezone, p.quiet_start, p.quiet_end),
    dropIfOlder: action === 'hold',
  };
}

/** `{{name}}` placeholders; unknown ones become empty. */
export function renderTemplate(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) => String(vars[k] ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Group pushes show "Sender: first 80 characters" (rule 10). */
export function previewText(s: string, max = GROUP_PREVIEW_MAX): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

/** Android notification group: same group within 5 minutes collapses (rule 6). Per type and target. */
export const collapseId = (type: PushTypeRule, target: string | null | undefined) =>
  type.collapse_key ? `${type.collapse_key}:${target ?? 'all'}` : null;

export function chunks<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** A held queue for one reader on release: > 3 messages become one summary (rule 4). */
export function releasePlan<T extends { category: PushCategory; held_at: Date }>(
  held: readonly T[],
  now: Date,
): { send: T[]; summary: T[]; dropped: T[] } {
  const fresh: T[] = [];
  const dropped: T[] = [];
  for (const h of held) {
    if (h.category !== 'account' && now.getTime() - h.held_at.getTime() > HELD_MAX_AGE_MS) dropped.push(h);
    else fresh.push(h);
  }
  const msgs = fresh.filter((h) => h.category === 'messages');
  if (msgs.length <= HELD_SUMMARY_OVER) return { send: fresh, summary: [], dropped };
  return { send: fresh.filter((h) => h.category !== 'messages'), summary: msgs, dropped };
}

export const summaryText = (n: number) => `${n} new messages`;

/**
 * A/B title test: 20% of the audience gets the test (half title A, half title B), the rest gets
 * the winner after 2 hours. Stable per user id, so a re-run picks the same readers.
 */
export function abBucket(userId: string, share = AB_TEST_SHARE): 'a' | 'b' | 'rest' {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) h = Math.imul(h ^ userId.charCodeAt(i), 16777619);
  // Murmur3 finaliser: FNV alone clusters on ids that differ only in their last digits.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  const x = (h >>> 0) / 4294967296;
  if (x >= share) return 'rest';
  return x < share / 2 ? 'a' : 'b';
}

export interface VariantStats {
  sent: number;
  opened: number;
}
/** Higher open rate wins; a tie (or no data) keeps title A. */
export function abWinner(a: VariantStats, b: VariantStats): 'a' | 'b' {
  const rate = (v: VariantStats) => (v.sent > 0 ? v.opened / v.sent : 0);
  return rate(b) > rate(a) ? 'b' : 'a';
}

// ─── Insights display rules ────────────────────────────────────────────────

export const MIN_GROUP = 5;
/** Never show a number for groups under 5 people (rule 28). */
export const groupFigure = (n: number, fmt: (n: number) => string = (x) => Math.round(x).toLocaleString('en-NG')) =>
  n < MIN_GROUP ? 'Fewer than 5' : fmt(n);

/** Change against the previous period in percent (1 decimal), or null when there was nothing before. */
export function periodChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** The previous period of the same length, ending the day before `from` (dates as YYYY-MM-DD). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const day = 86_400_000;
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  const len = Math.round((t - f) / day) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(f - len * day), to: iso(f - day) };
}

/** DAU/MAU stickiness in percent (whole number). */
export const dauMau = (dau: number, mau: number) => (mau > 0 ? Math.round((dau / mau) * 100) : 0);

/** Minutes per session from total reading seconds and session count. */
export const minutesPerSession = (seconds: number, sessions: number) =>
  sessions > 0 ? Math.round(seconds / 60 / sessions) : 0;

export type CohortCell =
  | { state: 'ready'; pct: number }
  | { state: 'young'; label: string }
  | { state: 'small' };

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Retention by sign-up week (rule 26). Day N is known once the whole cohort week is N days old:
 * the last sign-up day + N. Before that the cell says "Day 30 on 2 Dec" and isn't coloured.
 */
export function cohortCell(
  weekStart: string,
  day: number,
  today: string,
  size: number,
  retained: number,
): CohortCell {
  if (size < MIN_GROUP) return { state: 'small' };
  const ready = new Date(Date.parse(`${weekStart}T00:00:00Z`) + (6 + day) * 86_400_000);
  if (Date.parse(`${today}T00:00:00Z`) < ready.getTime())
    return { state: 'young', label: `Day ${day} on ${ready.getUTCDate()} ${SHORT_MONTH[ready.getUTCMonth()]}` };
  return { state: 'ready', pct: Math.round((Math.min(retained, size) / size) * 100) };
}

/** Funnel steps with the share kept from the step before; the biggest drop is pointed out. */
export function funnel(steps: readonly { key: string; count: number }[]) {
  let worst = -1;
  let worstDrop = -1;
  const rows = steps.map((s, i) => {
    const prev = i === 0 ? s.count : steps[i - 1]!.count;
    const kept = prev > 0 ? Math.round((s.count / prev) * 100) : 0;
    if (i > 0 && 100 - kept > worstDrop) {
      worstDrop = 100 - kept;
      worst = i;
    }
    return { ...s, kept };
  });
  return { rows, biggestDrop: worst > 0 ? rows[worst]!.key : null };
}

// ─── CSV (exports) ─────────────────────────────────────────────────────────

/** One CSV cell. Cells a spreadsheet would run as a formula get a leading quote. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: readonly unknown[]) => cells.map(csvCell).join(',') + '\r\n';
