'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { slaLabel } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { initials, tint } from '../reports/labels';
import { assignTicketToMe } from './actions';

export type TicketTab = 'mine' | 'unassigned' | 'waiting' | 'solved';
type Category = 'billing' | 'book_access' | 'account' | 'author_help' | 'bug' | 'other';

export interface TicketRow {
  id: string;
  ref: string;
  subject: string;
  reader: string;
  category: Category;
  status: 'open' | 'waiting_on_reader' | 'solved';
  dueAt: string;
  repliedAt: string | null;
}

export interface TicketCounts {
  mine: number;
  unassigned: number;
  waiting: number;
  solved: number;
}

export interface TicketPreview {
  ticket: { id: string; ref: string; subject: string; channel: 'email' | 'app'; first_reply_due_at: string; first_replied_at: string | null };
  assignee_name: string | null;
  messages: { id: string; kind: 'reader' | 'staff' | 'note'; body: string; author_name: string | null; created_at: string }[];
  reader: {
    name: string;
    balance: number;
    devices: { model: string | null; os: string | null; app_version: string | null }[];
    transactions: { delta: number; reason: string; note: string | null; created_at: string }[];
  } | null;
}

const TABS: { key: TicketTab; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'waiting', label: 'Waiting on reader' },
  { key: 'solved', label: 'Solved' },
];
export const CATEGORY_LABEL: Record<Category, string> = {
  billing: 'Billing',
  book_access: 'Book access',
  account: 'Account',
  author_help: 'Author help',
  bug: 'Bug',
  other: 'Other',
};
const num = (n: number) => n.toLocaleString('en-NG');
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

function Sla({ row }: { row: Pick<TicketRow, 'dueAt' | 'repliedAt' | 'status'> }) {
  if (row.status === 'waiting_on_reader') return <>Waiting on reader</>;
  if (row.status === 'solved') return <>Solved</>;
  if (row.repliedAt) return <>Replied</>;
  const s = slaLabel(new Date(row.dueAt), new Date());
  return s.late ? <span className="st st-err">{s.text.replace(' over', '')}</span> : <>{s.text}</>;
}

