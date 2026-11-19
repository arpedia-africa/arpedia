import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { canOpen } from '@/lib/nav';
import { requireStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { Menu } from '../books/menu';
import { RowLink } from '../books/row';
import { countryName, initials, lastSeen, planCell, day, tone, type Plan } from './shared';

export const metadata: Metadata = { title: 'Readers · Arpedia Admin' };

const TABS = [
  ['all', 'All'],
  ['subscribers', 'Subscribers'],
  ['lapsed', 'Lapsed'],
  ['no_plan', 'No plan'],
  ['suspended', 'Suspended'],
  ['deleted', 'Deleted'],
] as const;
type Tab = (typeof TABS)[number][0];

const FILTERS: { key: string; value: string; label: string }[] = [
  { key: 'plan', value: 'monthly', label: 'Plan: Monthly' },
  { key: 'plan', value: 'quarterly', label: 'Plan: Quarterly' },
  { key: 'plan', value: 'yearly', label: 'Plan: Yearly' },
  { key: 'platform', value: 'android', label: 'Platform: Android' },
  { key: 'platform', value: 'ios', label: 'Platform: iPhone' },
  { key: 'country', value: 'NG', label: 'Country: Nigeria' },
  { key: 'country', value: 'GH', label: 'Country: Ghana' },
  { key: 'country', value: 'KE', label: 'Country: Kenya' },
  { key: 'role', value: 'author', label: 'Role: Reader and author' },
  { key: 'role', value: 'reader', label: 'Role: Reader only' },
];
const FILTER_KEYS = ['plan', 'platform', 'country', 'role', 'joined_from', 'joined_to'] as const;

interface Row {
  id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
  country: string;
  plan: Plan | null;
  credits: number;
  last_active: string | null;
  joined: string;
  is_author: boolean;
  deleted: boolean;
  deletion_requested: boolean;
}
interface List {
  counts: Record<Tab, number>;
  total: number;
  page: number;
  rows: Row[];
}

type Search = Partial<Record<(typeof FILTER_KEYS)[number] | 'q' | 'tab' | 'page', string>>;

/** People · Readers (s-users): search, tabs with counts, one Filters button, 50 per page. */
export default async function ReadersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const staff = await requireStaff();
  if (!canOpen('users', staff.permissions)) return <NoAccess page="users" label="Readers" role={staff.role} />;
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : 'all';
  const page = Math.max(1, Number(sp.page) || 1);
  const filters = Object.fromEntries(FILTER_KEYS.filter(k => sp[k]).map(k => [k, sp[k]!]));
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('staff_list_readers', {
    p_query: sp.q || undefined,
    p_tab: tab,
    p_filters: filters,
    p_page: page,
  });
  const list = data as unknown as List | null;

  const href = (over: Partial<Search>) => {
    const p = new URLSearchParams();
    const all: Search = { ...sp, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/users?${s}` : '/users';
  };
  const from = list && list.total ? (page - 1) * 50 + 1 : 0;
  const to = list ? Math.min(page * 50, list.total) : 0;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Readers</h1>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <Link key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-selected' : undefined} href={href({ tab: k === 'all' ? undefined : k, page: undefined })}>
            {label} <span className="c">{(list?.counts[k] ?? 0).toLocaleString('en-NG')}</span>
          </Link>
        ))}
      </div>
      <div className="page">
        <form className="toolbar" action="/users" method="get">
          {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
          {Object.entries(filters).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label className="search">
            <Icon name="search" size="s" />
            <input name="q" defaultValue={sp.q} placeholder="Name, email, phone or user id" aria-label="Search readers" />
          </label>
          <Menu
            left
            trigger={
              <>
                <Icon name="filter" />
                Filters
              </>
            }
          >
            {FILTERS.map(f => (
              <Link key={`${f.key}:${f.value}`} href={href({ [f.key]: f.value, page: undefined })}>
                {f.label}
              </Link>
            ))}
          </Menu>
          {FILTERS.filter(f => sp[f.key as keyof Search] === f.value).map(f => (
            <span className="achip" key={f.key}>
              {f.label}
              <Link aria-label="Remove filter" href={href({ [f.key]: undefined, page: undefined })}>
                <Icon name="x" size="s" />
              </Link>
            </span>
          ))}
        </form>
        <div className="panel panel--flush">
          {error ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>Readers didn&apos;t load</b>
              <span>Refresh the page to try again.</span>
            </div>
          ) : !list?.rows.length ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>No readers here</b>
              <span>{sp.q || Object.keys(filters).length ? 'No readers match. Clear the search or filters.' : 'Readers who sign up will show here.'}</span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Reader</th>
                    <th>Plan</th>
                    <th className="r">Credits</th>
                    <th>Last active</th>
                    <th>Joined</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map(r => (
                    <RowLink key={r.id} href={`/users/${r.id}`}>
                      <td>
                        <div className="who">
                          {r.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="av sm" src={r.avatar_url} alt="" />
                          ) : (
                            <span className={`av sm ${tone(r.id)}`}>{initials(r.name)}</span>
                          )}
                          <span>
                            <b>{r.name || 'No name'}</b>
                            <small>{`${r.email ?? 'No email'} · ${countryName(r.country)}`}</small>
                          </span>
                        </div>
                      </td>
                      <td>{r.deleted ? <span className="st st-err">Deleted</span> : planCell(r.plan)}</td>
                      <td className="n">{r.credits.toLocaleString('en-NG')}</td>
                      <td className="nw">{lastSeen(r.last_active)}</td>
                      <td className="nw">{day(r.joined)}</td>
                      <td className={r.deletion_requested || r.is_author ? undefined : 'muted'}>
                        {r.deletion_requested ? 'Deletion request' : r.is_author ? 'Author' : 'None'}
                      </td>
                    </RowLink>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{list?.total ? `${from.toLocaleString('en-NG')} to ${to.toLocaleString('en-NG')} of ${list.total.toLocaleString('en-NG')}` : 'No readers'}</span>
            <div className="row">
              {page > 1 ? (
                <Link className="btn btn-g sm" href={href({ page: String(page - 1) })}>
                  Previous
                </Link>
              ) : (
                <span className="btn btn-g sm dis">Previous</span>
              )}
              {list && to < list.total ? (
                <Link className="btn btn-g sm" href={href({ page: String(page + 1) })}>
                  Next
                </Link>
              ) : (
                <span className="btn btn-g sm dis">Next</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
