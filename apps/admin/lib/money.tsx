import Link from 'next/link';
import type { ReactNode } from 'react';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff, type Staff } from '@/lib/staff';
import type { serverSupabase } from '@/lib/supabase/server';

// Shared bits of the flow 09 money screens (credits, revenue, transactions, refunds, subscriptions).

export type Supa = Awaited<ReturnType<typeof serverSupabase>>;

export const n0 = (n: number) => n.toLocaleString('en-NG');
export const PAGE_SIZE = 25;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const lagos = (ms: number) => new Date(ms + 3_600_000); // WAT, no daylight saving

/** "12 Nov", Lagos time. */
export const dayMonth = (at: string | number | Date) => {
  const d = lagos(new Date(at).getTime());
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** A month in Lagos time: its first instant, its first day (YYYY-MM-DD) and "1 to 12 November". */
export function monthOf(year: number, month: number, now = Date.now()) {
  const start = Date.UTC(year, month, 1) - 3_600_000;
  const next = Date.UTC(year, month + 1, 1) - 3_600_000;
  const l = lagos(now);
  const current = l.getUTCFullYear() === year && l.getUTCMonth() === month;
  const lastDay = current ? l.getUTCDate() : new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    iso: new Date(start).toISOString(),
    endIso: new Date(next).toISOString(),
    day: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    name: LONG[month]!,
    short: MONTHS[month]!,
    current,
    label: `1 to ${lastDay} ${LONG[month]}`,
    shortLabel: `1 to ${lastDay} ${MONTHS[month]}`,
  };
}

/** This Lagos month, or a month back from it. */
export function thisMonth(back = 0, now = Date.now()) {
  const l = lagos(now);
  const d = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() - back, 1));
  return monthOf(d.getUTCFullYear(), d.getUTCMonth(), now);
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('') || '?';

const AVATARS = ['g', 'm', 'b', 'o', 't', 'r', 'k'];
/** The prototype's avatar colours, fixed per person. */
export function avClass(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

export const PLATFORM: Record<string, string> = { play: 'Google Play', app_store: 'App Store', web: 'Web' };

/** Plan and top-up names for the Item and Plan columns. */
export const planName = (code: string | null | undefined) => (code ? code[0]!.toUpperCase() + code.slice(1) : '');

/** Money screens: the signed-in staff member, or the s-no-access page when the role cannot open this page. */
export async function guard(page: string, label: string): Promise<{ staff: Staff; denied: ReactNode | null }> {
  const staff = await requireStaff();
  const denied = canOpen(page, staff.permissions) ? null : <NoAccess page={page} label={label} role={staff.role} />;
  return { staff, denied };
}

/** Fetches the page the URL asks for, never below 1. */
export const pageNo = (raw: string | undefined) => Math.max(1, Math.floor(Number(raw)) || 1);

/** A panel body for a list with nothing in it. */
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty" style={{ padding: '64px 24px' }}>
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}

/** "Showing 11 of 1,997 transactions" with Previous and Next, as in the prototype. */
export function Pager({
  page,
  shown,
  total,
  noun,
  href,
}: {
  page: number;
  shown: number;
  total: number;
  noun: string;
  href: (p: number) => string;
}) {
  const hasNext = page * PAGE_SIZE < total;
  return (
    <div className="pager">
      <span>{`Showing ${n0(shown)} of ${n0(total)} ${noun}`}</span>
      <div className="row">
        {page > 1 ? (
          <Link className="btn btn-g sm" href={href(page - 1)}>
            Previous
          </Link>
        ) : (
          <button className="btn btn-g sm" type="button" disabled>
            Previous
          </button>
        )}
        {hasNext ? (
          <Link className="btn btn-g sm" href={href(page + 1)}>
            Next
          </Link>
        ) : (
          <button className="btn btn-g sm" type="button" disabled>
            Next
          </button>
        )}
      </div>
    </div>
  );
}

/** The prototype's quick filter chips as links, so a filter is a URL and survives a reload. */
export function Chips({ items }: { items: { href: string; label: string; count?: number; on: boolean }[] }) {
  return (
    <div className="row">
      {items.map(i => (
        <Link key={i.label} className={`fchip${i.on ? ' is-selected' : ''}`} href={i.href} aria-current={i.on || undefined}>
          {i.label}
          {i.count !== undefined && <span className="c">{n0(i.count)}</span>}
        </Link>
      ))}
    </div>
  );
}

/** Table row and search values safe to drop into a PostgREST `or(...)` filter. */
export const safeTerm = (q: string) => q.replace(/[^\p{L}\p{N} @._-]/gu, '').trim();

/** The error text for a failed money RPC: staff see why, never a raw database message. */
export function rpcError(code: string | undefined, message: string, map: Record<string, string>, fallback: string) {
  if (code === '42501') return map['42501'] ?? "Your role can't do this.";
  return map[message] ?? fallback;
}
