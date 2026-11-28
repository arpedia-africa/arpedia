// Shared bits of the audit log (s-audit, s-audit-entry and the CSV export).

export interface AuditRow {
  id: number;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  area: string;
  action: string;
  object_type: string | null;
  object_id: string | null;
  object_label: string | null;
  summary: string | null;
  ip: string | null;
  /** Where the staff browser was (spec check 16-27); null for older entries. */
  city: string | null;
}

/** "IP and place": "105.112.34.18 · Lagos", or with the country, "· Lagos, Nigeria". */
export function ipAndPlace(ip: string | null, city: string | null, country?: string | null): string {
  let name: string | undefined;
  if (country) {
    try {
      name = new Intl.DisplayNames(['en'], { type: 'region' }).of(country);
    } catch {
      name = country;
    }
  }
  const place = [city, name].filter(Boolean).join(', ');
  return [ip, place].filter(Boolean).join(' · ') || '–';
}

export interface AuditPage {
  total: number;
  rows: AuditRow[];
  actors: { id: string; name: string | null }[];
}

export interface AuditFilters {
  q: string;
  actor: string;
  area: string;
  action: string;
  /** Days back from now: 1, 7 (default), 30, 90, 365, or 0 for everything kept. */
  days: number;
  page: number;
  per: number;
}

export const AREAS: Record<string, string> = {
  books: 'Books',
  money: 'Money',
  team: 'Team',
  settings: 'Settings',
  community: 'Community',
  moderation: 'Moderation',
  readers: 'Readers',
  authors: 'Authors',
  engage: 'Engage',
  support: 'Support',
};

export const RANGES: Record<number, string> = {
  1: 'Last 24 hours',
  7: 'Last 7 days',
  30: 'Last 30 days',
  90: 'Last 90 days',
  365: 'Last 12 months',
  0: 'All time',
};

const ACTIONS: Record<string, string> = {
  'audit.export': 'Exported audit log',
  'staff.invite': 'Invited staff',
  'staff.change_role': 'Changed role',
  'staff.reset_two_step': 'Reset two-step',
  'staff.revoke_invite': 'Revoked invite',
  'staff.disable': 'Disabled staff',
  'staff.enable': 'Switched staff back on',
  'policy.publish': 'Published policy',
  'policy.accept_again': 'Changed accept again',
  'integration.rotate_key': 'Rotated key',
  'config.ota_rollback': 'Rolled back app update',
  'config.maintenance': 'Changed maintenance mode',
  'config.force_update': 'Changed force update',
  'copy.edit': 'Edited app copy',
  'pricing_rules.save': 'Saved pricing rules',
  'pricing_rules.undo': 'Undid pricing rules',
  save_pricing_rules: 'Saved pricing rules',
  grant_credits: 'Granted credits',
  request_credit_grant: 'Asked to grant credits',
  approve_credit_grant: 'Approved credit grant',
  reject_credit_grant: 'Rejected credit grant',
  remove_credits: 'Removed credits',
  request_credit_removal: 'Asked to remove credits',
  approve_credit_removal: 'Approved credit removal',
  reject_credit_removal: 'Rejected credit removal',
  return_chapter: 'Returned a chapter',
  extend_subscription: 'Extended subscription',
  save_plan: 'Saved plan',
  create_promo: 'Created promo code',
  promo_status: 'Changed promo code',
  'book.preview_override': 'Changed book preview',
  'author_earnings.close_month': 'Closed author earnings',
};

