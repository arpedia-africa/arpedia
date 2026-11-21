import Link from 'next/link';
import { RowLink } from '../books/row';
import { dayMonth, initials, waited } from '../books/shared';
import { AuthorsHeader, LATE_DAYS, avClass, gate, loadAuthors, n0 } from '../authors/shared';
import { AssignMe } from './assign';
import { DecisionToast } from './decision-toast';
import { NoAccess } from '@/components/no-access';
import { serverSupabase } from '@/lib/supabase/server';

type Filter = 'all' | 'new' | 'needs_info' | 'approved' | 'rejected';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'needs_info', label: 'Needs more info' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const STATUS_LABEL = { new: 'New', needs_info: 'Needs more info', approved: 'Approved', rejected: 'Rejected' } as const;

/** Author applications (s-applications): the queue, oldest first, with waiting time and who has it. */
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; asked?: string; approved?: string; rejected?: string }>;
}) {
  const g = await gate();
  if ('denied' in g) return g.denied;
  const sp = await searchParams;
  const filter = (FILTERS.find(f => f.key === sp.status)?.key ?? 'all') as Filter;
  const supabase = await serverSupabase();

  const count = (statuses: ('new' | 'needs_info' | 'approved' | 'rejected')[]) =>
    supabase.from('author_applications').select('id', { count: 'exact', head: true }).in('status', statuses);
  const statuses = filter === 'all' ? (['new', 'needs_info'] as const) : ([filter] as const);
  const [list, nNew, nInfo, nApproved, nRejected, authors] = await Promise.all([
    supabase
      .from('author_applications')
      .select(
        `id, status, legal_name, pen_name, state, categories, sample_file_name, sample_text, submitted_at, decided_at,
         assigned_to, assignee:profiles!author_applications_assigned_to_fkey(full_name)`,
      )
      .in('status', [...statuses])
      .order(filter === 'approved' || filter === 'rejected' ? 'decided_at' : 'submitted_at', {
        ascending: filter !== 'approved' && filter !== 'rejected',
      }),
    count(['new']),
    count(['needs_info']),
    count(['approved']),
    count(['rejected']),
    loadAuthors(supabase),
  ]);
  if (list.error) {
    if (list.error.code === '42501') return <NoAccess page="applications" label="Authors and applications" role={g.staff.role} />;
    throw list.error;
  }

  // Toast for the application that was just decided.
  const justId = sp.asked ?? sp.approved ?? sp.rejected;
  let toast: string | null = null;
  if (justId) {
    const { data: j } = await supabase
      .from('author_applications')
      .select('legal_name, pen_name, reapply_after')
      .eq('id', justId)
      .maybeSingle();
    if (j) {
      const who = j.pen_name || j.legal_name;
      const firstName = who.split(' ')[0] || who;
      toast = sp.asked
        ? `Asked ${firstName} for more info. They get a push and an email.`
        : sp.approved
          ? `${who} is now an author. They got a push and an email, and Author Studio is open.`
          : `${firstName} was told why by email and push.${j.reapply_after ? ` They can apply again from ${dayMonth(`${j.reapply_after}T00:00:00Z`)}.` : ''}`;
    }
  }

  const waiting = (nNew.count ?? 0) + (nInfo.count ?? 0);
  const counts: Record<Filter, number> = {
    all: waiting,
    new: nNew.count ?? 0,
    needs_info: nInfo.count ?? 0,
    approved: nApproved.count ?? 0,
    rejected: nRejected.count ?? 0,
  };
  const rows = list.data ?? [];
  const now = Date.now();
  const decided = filter === 'approved' || filter === 'rejected';

  return (
    <section className="screen enter">
      <AuthorsHeader tab="applications" authors={authors.rows.length} waiting={waiting} />
      <div className="page">
        <div className="row" data-single>
          {FILTERS.map(f => (
            <Link
              key={f.key}
              className={`fchip${filter === f.key ? ' is-selected' : ''}`}
              style={{ textDecoration: 'none' }}
              aria-current={filter === f.key ? 'page' : undefined}
              href={f.key === 'all' ? '/applications' : `/applications?status=${f.key}`}
            >
              {f.label} <span className="c">{counts[f.key]}</span>
            </Link>
          ))}
        </div>
        <div className="panel panel--flush">
          {rows.length === 0 ? (
            <div className="empty" style={{ padding: '64px 24px' }}>
              <b>{decided ? `No ${filter} applications yet` : 'No applications waiting'}</b>
              <span>
                {decided
                  ? 'Decisions will show here once they are made.'
                  : 'New applications show here as soon as someone sends one. Each one is due a decision within 5 days.'}
              </span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Writing sample</th>
                    <th>Submitted</th>
                    <th>{decided ? 'Decided in' : 'Waiting'}</th>
                    <th>Assigned</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const name = r.pen_name || r.legal_name;
                    const late =
                      !decided && !!r.submitted_at && now - new Date(r.submitted_at).getTime() > LATE_DAYS * 86_400_000;
                    const assignee = r.assignee?.full_name;
                    const open = r.status === 'new' || r.status === 'needs_info';
                    return (
                      <RowLink key={r.id} href={`/applications/${r.id}`}>
                        <td>
                          <div className="who">
                            <span className={`av sm ${avClass(r.id)}`}>{initials(name)}</span>
                            <span>
                              <b>{name}</b>
                              <small>{[r.state, r.categories.join(', ')].filter(Boolean).join(' · ') || 'No details yet'}</small>
                            </span>
                          </div>
                        </td>
                        <td className="mono">{r.sample_file_name ?? (r.sample_text ? 'Pasted text' : 'None')}</td>
                        <td className="nw">{r.submitted_at ? dayMonth(r.submitted_at) : ''}</td>
                        <td className={`nw${late ? ' pp-late' : ''}`}>
                          {decided
                            ? r.submitted_at && r.decided_at
                              ? waited(r.submitted_at, new Date(r.decided_at).getTime())
                              : ''
                            : waited(r.submitted_at, now)}
                        </td>
                        <td className={assignee ? undefined : 'muted'}>
                          {assignee ? (
                            <div className="who">
                              <span className={`av xs ${avClass(r.assigned_to ?? '')}`}>{initials(assignee)}</span>
                              <span>
                                <small>{assignee.split(' ')[0]}</small>
                              </span>
                            </div>
                          ) : open ? (
                            <>
                              Nobody · <AssignMe id={r.id} name={name} />
                            </>
                          ) : (
                            'Nobody'
                          )}
                        </td>
                        <td>
                          {r.status === 'needs_info' ? (
                            <span className="st st-warn">{STATUS_LABEL.needs_info}</span>
                          ) : (
                            STATUS_LABEL[r.status as keyof typeof STATUS_LABEL]
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
            <span>{`${n0(waiting)} waiting · promise: a decision within ${LATE_DAYS} days`}</span>
            <span>{`Late means more than ${LATE_DAYS} days since the application was submitted`}</span>
          </div>
        </div>
      </div>
      {toast && <DecisionToast msg={toast} />}
    </section>
  );
}
