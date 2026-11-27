// Flow 15 · scheduled reports (rule 29, spec check 15-20). Hourly: every enabled
// `export_schedules` row whose cron (Lagos time) came round since it was last sent gets one email
// per named recipient with the period's headline numbers and a link into the console (staff
// sign-in). The firing is claimed before sending, so it goes at most once. A firing more than a day
// late is skipped (the next one goes as normal) so a Worker outage never floods inboxes.
import { ledgerDay, naira } from '@arpedia/core';
import { serviceDb } from '../../db';
import type { Env } from '../../env';
import { sendTemplateEmail } from './email';

type Db = ReturnType<typeof serviceDb>;
export type ReportKind = 'monthly_earnings' | 'weekly_kpi' | 'weekly_safety' | 'quarterly_data_requests';

interface Schedule {
  id: string;
  report_kind: ReportKind;
  recipients: string[];
  cron: string;
  last_sent_at: string | null;
}

const LAGOS = 60 * 60_000; // UTC+1 all year
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One cron field as the set of values it allows (numbers, *, lists, ranges and steps). */
function field(src: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of src.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const step = m[4] ? Number(m[4]) : 1;
    const lo = m[1] === '*' ? min : Number(m[2]);
    const hi = m[1] === '*' ? max : m[3] ? Number(m[3]) : m[4] ? max : lo;
    if (step < 1 || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v === 7 && max === 7 ? 0 : v);
  }
  return out;
}

/**
 * The latest time at or before `now` that the 5-field cron matches, read in Lagos time. Null for an
 * expression it can't read or one that never fired in the last 400 days.
 */
export function lastFire(cron: string, now: Date): Date | null {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [mi, ho, dom, mon, dow] = [
    field(f[0]!, 0, 59),
    field(f[1]!, 0, 23),
    field(f[2]!, 1, 31),
    field(f[3]!, 1, 12),
    field(f[4]!, 0, 7),
  ];
  if (!mi || !ho || !dom || !mon || !dow) return null;
  const anyDom = f[2] === '*';
  const anyDow = f[4] === '*';
  const local = new Date(now.getTime() + LAGOS);
  const minutes = [...mi].sort((a, b) => b - a);
  const hours = [...ho].sort((a, b) => b - a);
  for (let back = 0; back <= 400; back++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - back));
    const domOk = dom.has(d.getUTCDate());
    const dowOk = dow.has(d.getUTCDay());
    // Standard cron: when both day fields are set, either one matching is enough.
    const dayOk = anyDom && anyDow ? true : anyDom ? dowOk : anyDow ? domOk : domOk || dowOk;
    if (!mon.has(d.getUTCMonth() + 1) || !dayOk) continue;
    for (const h of hours)
      for (const m of minutes) {
        const t = d.getTime() + h * 3_600_000 + m * 60_000 - LAGOS;
        if (t <= now.getTime()) return new Date(t);
      }
  }
  return null;
}

/** Start of the Lagos month `offset` months from the one holding `at`, as a UTC instant. */
function monthStart(at: Date, offset: number): Date {
  const l = new Date(at.getTime() + LAGOS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + offset, 1) - LAGOS);
}
const monthLabel = (at: Date) => {
  const l = new Date(at.getTime() + LAGOS);
  return `${MONTHS[l.getUTCMonth()]} ${l.getUTCFullYear()}`;
};

/** The period a firing covers: last month, the last 7 days, or the last 3 months. */
export function periodFor(kind: ReportKind, fire: Date): { from: Date; to: Date; label: string } {
  if (kind === 'monthly_earnings') {
    const from = monthStart(fire, -1);
    return { from, to: monthStart(fire, 0), label: monthLabel(from) };
  }
  if (kind === 'quarterly_data_requests') {
    const from = monthStart(fire, -3);
    const last = monthStart(fire, -1);
    return {
      from,
      to: monthStart(fire, 0),
      label: `${monthLabel(from).split(' ')[0]} to ${monthLabel(last)}`,
    };
  }
  const from = new Date(fire.getTime() - 7 * DAY);
  return { from, to: fire, label: `${ledgerDay(from)} to ${ledgerDay(new Date(fire.getTime() - 1))}` };
}

const n0 = (v: unknown) => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const kobo = (v: unknown) => naira(Number(v) || 0);
const plural = (v: unknown, one: string, many = `${one}s`) => `${n0(v)} ${Number(v) === 1 ? one : many}`;

