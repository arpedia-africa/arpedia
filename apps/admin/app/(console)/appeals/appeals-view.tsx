'use client';

import { useRouter } from 'next/navigation';
import { initials, tint } from '../reports/labels';
import { APPELLANT_ROLE, appealingLabel, shortDate, STATUS_LABEL, type AppealStatus, type AppealSubject } from './labels';

export interface AppealRow {
  id: string;
  name: string;
  subject: AppealSubject;
  decision: string | null;
  decider: string | null;
  createdAt: string;
  late: boolean;
  status: AppealStatus;
}

const num = (n: number) => n.toLocaleString('en-NG');

/** s-appeals. Only New gets a pill; In review is plain text. */
export function AppealsView({
  tab,
  rows,
  counts,
  failed,
}: {
  tab: 'open' | 'decided';
  rows: AppealRow[];
  counts: { open: number; decided: number };
  failed: boolean;
}) {
  const router = useRouter();
  const tabs = [
    { key: 'open', label: 'Open', count: counts.open },
    { key: 'decided', label: 'Decided', count: counts.decided },
  ] as const;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Appeals</h1>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <a
            key={x.key}
            role="tab"
            href={`/appeals?tab=${x.key}`}
            aria-selected={tab === x.key}
            className={tab === x.key ? 'is-selected' : undefined}
            onClick={(e) => (e.preventDefault(), router.push(`/appeals?tab=${x.key}`))}
          >
            {x.label} <span className="c">{num(x.count)}</span>
          </a>
        ))}
      </div>
      <div className="page">
        <div className="panel panel--flush">
          {failed ? (
            <div className="empty">
              <b>Appeals didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <b>{tab === 'open' ? 'No open appeals' : 'Nothing decided yet'}</b>
              <span>
                {tab === 'open'
                  ? 'When a reader or author asks you to look at a decision again, it lands here.'
                  : 'Decided appeals stay here with who decided them.'}
              </span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Appellant</th>
                    <th>Appealing</th>
                    <th>Original decision by</th>
                    <th>Received</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr
                      key={a.id}
                      tabIndex={0}
                      onClick={() => router.push(`/appeals/${a.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && router.push(`/appeals/${a.id}`)}
                    >
                      <td>
                        <div className="who">
                          <span className={`av sm ${tint(a.name)}`}>{initials(a.name)}</span>
                          <span>
                            <b>{a.name}</b>
                            <small>{APPELLANT_ROLE[a.subject]}</small>
                          </span>
                        </div>
                      </td>
                      <td>{appealingLabel(a.subject, a.decision)}</td>
                      <td>{a.decider ?? 'Automatic'}</td>
                      <td className="nw">{a.late ? <b>{shortDate(a.createdAt)}</b> : shortDate(a.createdAt)}</td>
                      <td>{a.status === 'new' ? <span className="st st-org">New</span> : STATUS_LABEL[a.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!failed && rows.length > 0 ? (
            <div className="pager">
              <span>{`${num(rows.length)} ${tab === 'open' ? 'open' : 'decided'} ${rows.length === 1 ? 'appeal' : 'appeals'}`}</span>
              <span>Promise: decision within 3 days</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
