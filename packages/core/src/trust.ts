// Flow 14 · Trust, safety and support: report reasons and severities, response promises, the
// muted-word matcher the moderate-text Worker runs, and sanction end dates. Postgres holds the same
// rules (report_severity_setting, report_due_at, _apply_sanction); these mirror them for the screens.

export type ReportContentType =
  'message' | 'discussion_comment' | 'review' | 'post_comment' | 'author_post' | 'profile' | 'book' | 'dm';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'self_harm'
  | 'copyright'
  | 'spoilers'
  | 'impersonation'
  | 'other';

export type Severity = 'high' | 'medium' | 'low';

export const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or scams',
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  sexual: 'Sexual content',
  violence: 'Violence or threats',
  self_harm: 'Self-harm',
  copyright: 'Copyright infringement',
  spoilers: 'Spoilers',
  impersonation: 'Impersonation',
  other: 'Something else',
};

const CHAT_REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'self_harm',
  'copyright',
  'other',
];

/** Rule 3: the reasons a reader may pick depend on what they report. */
export function reasonsFor(type: ReportContentType): ReportReason[] {
  switch (type) {
    case 'book':
      return ['copyright', 'sexual', 'other'];
    case 'profile':
      return ['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other'];
    case 'review':
    case 'discussion_comment':
      return [...CHAT_REASONS.slice(0, 7), 'spoilers', 'other'];
    default:
      return CHAT_REASONS;
  }
}

/** Rule 4 defaults (staff can change them in Safety rules). */
export const DEFAULT_SEVERITY: Record<ReportReason, Severity> = {
  hate: 'high',
  sexual: 'high',
  violence: 'high',
  self_harm: 'high',
  spam: 'medium',
  harassment: 'medium',
  impersonation: 'medium',
  copyright: 'medium',
  spoilers: 'low',
  other: 'low',
};

export function severityFor(
  reason: ReportReason,
  settings?: Partial<Record<ReportReason, Severity>>,
): Severity {
  return settings?.[reason] ?? DEFAULT_SEVERITY[reason];
}

/** Response promise: High within 24 hours, others within 3 days (Q80). */
export const PROMISE_HOURS: Record<Severity, number> = { high: 24, medium: 72, low: 72 };
const HOUR = 3_600_000;

export function reportDueAt(severity: Severity, from: Date, hours = PROMISE_HOURS): Date {
  return new Date(from.getTime() + hours[severity] * HOUR);
}

/** Support: first reply within 1 day. */
export const TICKET_FIRST_REPLY_HOURS = 24;

/** Time left (positive) or over (negative) against a promise, as the queues show it: "5h left", "3h over". */
export function slaLabel(dueAt: Date, now: Date): { text: string; late: boolean } {
  const diff = dueAt.getTime() - now.getTime();
  const late = diff < 0;
  const mins = Math.abs(diff) / 60_000;
  const text =
    mins < 60
      ? `${Math.max(1, Math.floor(mins))}m`
      : mins < 48 * 60
        ? `${Math.floor(mins / 60)}h`
        : `${Math.floor(mins / 1440)}d`;
  return { text: `${text} ${late ? 'over' : 'left'}`, late };
}

export type SanctionKind = 'warn' | 'mute' | 'suspend' | 'ban';

/** Default lengths: mute 7 days, suspend 30 days, ban never ends; a warning counts for 90 days. */
export const SANCTION_DAYS: Record<SanctionKind, number | null> = {
  warn: 90,
  mute: 7,
  suspend: 30,
  ban: null,
};

export function sanctionEndsAt(kind: SanctionKind, startsAt: Date, days?: number | null): Date | null {
  const d = kind === 'ban' ? null : (days ?? SANCTION_DAYS[kind]);
  return d == null ? null : new Date(startsAt.getTime() + d * 86_400_000);
}