/** "Closed author earnings" for a known action key; otherwise the key in plain words. */
export function actionLabel(key: string): string {
  if (ACTIONS[key]) return ACTIONS[key];
  if (key.startsWith('flag.')) return 'Changed feature flag';
  if (key.startsWith('config.')) return 'Changed app setting';
  const words = key.replace(/[._]/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : key;
}

/** Where the object of an entry lives in the console, when it has a page. */
export function objectHref(type: string | null, id: string | null): string | null {
  if (!type) return null;
  switch (type) {
    case 'book':
      return id ? `/books/${id}` : null;
    case 'user':
    case 'reader':
      return id ? `/credits/${id}` : null;
    case 'subscription':
      return id ? `/subscriptions/${id}` : null;
    case 'refund':
      return id ? `/refunds/${id}` : null;
    case 'staff':
    case 'staff_invite':
      return '/team';
    case 'policy':
      return '/policies';
    case 'integration':
      return '/integrations';
    case 'pricing_rules':
      return '/pricing-rules';
    case 'promo':
      return '/promos';
    case 'app_config':
    case 'feature_flag':
    case 'remote_copy':
      return '/config';
    default:
      return null;
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const lagos = (ms: number) => new Date(ms + 3_600_000);
const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
const hm = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

function relDay(iso: string, now: number): 'Today' | 'Yesterday' | null {
  const d = dayKey(lagos(new Date(iso).getTime()));
  if (d === dayKey(lagos(now))) return 'Today';
  if (d === dayKey(lagos(now - 86_400_000))) return 'Yesterday';
  return null;
}

/** "Today 8:40", "Yesterday 17:20", "Wed 11 Nov 16:20", Lagos time. */
export function when(iso: string, now: number): string {
  const d = lagos(new Date(iso).getTime());
  const rel = relDay(iso, now);
  if (rel) return `${rel} ${hm(d)}`;
  const year = d.getUTCFullYear() === lagos(now).getUTCFullYear() ? '' : ` ${d.getUTCFullYear()}`;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year} ${hm(d)}`;
}

/** "Today, Thursday 12 November 2026, 8:40:12 WAT". */
export function whenLong(iso: string, now: number): string {
  const d = lagos(new Date(iso).getTime());
  const rel = relDay(iso, now);
  const s = String(d.getUTCSeconds()).padStart(2, '0');
  const date = `${LONG_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hm(d)}:${s} WAT`;
  return rel ? `${rel}, ${date}` : date;
}

/** "12 November 2033". */
export function longDate(iso: string): string {
  const d = lagos(new Date(iso).getTime());
  return `${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const DAY_OPTIONS = [1, 7, 30, 90, 365, 0];

/** Filters from the URL (they survive a reload and can be shared). */
export function readFilters(sp: Record<string, string | undefined>): AuditFilters {
  const days = sp.days === undefined ? 7 : Number(sp.days);
  const per = Math.floor(Number(sp.per)) || 25;
  return {
    q: (sp.q ?? '').slice(0, 80),
    actor: /^[0-9a-f-]{36}$/i.test(sp.actor ?? '') ? sp.actor! : '',
    area: sp.area && AREAS[sp.area] ? sp.area : '',
    action: /^[a-z_.]{1,60}$/.test(sp.action ?? '') ? sp.action! : '',
    days: DAY_OPTIONS.includes(days) ? days : 7,
    page: Math.max(1, Math.floor(Number(sp.page)) || 1),
    per: Math.min(50, Math.max(10, per)),
  };
}

/** The URL for these filters, with one change. Defaults are left out. */
export function filterHref(f: AuditFilters, change: Partial<AuditFilters> = {}, base = '/audit'): string {
  const n = { ...f, page: 1, ...change };
  const p = new URLSearchParams();
  if (n.q) p.set('q', n.q);
  if (n.actor) p.set('actor', n.actor);
  if (n.area) p.set('area', n.area);
  if (n.action) p.set('action', n.action);
  if (n.days !== 7) p.set('days', String(n.days));
  if (n.per !== 25) p.set('per', String(n.per));
  if (n.page > 1) p.set('page', String(n.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** list_audit arguments for these filters. */
export function rpcArgs(f: AuditFilters, now: number) {
  return {
    p_actor: f.actor || undefined,
    p_area: f.area || undefined,
    p_action: f.action || undefined,
    // "All time" asks from the start of the 7-year retention.
    p_from: new Date(now - (f.days || 365 * 7 + 2) * 86_400_000).toISOString(),
    p_q: f.q || undefined,
    p_page: f.page,
    p_per: f.per,
  };
}