const SUBJECT: Record<ReportKind, string> = {
  monthly_earnings: 'Monthly earnings statement',
  weekly_kpi: 'Weekly KPIs',
  weekly_safety: 'Weekly safety summary',
  quarterly_data_requests: 'Quarterly data-request log',
};
const PAGE: Record<ReportKind, string> = {
  monthly_earnings: '/royalties',
  weekly_kpi: '/analytics',
  weekly_safety: '/reports',
  quarterly_data_requests: '/data-requests',
};

/** The numbers as short plain lines for the email body. */
export function summaryLines(kind: ReportKind, s: Record<string, unknown>): string {
  switch (kind) {
    case 'monthly_earnings':
      if (s.cycle_status === 'none') return 'This month has not been closed yet, so there is no statement.';
      return [
        `Earned: ${kobo(s.earnings_kobo)} by ${plural(s.authors, 'author')}`,
        `Payable: ${kobo(s.payable_kobo)}`,
        `Held: ${plural(s.held_authors, 'author')} (unverified account, paused or in dispute)`,
        `Carried to next month: ${plural(s.carried_authors, 'author')}`,
        `Status: ${String(s.cycle_status).replace(/_/g, ' ')}${s.payout_date ? ` · payout ${ledgerDay(String(s.payout_date))}` : ''}`,
      ].join('\n');
    case 'weekly_kpi':
      return [
        `New sign-ups: ${n0(s.signups)}`,
        `Readers who read: ${n0(s.active_readers)}`,
        `Reading hours: ${n0(s.reading_hours)}`,
        `Unlocks: ${n0(s.unlocks)}`,
        `Credits spent: ${n0(s.credits_spent)}`,
        `Revenue (gross): ${kobo(s.revenue_kobo)}`,
      ].join('\n');
    case 'weekly_safety':
      return [
        `New reports: ${n0(s.reports)} (${n0(s.high)} high severity)`,
        `Resolved: ${n0(s.resolved)}`,
        `Still open now: ${n0(s.open_now)}`,
        `Sanctions: ${n0(s.sanctions)}`,
        `Appeals: ${n0(s.appeals)}`,
      ].join('\n');
    case 'quarterly_data_requests':
      return [
        `Account deletions asked for: ${n0(s.deletions_requested)}`,
        `Accounts erased: ${n0(s.deletions_done)}`,
        `Deletions on hold (money or legal): ${n0(s.deletions_blocked)}`,
        `Reader data exports sent: ${n0(s.reader_exports)}`,
        `Staff exports with personal details: ${n0(s.staff_personal_exports)}`,
      ].join('\n');
  }
}

export type SendMail = typeof sendTemplateEmail;

/** Sends what is due at `now`. Returns the report kinds sent. */
export async function runScheduledReports(
  env: Env,
  now: Date,
  db: Db = serviceDb(env),
  sendMail: SendMail = sendTemplateEmail,
): Promise<ReportKind[]> {
  const admin = env.ADMIN_URL ?? (env.APP_ENV === 'local' ? 'http://localhost:3000' : null);
  // Off the local stack a missing ADMIN_URL would email a dead link: send nothing until it is set.
  if (!admin) {
    console.error('scheduled reports: ADMIN_URL is not set');
    return [];
  }
  const { data, error } = await db.rpc('scheduled_reports_list');
  if (error) throw error;
  const sent: ReportKind[] = [];
  for (const s of (data ?? []) as unknown as Schedule[]) {
    const fire = lastFire(s.cron, now);
    if (!fire || now.getTime() - fire.getTime() > DAY) continue;
    if (s.last_sent_at && new Date(s.last_sent_at).getTime() >= fire.getTime()) continue;
    const { data: claimed, error: ce } = await db.rpc('claim_scheduled_report', {
      p_id: s.id,
      p_fire_at: fire.toISOString(),
    });
    if (ce) throw ce;
    if (!claimed) continue;
    const p = periodFor(s.report_kind, fire);
    const { data: sum, error: se } = await db.rpc('scheduled_report_summary', {
      p_kind: s.report_kind,
      p_from: p.from.toISOString(),
      p_to: p.to.toISOString(),
    });
    if (se) throw se;
    const vars = {
      subject: SUBJECT[s.report_kind],
      period: p.label,
      summary: summaryLines(s.report_kind, (sum ?? {}) as unknown as Record<string, unknown>),
      link: `${admin}${PAGE[s.report_kind]}`,
    };
    for (const to of s.recipients) {
      try {
        await sendMail(env, db, 'scheduled_report', to, vars);
      } catch (e) {
        console.error(`scheduled report ${s.report_kind} to one recipient failed`, e);
      }
    }
    sent.push(s.report_kind);
  }
  return sent;
}