/** s-support. */
export function SupportView({
  tab,
  rows,
  total,
  counts,
  selectedId,
  preview,
  failed,
}: {
  tab: TicketTab;
  rows: TicketRow[];
  total: number;
  counts: TicketCounts | null;
  selectedId: string | null;
  preview: TicketPreview | null;
  failed: boolean;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    const tick = setInterval(() => document.visibilityState === 'visible' && router.refresh(), 30_000);
    return () => clearInterval(tick);
  }, [router]);

  const t = q.trim().toLowerCase();
  const shown = rows.filter(r => !t || r.subject.toLowerCase().includes(t) || r.reader.toLowerCase().includes(t) || r.ref.toLowerCase().includes(t));
  const sel = rows.find(r => r.id === selectedId);
  const firstMsg = preview?.messages.find(m => m.kind === 'reader');
  const device = preview?.reader?.devices[0];
  const lastTx = preview?.reader?.transactions[0];

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Support inbox</h1>
          </div>
          <div className="band__acts">
            <a className="ib" href="/help" aria-label="Help articles">
              <Icon name="help" />
            </a>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(x => (
          <a
            key={x.key}
            role="tab"
            href={`/support?tab=${x.key}`}
            aria-selected={tab === x.key}
            className={tab === x.key ? 'is-selected' : undefined}
            onClick={e => {
              e.preventDefault();
              router.push(`/support?tab=${x.key}`);
            }}
          >
            {x.label} <span className="c">{num(counts?.[x.key] ?? 0)}</span>
          </a>
        ))}
      </div>
      <div className="page">
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input placeholder="Subject, reader or email" aria-label="Search tickets" value={q} onChange={e => setQ(e.target.value)} />
          </label>
        </div>
        {failed ? (
          <div className="panel">
            <div className="empty">
              <b>Tickets didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="panel">
            <div className="empty">
              <b>{tab === 'solved' ? 'Nothing solved yet' : 'Inbox zero'}</b>
              <span>{tab === 'mine' ? 'Nothing is assigned to you. Pick one from Unassigned.' : 'New tickets from email and the app land here.'}</span>
            </div>
          </div>
        ) : (
          <div className="ts-two">
            <div className="panel panel--flush">
              <div className="list">
                {shown.map(r => (
                  <div
                    key={r.id}
                    className={`ts-tk${r.id === selectedId ? ' sel' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/support?tab=${tab}&t=${r.id}`)}
                    onDoubleClick={() => router.push(`/support/${r.id}`)}
                    onKeyDown={e => e.key === 'Enter' && router.push(`/support/${r.id}`)}
                  >
                    <b>{r.subject}</b>
                    <div className="ts-tk__r">
                      <span>{`${r.reader} · ${CATEGORY_LABEL[r.category]}`}</span>
                      <span className="grow" />
                      <Sla row={r} />
                    </div>
                  </div>
                ))}
                {shown.length === 0 ? (
                  <div className="empty">
                    <b>Nothing matches</b>
                    <span>Try another subject, name or email.</span>
                  </div>
                ) : null}
              </div>
              <div className="pager">
                <span>{`${num(shown.length)} of ${num(total)} ${TABS.find(x => x.key === tab)!.label.toLowerCase()}`}</span>
                <span>Oldest first</span>
              </div>
            </div>
            {sel && preview ? (
              <div className="panel">
                <div className="panel__head">
                  <h2>{preview.ticket.subject}</h2>
                  {(() => {
                    const s = slaLabel(new Date(preview.ticket.first_reply_due_at), new Date());
                    return !preview.ticket.first_replied_at && s.late ? <span className="st st-err">{`${s.text.replace(' over', '')}, over SLA`}</span> : null;
                  })()}
                </div>
                <div className="panel__body">
                  <div className="who">
                    <span className={`av ${tint(sel.reader)}`}>{initials(sel.reader)}</span>
                    <span>
                      <b>{sel.reader}</b>
                      <small>
                        {[
                          preview.ticket.channel === 'app' ? 'In-app' : 'Email',
                          device ? `App ${device.app_version ?? '?'} on ${device.os ?? 'Android'}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </div>
                  {firstMsg ? (
                    <div className="ts-thread">
                      <div className="msg">
                        <span className={`av sm ${tint(sel.reader)}`}>{initials(sel.reader)}</span>
                        <div className="msg__b">
                          <small>{`${sel.reader} · ${when(firstMsg.created_at)}`}</small>
                          {firstMsg.body.length > 400 ? `${firstMsg.body.slice(0, 398)}…` : firstMsg.body}
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <dl className="kv tight">
                    {preview.reader ? (
                      <>
                        <dt>Credits balance</dt>
                        <dd>{num(preview.reader.balance)}</dd>
                        <dt>Latest transaction</dt>
                        <dd>{lastTx ? `${lastTx.delta > 0 ? '+' : ''}${num(lastTx.delta)} credits · ${lastTx.note ?? lastTx.reason.replace('_', ' ')}` : 'None'}</dd>
                      </>
                    ) : (
                      <>
                        <dt>Reader</dt>
                        <dd>No Arpedia account for this email</dd>
                      </>
                    )}
                    <dt>Assigned</dt>
                    <dd>{preview.assignee_name ?? 'Nobody'}</dd>
                  </dl>
                  <div className="row">
                    <a className="btn btn-p" href={`/support/${sel.id}`}>
                      Open ticket
                    </a>
                    {!preview.assignee_name ? (
                      <button
                        type="button"
                        className="btn btn-g"
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await assignTicketToMe(sel.id);
                            showToast(res.error ?? 'Ticket assigned to you');
                            router.refresh();
                          })
                        }
                      >
                        Assign to me
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
      {toastNode}
    </section>
  );
}
