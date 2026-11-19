import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';

// Flow 10 · bits shared by the Readers pages (s-users, s-user, s-user-activity, s-user-delete).

export interface Plan {
  plan: string;
  status: string;
  period_start: string;
  period_end: string;
}

const TONES = ['g', 't', 'b', 'm', 'k', 'r', 'o', 'n'] as const;
/** Stable avatar tone for a person (`.av.g|t|b|…`). */
export const tone = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('') || '?';

const COUNTRIES: Record<string, string> = {
  NG: 'Nigeria',
  GH: 'Ghana',
  KE: 'Kenya',
  ZA: 'South Africa',
  CM: 'Cameroon',
  GB: 'United Kingdom',
  US: 'United States',
  CA: 'Canada',
};
export const countryName = (code: string | null | undefined) => (code ? COUNTRIES[code] ?? code : 'Unknown');

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lagos = (iso: string) => new Date(new Date(iso).getTime() + 3_600_000);

/** "4 Mar 2026". */
export const day = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = lagos(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** "Today, 08:12", "Yesterday", "9 Nov", "2 Nov 2025" (Lagos time). */
export function lastSeen(iso: string | null | undefined, now = new Date()) {
  if (!iso) return 'Never';
  const d = lagos(iso);
  const n = lagos(now.toISOString());
  const key = (x: Date) => `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}`;
  const yesterday = new Date(n.getTime() - 86_400_000);
  if (key(d) === key(n)) return `Today, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  if (key(d) === key(yesterday)) return 'Yesterday';
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === n.getUTCFullYear() ? base : `${base} ${d.getUTCFullYear()}`;
}

const ACTIVE = ['active', 'grace', 'billing_retry'];
/** Plan cell: plain text when normal, a warning pill once lapsed. */
export function planCell(plan: Plan | null): ReactNode {
  if (!plan) return <span className="muted">No plan</span>;
  if (ACTIVE.includes(plan.status)) return `${cap(plan.plan)} · active`;
  const d = lagos(plan.period_end);
  return <span className="st st-warn">{`${cap(plan.plan)} · lapsed ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`}</span>;
}
export const planLabel = (plan: Plan | null) => (plan ? cap(plan.plan) : 'No plan');

export type ReaderTab = 'overview' | 'credits' | 'activity' | 'safety';

export interface ReaderHead {
  id: string;
  name: string;
  avatar_url: string | null;
  joined: string;
  country: string;
  platform: string | null;
  app_version: string | null;
  sign_in: string[];
  deleted_at: string | null;
  last_seen: string | null;
}

/** `.ph` page head with crumbs, the person, the actions and the four tabs (same on every tab). */
export function ReaderHeader({
  r,
  tab,
  big,
  actions,
}: {
  r: ReaderHead;
  tab: ReaderTab;
  /** Overview shows the xl avatar and full meta; other tabs the lg avatar. */
  big?: boolean;
  actions: ReactNode;
}) {
  const base = `/users/${r.id}`;
  const crumbs = tab === 'overview' ? null : tab === 'activity' ? 'Reading and devices' : tab === 'credits' ? 'Credits' : 'Safety';
  return (
    <>
      <div className="ph">
        <div className="crumbs">
          <Link href="/users">Readers</Link>
          <Icon name="chev" size="s" />
          {crumbs ? (
            <>
              <Link href={base}>{r.name}</Link>
              <Icon name="chev" size="s" />
              <span>{crumbs}</span>
            </>
          ) : (
            <span>{r.name}</span>
          )}
        </div>
        <div className="ph__row">
          {r.avatar_url ? (
            <img className={`av ${big ? 'xl' : 'lg'}`} src={r.avatar_url} alt="" />
          ) : (
            <span className={`av ${big ? 'xl' : 'lg'} ${tone(r.id)}`}>{initials(r.name)}</span>
          )}
          <div className="ph__title">
            <h1>{r.name}</h1>
            <div className="ph__meta">
              <span>{r.deleted_at ? 'Deleted' : 'Active'}</span>
              {big ? (
                <>
                  <span>
                    User id <span className="mono">{`usr_${r.id.slice(0, 8)}`}</span>
                  </span>
                  <span>Joined {day(r.joined)}</span>
                  <span>{countryName(r.country)}</span>
                  {r.platform && <span>{`${r.platform}${r.app_version ? ` · app ${r.app_version}` : ''}`}</span>}
                  <span>{r.sign_in.includes('google') ? 'Google sign-in' : 'Email sign-in'}</span>
                </>
              ) : (
                <>
                  <span className="mono">{`usr_${r.id.slice(0, 8)}`}</span>
                  <span>Last active {lastSeen(r.last_seen).replace(/^Today/, 'today')}</span>
                </>
              )}
            </div>
          </div>
          <div className="ph__acts">{actions}</div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['overview', 'Overview', base],
            ['credits', 'Credits', `${base}/credits`],
            ['activity', 'Reading and devices', `${base}/activity`],
            ['safety', 'Safety', `${base}/safety`],
          ] as const
        ).map(([k, label, href]) => (
          <Link key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-selected' : undefined} href={href}>
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
