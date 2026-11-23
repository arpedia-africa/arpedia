import Link from 'next/link';
import { RowLink } from '../books/row';
import { initials, date as fullDate } from '../books/shared';
import { serverSupabase } from '@/lib/supabase/server';
import { NoAccess } from '@/components/no-access';
import { Icon } from '@/components/icon';
import { Menu } from '../books/menu';
import {
  AuthorsHeader,
  applicationCount,
  avClass,
  followers,
  gate,
  loadAuthors,
  loadFollowers,
  monthName,
  n0,
  naira,
} from './shared';

interface Search {
  q?: string;
  payout?: string;
  genre?: string;
  earning?: string;
}

/** The month the earnings column is for: last month, Lagos time. */
function lastMonth() {
  const now = new Date(Date.now() + 3_600_000);
  now.setUTCDate(1);
  now.setUTCMonth(now.getUTCMonth() - 1);
  return now.toISOString().slice(0, 7);
}

/** Authors (s-authors): every author, most earned first, with payout account status. */
export default async function AuthorsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const g = await gate();
  if ('denied' in g) return g.denied;
  const sp = await searchParams;
  const supabase = await serverSupabase();
  const [{ rows: all, denied, failed }, waiting, follows] = await Promise.all([
    loadAuthors(supabase),
    applicationCount(supabase),
    loadFollowers(supabase),
  ]);
  if (denied) return <NoAccess page="applications" label="Authors and applications" role={g.staff.role} />;
  if (failed) throw new Error('Could not load authors');

  const month = lastMonth();
  const q = sp.q?.trim().toLowerCase();
  const rows = all
    .filter(a => {
      if (q && !a.pen_name.toLowerCase().includes(q)) return false;
      if (sp.payout && a.payout_account_status !== sp.payout) return false;
      if (sp.genre && !a.genres.includes(sp.genre)) return false;
      if (sp.earning === 'some' && !(a.last_month_kobo > 0)) return false;
      if (sp.earning === 'none' && a.last_month_kobo > 0) return false;
      return true;
    })
    .sort((a, b) => b.last_month_kobo - a.last_month_kobo || a.pen_name.localeCompare(b.pen_name));

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sp.q) p.set('q', sp.q);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/authors?${p}`;
  };
  const genres = [...new Set(all.flatMap(a => a.genres))].sort();
  const filters = [
    { href: keep({ payout: 'not_set' }), label: 'Payout account: Not set' },
    { href: keep({ payout: 'failed' }), label: 'Payout account: Failed' },
    { href: keep({ payout: 'verified' }), label: 'Payout account: Verified' },
    { href: keep({ earning: 'some' }), label: `Earned in ${monthName(month, true)}` },
    { href: keep({ earning: 'none' }), label: `No earnings in ${monthName(month, true)}` },
    ...genres.map(g => ({ href: keep({ genre: g }), label: `Genre: ${g}` })),
  ];
  const filtered = !!(q || sp.payout || sp.genre || sp.earning);

  return (
    <section className="screen enter">
      <AuthorsHeader tab="authors" authors={all.length} waiting={waiting} />
      <div className="page">
        <form className="toolbar" action="" method="get">
          <label className="search">
            <Icon name="search" size="s" />
            <input name="q" defaultValue={sp.q} placeholder="Author name or pen name" aria-label="Search authors" />
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
            {filters.map(f => (
              <Link key={f.href} href={f.href}>
                {f.label}
              </Link>
            ))}
            {filtered && <Link href="/authors">Clear filters</Link>}
          </Menu>
        </form>
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>{all.length ? 'No authors match' : 'No authors yet'}</b>
              <span>
                {all.length
                  ? 'Clear the search or filters to see every author.'
                  : 'When you approve an application, the author shows here.'}
              </span>
              {!all.length && (
                <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
                  <Link className="btn btn-p" href="/applications">
                    Open applications
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Author</th>
                    <th className="r">Books live</th>
                    <th className="r">Readers</th>
                    <th className="r">{`Earned, ${monthName(month, true)}`}</th>
                    <th>Payout account</th>
                    <th>Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(a => {
                    const joined = fullDate(a.approved_at).split(' ').slice(1).join(' ');
                    return (
                      <RowLink key={a.user_id} href={`/authors/${a.user_id}`}>
                        <td>
                          <div className="who">
                            <span className={`av sm ${avClass(a.user_id)}`}>{initials(a.pen_name)}</span>
                            <span>
                              <b>{a.pen_name}</b>
                              <small>
                                {[
                                  a.genres.slice(0, 2).join(', ') || 'No books yet',
                                  followers(follows.get(a.user_id) ?? 0),
                                  joined,
                                  a.status === 'suspended' ? 'Suspended' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td className="n">{n0(a.books_live)}</td>
                        <td className="n">{n0(a.reads)}</td>
                        <td className="n">{naira(a.last_month_kobo)}</td>
                        <td>
                          {a.payout_account_status === 'failed' ? (
                            <span className="st st-err">Failed</span>
                          ) : a.payout_account_status === 'not_set' ? (
                            <span className="st st-warn">Not set</span>
                          ) : (
                            <span className="st-plain">Verified</span>
                          )}
                        </td>
                        <td>
                          {a.club_group_id ? (
                            <Link className="link" href={`/community/${a.club_group_id}`}>
                              Open
                            </Link>
                          ) : (
                            <span className="faint">None yet</span>
                          )}
                        </td>
                      </RowLink>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>
              {rows.length ? `${n0(rows.length)} of ${n0(all.length)} author${all.length === 1 ? '' : 's'} · most earned first` : 'Nothing to show'}
            </span>
            <span>{`Earnings are for ${monthName(month)}. Readers are people who unlocked their books.`}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
