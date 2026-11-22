'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import { coverClass } from '../books/shared';
import {
  dayMonth,
  receivedAt,
  STATUS_LABEL,
  STATUS_PILL,
  TYPE_LABEL,
  type ClaimStatus,
  type ClaimTab,
  type ClaimType,
} from './labels';

export interface ClaimRow {
  id: string;
  ref: string;
  bookId: string;
  title: string;
  author: string;
  claimant: string;
  type: ClaimType;
  status: ClaimStatus;
  createdAt: string;
  dueAt: string;
  late: boolean;
}

const num = (n: number) => n.toLocaleString('en-NG');

/** s-claims. The copyright policy sits behind the band icon. */
export function ClaimsView({
  tab,
  rows,
  counts,
  failed,
}: {
  tab: ClaimTab;
  rows: ClaimRow[];
  counts: { open: number; waiting: number; decided: number };
  failed: boolean;
}) {
  const router = useRouter();
  const tabs = [
    { key: 'open', label: 'Open', count: counts.open },
    { key: 'waiting', label: 'Waiting on author', count: counts.waiting },
    { key: 'decided', label: 'Decided', count: counts.decided },
  ] as const;
  const go = (id: string) => router.push(`/claims/${id}`);

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Copyright claims</h1>
          </div>
          <div className="band__acts">
            <a className="ib" href="/policies" aria-label="Copyright policy">
              <Icon name="file" />
            </a>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <a
            key={x.key}
            role="tab"
            href={`/claims?tab=${x.key}`}
            aria-selected={tab === x.key}
            className={tab === x.key ? 'is-selected' : undefined}
            onClick={(e) => (e.preventDefault(), router.push(`/claims?tab=${x.key}`))}
          >
            {x.label} <span className="c">{num(x.count)}</span>
          </a>
        ))}
      </div>
      <div className="page">
        <div className="panel panel--flush">
          {failed ? (
            <div className="empty">
              <b>Claims didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <b>
                {tab === 'decided'
                  ? 'Nothing decided yet'
                  : tab === 'waiting'
                    ? 'No claims waiting on an author'
                    : 'No open claims'}
              </b>
              <span>
                {tab === 'decided'
                  ? 'Decided claims stay here with who decided them.'
                  : tab === 'waiting'
                    ? 'When you ask an author to respond, the claim waits here until they answer or the time runs out.'
                    : 'Claims from the copyright form, email and book reports land here.'}
              </span>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Claimant</th>
                    <th>Received</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const decided = c.status === 'upheld' || c.status === 'rejected';
                    const pill = STATUS_PILL[c.status];
                    return (
                      <tr
                        key={c.id}
                        tabIndex={0}
                        onClick={() => go(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && go(c.id)}
                      >
                        <td>
                          <div className="who">
                            <span className={`cv ${coverClass(c.bookId)} x32`}></span>
                            <span>
                              <b>{c.title}</b>
                              <small>
                                {`${c.author} · `}
                                <span className="mono">{c.ref}</span>
                              </small>
                            </span>
                          </div>
                        </td>
                        <td>
                          {c.claimant}
                          <br />
                          <small className="faint">{TYPE_LABEL[c.type]}</small>
                        </td>
                        <td className="nw">{receivedAt(c.createdAt)}</td>
                        <td className="nw">
                          {c.late && !decided ? <b>{dayMonth(c.dueAt)}</b> : dayMonth(c.dueAt)}
                        </td>
                        <td>
                          {pill ? (
                            <span className={pill}>{STATUS_LABEL[c.status]}</span>
                          ) : (
                            STATUS_LABEL[c.status]
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!failed && rows.length > 0 ? (
            <div className="pager">
              <span>
                {tab === 'decided'
                  ? `${num(rows.length)} shown`
                  : `${num(rows.length)} shown · ${num(counts.open)} open, ${num(counts.waiting)} waiting on author`}
              </span>
              <span>Promise: decision within 7 days</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
