'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { useToast } from '@/components/toast';
import { saveSender, sendTest } from './actions';

export interface TemplateRow {
  key: string;
  name: string;
  trigger: string;
  can_disable: boolean;
  enabled: boolean;
  finance_review: boolean;
  variables: string[];
  version: number;
  subject: string;
  preheader: string;
  body: string;
  edited_at: string;
  edited_by: string | null;
  sent_30d: number;
  open_rate: number | null;
}

const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' });
const num = (n: number) => n.toLocaleString('en-NG');

/** s-emails. */
export function EmailsView({
  rows,
  sender,
  health,
  email,
  done,
}: {
  rows: TemplateRow[] | null;
  sender: { from_address: string; reply_to: string; footer: string } | null;
  health: { sent: number; bounce_pct: number | null } | null;
  email: string;
  done?: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(sender?.from_address ?? '');
  const [replyTo, setReplyTo] = useState(sender?.reply_to ?? '');
  const [footer, setFooter] = useState(sender?.footer ?? '');
  const [pending, start] = useTransition();
  const [toastNode, showToast] = useToast();

  useEffect(() => {
    if (!done) return;
    showToast(done);
    window.history.replaceState(null, '', '/emails');
  }, [done, showToast]);

  const welcome = rows?.find(r => r.key === 'welcome') ?? rows?.[0];
  const bounce = health?.bounce_pct ?? 0;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Emails</h1>
          </div>
          <div className="band__acts">
            <button
              type="button"
              className="btn btn-n"
              disabled={pending || !welcome}
              onClick={() =>
                start(async () => {
                  const r = await sendTest(welcome!);
                  showToast(r.ok ? `Test email sent to ${r.sentTo ?? email}` : (r.error ?? "The test email didn't send."));
                })
              }
            >
              Send a test email
            </button>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Transactional templates</h2>
            </div>
            {!rows ? (
              <div className="empty">
                <b>Emails didn&apos;t load</b>
                <span>Check your connection and refresh the page.</span>
              </div>
            ) : (
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Template</th>
                      <th>Sent when</th>
                      <th>Last edited</th>
                      <th className="r">Sent, 30 days</th>
                      <th className="r">Open rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key} onClick={() => router.push(`/emails/${r.key}`)}>
                        <td>
                          <b>{r.name}</b>
                          {!r.enabled ? (
                            <>
                              <br />
                              <small className="faint">Switched off</small>
                            </>
                          ) : null}
                        </td>
                        <td className="muted">{r.trigger}</td>
                        <td className="nw">
                          {r.edited_by ? `${dayMonth(r.edited_at)} · ${r.edited_by}` : `${dayMonth(r.edited_at)} · First version`}
                        </td>
                        <td className={r.sent_30d ? 'n' : 'n muted'}>{num(r.sent_30d)}</td>
                        <td className={r.open_rate != null ? 'n' : 'n muted'}>
                          {r.open_rate != null ? `${r.open_rate === 100 ? '100' : r.open_rate.toFixed(1)}%` : 'None yet'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Sender settings</h2>
              </div>
              <div className="panel__body">
                <div className="form">
                  <div className="f">
                    <label htmlFor="e-from">From</label>
                    <div className="inp">
                      <input id="e-from" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} />
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="e-reply">Reply-to</label>
                    <div className="inp">
                      <input id="e-reply" aria-label="Reply-to" value={replyTo} onChange={e => setReplyTo(e.target.value)} />
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="e-foot">Footer address</label>
                    <div className="inp">
                      <input id="e-foot" aria-label="Footer" value={footer} onChange={e => setFooter(e.target.value)} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-g"
                    disabled={pending || !sender}
                    onClick={() =>
                      start(async () => {
                        const r = await saveSender(from, replyTo, footer);
                        showToast(r.ok ? 'Sender settings saved. The next email uses them.' : (r.error ?? "That didn't save."));
                      })
                    }
                  >
                    Save sender settings
                  </button>
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                Domain health <small>SPF, bounces, complaints</small>
              </summary>
              <div className="fold__b">
                <div className="list">
                  <div className="li">
                    <span className="li__body">
                      <b>SPF and DKIM</b>
                      <small>Checked in Resend for arpedia.africa</small>
                    </span>
                    <span className="st-plain">See Resend</span>
                  </div>
                  <div className="li">
                    <span className="li__body">
                      <b>Bounce rate</b>
                      <small>{`${bounce.toFixed(1)}% of ${num(health?.sent ?? 0)} emails in 30 days`}</small>
                    </span>
                    <span className="st-plain">{bounce < 2 ? 'Healthy' : bounce < 5 ? 'Watch' : 'Too high'}</span>
                  </div>
                  <div className="li">
                    <span className="li__body">
                      <b>Spam complaints</b>
                      <small>Counted once Resend complaint events are switched on</small>
                    </span>
                    <span className="st-plain">Not tracked yet</span>
                  </div>
                </div>
                <Link className="link" href="/integrations">
                  Integrations
                </Link>
              </div>
            </details>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