/** Reduce on appeal: the new end, and whether access comes back at once (the time has passed). */
export function reducedSanction(
  startsAt: Date,
  days: number,
  now: Date,
): { endsAt: Date; endedNow: boolean } {
  const endsAt = new Date(startsAt.getTime() + days * 86_400_000);
  return { endsAt, endedNow: endsAt.getTime() <= now.getTime() };
}

/** Appeals are open for 14 days after a decision. */
export function canAppeal(decidedAt: Date, now: Date): boolean {
  return now.getTime() - decidedAt.getTime() <= 14 * 86_400_000;
}

/** "Your account is suspended until 12 Dec." (WAT). */
export function suspendedUntilCopy(endsAt: Date | null): string {
  if (!endsAt) return 'Your account has been closed for breaking our community rules.';
  const day = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  }).format(endsAt);
  return `Your account is suspended until ${day}. You can appeal from the email we sent.`;
}

// ─── Muted-word matcher (rule 25) ───────────────────────────────────────────
export type WordAction = 'hide' | 'hide_and_report' | 'blur' | 'warn';
export type WordScope = 'everywhere' | 'chat_dms' | 'reviews';

export interface MutedWord {
  id: string;
  text: string;
  is_phrase: boolean;
  scope: WordScope;
  action: WordAction;
}

const SUBSTITUTIONS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '|': 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
};

/**
 * Lower-case, undo common substitutions (0 → o, @ → a, $ → s), and fold repeated letters to one
 * (stuuupid → stupid). Everything that is not a letter becomes a single space.
 */
export function normaliseForMatch(text: string): string {
  const lowered = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let out = '';
  for (const ch of lowered) out += SUBSTITUTIONS[ch] ?? ch;
  return out
    .replace(/[^a-z]+/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .trim();
}

const ACTION_RANK: Record<WordAction, number> = { warn: 0, blur: 1, hide: 2, hide_and_report: 3 };

/**
 * Words match whole words; phrases match anywhere as a run of normalised words. Returns the hits and
 * the strongest action (hide_and_report > hide > blur > warn), or null when nothing matched.
 */
export function matchMutedWords(
  text: string,
  words: MutedWord[],
  surface: 'chat' | 'dm' | 'review' | 'comment',
): { hits: MutedWord[]; action: WordAction | null } {
  const body = ` ${normaliseForMatch(text)} `;
  const squashed = body.replace(/ /g, '');
  const hits = words.filter((w) => {
    if (w.scope === 'chat_dms' && surface !== 'chat' && surface !== 'dm') return false;
    if (w.scope === 'reviews' && surface !== 'review') return false;
    const needle = normaliseForMatch(w.text);
    if (!needle) return false;
    return w.is_phrase
      ? body.includes(` ${needle} `) || squashed.includes(needle.replace(/ /g, ''))
      : body.includes(` ${needle} `);
  });
  const action = hits.reduce<WordAction | null>(
    (best, w) => (best === null || ACTION_RANK[w.action] > ACTION_RANK[best] ? w.action : best),
    null,
  );
  return { hits, action };
}

/** Nigerian phone numbers in chat (+234 / 0 then 7, 8 or 9, then 0 or 1, then 8 digits). */
export function hasPhoneNumber(text: string): boolean {
  return /(?:\+?234|\b0)[\s-]?[789][01](?:[\s-]?\d){8}\b/.test(text);
}

export function hasLink(text: string): boolean {
  return /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|ng|net|org|io|me|ly|co|africa)\b/i.test(text);
}

/** Links to anywhere but the allowed domains (arpedia.africa by default). */
export function hasBlockedLink(text: string, allowed: string[] = ['arpedia.africa']): boolean {
  const re = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/\S*)?/gi;
  for (const m of text.matchAll(re)) {
    const host = m[1]!.toLowerCase();
    if (!/\.(?:com|ng|net|org|io|me|ly|co|africa|info|xyz|link)$/.test(host)) continue;
    if (!allowed.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  }
  return false;
}
