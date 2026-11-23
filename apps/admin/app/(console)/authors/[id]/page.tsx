import Link from 'next/link';
import { notFound } from 'next/navigation';
import { creditsToNaira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { NoAccess } from '@/components/no-access';
import { serverSupabase } from '@/lib/supabase/server';
import { clock, coverClass, dayMonth, date, initials } from '../../books/shared';
import { authorName, avClass, gate, lagosMonth, loadAuthor, loadSocial, monthName, n0, naira } from '../shared';
import { AuthorActions } from './client';

const STAGE: Record<string, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  unpublished: 'Unpublished',
  taken_down: 'Taken down',
  rejected: 'Rejected',
  draft: 'Draft',
  in_review: 'In review',
};

/** Author (s-author): header line, books, earnings by month, tips and recent Studio activity. */
export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate();
  if ('denied' in g) return g.denied;
  const supabase = await serverSupabase();
  const [r, social] = await Promise.all([loadAuthor(supabase, id), loadSocial(supabase, id)]);
  if ('denied' in r) return <NoAccess page="applications" label="Authors and applications" role={g.staff.role} />;
  if ('missing' in r) notFound();
  const a = r.author;
  const channel = a.profile.club_group_id ?? social?.community?.id ?? null;
  const name = authorName(a);
  const suspended = a.profile.status === 'suspended';
  const nowMonth = lagosMonth(Date.now());
  const prev = new Date(Date.now() + 3_600_000);
  prev.setUTCDate(1);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const lastKey = prev.toISOString().slice(0, 7);
  const last = a.months.find(m => m.month === lastKey);
  const live = a.books.filter(b => b.status === 'live').length;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/authors">Authors</Link>
          <Icon name="chev" size="s" />
          <span>{name}</span>
        </div>
        <div className="ph__row">
          <span className={`av xl ${avClass(id)}`}>{initials(name)}</span>
          <div className="ph__title">
            <h1>{name}</h1>
            <div className="ph__meta">
              <span>{suspended ? 'Rights suspended' : 'Author'}</span>
              <span>{`Since ${date(a.profile.approved_at).split(' ').slice(1).join(' ')}`}</span>
              {a.profile.location && <span>{a.profile.location}</span>}
              {social && (
                <span>
                  <b>{n0(social.follower_count)}</b> {social.follower_count === 1 ? 'follower' : 'followers'}
                </span>
              )}
              <span>
                <b>{n0(a.reads)}</b> {a.reads === 1 ? 'reader' : 'readers'}
              </span>
              <span>
                <b>{naira(last?.earned_kobo ?? 0)}</b> earned in {monthName(lastKey).split(' ')[0]}
              </span>
              {a.profile.payouts_paused && <span className="pp-late">Payouts paused</span>}
              {suspended && a.profile.suspended_reason && <span className="pp-late">{a.profile.suspended_reason}</span>}
              {channel && (
                <Link className="link" href={`/community/${channel}`}>
                  Community channel
                </Link>
              )}
            </div>
          </div>
          <AuthorActions
            id={id}
            name={name}
            suspended={suspended}
            canSuspend={g.staff.role === 'super_admin' || g.staff.role === 'support'}
          />
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Books</h2>
                <span className="sub">{`${live} live`}</span>
              </div>
              {a.books.length === 0 ? (
                <div className="empty" style={{ padding: '40px 24px' }}>
                  <b>No books yet</b>
                  <span>Books show here once {name.split(' ')[0]} submits one in Author Studio.</span>
                </div>
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Book</th>
                        <th>Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.books.map(b => (
                        <tr key={b.book_id}>
                          <td>
                            <div className="who">
                              <span className={`cv ${coverClass(b.book_id)} x32`}></span>
                              <span>
                                <b>{b.title}</b>
                                <small>
                                  {b.price_credits != null
                                    ? `${n0(b.price_credits)} credits · ₦${n0(creditsToNaira(b.price_credits))}`
                                    : 'No price yet'}
                                </small>
                              </span>
                            </div>
                          </td>
                          <td>{STAGE[b.status] ?? b.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Earnings by month</h2>
                <Link className="link" href={`/authors/${id}/payout`}>
                  Payout account and statements
                </Link>
              </div>
              {a.months.every(m => m.credits === 0) ? (
                <div className="empty" style={{ padding: '40px 24px' }}>
                  <b>No earnings yet</b>
                  <span>Credits and naira show here as readers unlock {name.split(' ')[0]}’s books.</span>
                </div>
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th className="r">Credits spent</th>
                        <th className="r">Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {a.months.map(m => (
                        <tr key={m.month}>
                          <td>{monthName(m.month)}</td>
                          <td className="n">{n0(m.credits)}</td>
                          <td className="n">{naira(m.earned_kobo)}</td>
                          <td>{m.month === nowMonth ? <span className="st st-org">Accruing</span> : 'Closed'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <details className="fold">
              <summary>
                Studio activity <small>{`${a.recent.length} recent event${a.recent.length === 1 ? '' : 's'}`}</small>
              </summary>
              <div className="fold__b">
                {a.recent.length === 0 ? (
                  <span className="muted">Nothing yet. Staff actions on this author and their books show here.</span>
                ) : (
                  <div className="tl">
                    {a.recent.map((e, i) => (
                      <div className="tl__i" key={i}>
                        <b>{e.summary || e.action}</b>
                        <small>{`${dayMonth(e.at)}, ${clock(e.at)}`}</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Payout account</h2>
                <span className="st st-warn">Not set</span>
              </div>
              <div className="panel__body">
                <span className="muted">Bank details and name checks arrive with payouts.</span>
                <Link className="btn btn-g sm" href={`/authors/${id}/payout`}>
                  Open payout account
                </Link>
              </div>
            </div>
            <details className="fold">
              <summary>
                Messages, tips and community <small>{suspended ? 'rights suspended' : 'in good standing'}</small>
              </summary>
              <div className="fold__b">
                <b>Reader messages</b>
                {social ? (
                  <div className="pp-cnt">
                    <div>
                      <b>{n0(social.messages.count)}</b>Received
                    </div>
                    <div>
                      <b>{n0(social.threads)}</b>Readers wrote
                    </div>
                    <div>
                      <b>{n0(social.messages.credits)}</b>Credits spent
                    </div>
                  </div>
                ) : (
                  <span className="muted">Message counts didn’t load. Refresh to try again.</span>
                )}
                <b>Tips received</b>
                <dl className="kv tight">
                  <dt>{`${monthName(lastKey)}`}</dt>
                  <dd>
                    {last && last.tips_credits > 0
                      ? `${n0(last.tips_credits)} credits (${naira(last.tips_credits * 300)} value)`
                      : 'None'}
                  </dd>
                  <dt>Author earns, ₦1.60 a credit</dt>
                  <dd>{naira(last?.tips_kobo ?? 0)}</dd>
                  {social && (
                    <>
                      <dt>All time</dt>
                      <dd>{`${n0(social.tips.count)} ${social.tips.count === 1 ? 'tip' : 'tips'}, ${n0(social.tips.credits)} credits`}</dd>
                    </>
                  )}
                </dl>
                <b>Community</b>
                {social?.community ? (
                  <dl className="kv tight">
                    <dt>Channel</dt>
                    <dd>
                      <Link className="link" href={`/community/${social.community.id}`}>
                        {social.community.name}
                      </Link>
                    </dd>
                    <dt>Members</dt>
                    <dd>{n0(social.community.member_count)}</dd>
                  </dl>
                ) : (
                  <span className="muted">No community yet.</span>
                )}
                <span className="muted">Staff can’t read private messages. Counts and revenue only.</span>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
