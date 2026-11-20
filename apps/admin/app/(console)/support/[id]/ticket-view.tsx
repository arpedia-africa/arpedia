'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { slaLabel } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { initials } from '../../reports/labels';
import { CATEGORY_LABEL } from '../support-view';
import { addTicketNote, replyToTicket, updateTicket, type ReturnPreview } from '../actions';
import { ReturnModal } from '../return-modal';

type Category = keyof typeof CATEGORY_LABEL;
type Status = 'open' | 'waiting_on_reader' | 'solved';

export interface TicketDetail {
  ticket: {
    id: string;
    ref: string;
    subject: string;
    channel: 'email' | 'app';
    category: Category;
    status: Status;
    assignee_id: string | null;
    email: string | null;
    first_reply_due_at: string;
    first_replied_at: string | null;
    created_at: string;
  };
  assignee_name: string | null;
  messages: {
    id: string;
    kind: 'reader' | 'staff' | 'note';
    body: string;
    author_name: string | null;
    created_at: string;
  }[];
  reader: {
    id: string;
    name: string;
    email: string | null;
    joined_at: string | null;
    balance: number;
    devices: { model: string | null; os: string | null; app_version: string | null }[];
    transactions: { id: string; delta: number; reason: string; note: string | null; created_at: string }[];
  } | null;
  linked: { id: string; ref: string } | null;
}

export interface Macro {
  id: string;
  title: string;
  body: string;
  category: Category | null;
}

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  waiting_on_reader: 'Waiting on reader',
  solved: 'Solved',
};
const SELECT: React.CSSProperties = {
  appearance: 'none',
  border: 0,
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  width: '100%',
  outline: 0,
};
const num = (n: number) => n.toLocaleString('en-NG');
const wat = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));

/** "yesterday 07:48", "today 10:30", else "11 Nov 07:44" (WAT). */
function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
  const days = Math.round((wat(new Date()).setHours(0, 0, 0, 0) - wat(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' })} ${time}`;
}
const opened = (iso: string) => `Opened ${when(iso)}`;
const fill = (body: string, firstName: string, balance: number | null) =>
  body
    .replace(/\{(name|first_name)\}/g, firstName)
    .replace(/\{balance\}/g, balance === null ? '{balance}' : num(balance));

/** s-ticket. */
export function TicketView({
  detail,
  failed,
  meId,
  meName,
  tab,
  position,
  nextId,
  macros,
  returnLedger = null,
  returnInitial = null,
}: {
  detail: TicketDetail | null;
  failed: boolean;
  meId: string;
  meName: string;
  tab: string;
  position: { n: number; of: number } | null;
  nextId: string | null;
  macros: Macro[];
  /** `?return=<ledger id>` opens Return a chapter charge straight away. */
  returnLedger?: number | null;
  returnInitial?: ReturnPreview | null;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [text, setText] = useState('');
  const [macro, setMacro] = useState<Macro | null>(null);
  const [menu, setMenu] = useState(false);
  const [returning, setReturning] = useState<number | null>(returnLedger);
  const menuRef = useRef<HTMLDivElement>(null);
  const draftKey = detail ? `arpedia.ticket.draft.${detail.ticket.id}` : null;

  // Drafts stay in this browser until sent (Save draft).
  useEffect(() => {
    if (!draftKey) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setText(saved);
    } catch {
      // Storage blocked (private window): drafts just aren't kept.
    }
  }, [draftKey]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const skip = () =>
    router.push(
      nextId && nextId !== detail?.ticket.id ? `/support/${nextId}?tab=${tab}` : `/support?tab=${tab}`,
    );

  // J skips to the next ticket (outside text fields).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key.toLowerCase() === 'j' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) skip();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });

  if (failed || !detail) {
    return (
      <section className="screen enter">
        <div className="ph">
          <div className="crumbs">
            <a href="/support">Support inbox</a>
            <Icon name="chev" />
            <span>Ticket</span>
          </div>
        </div>
        <div className="page">
          <div className="panel">
            <div className="empty">
              <b>This ticket didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const t = detail.ticket;
  const reader = detail.reader;
  const readerName = reader?.name ?? t.email ?? 'Unknown sender';
  const firstName = readerName.split(/[\s@]/)[0] ?? readerName;
  const sla = slaLabel(new Date(t.first_reply_due_at), new Date());
  const late = !t.first_replied_at && t.status === 'open' && sla.late;
  const device = reader?.devices[0];
  const thread = detail.messages.filter((m) => m.kind !== 'note');
  const notes = detail.messages.filter((m) => m.kind === 'note');

  const clearDraft = () => {
    setText('');
    setMacro(null);
    try {
      if (draftKey) localStorage.removeItem(draftKey);
    } catch {
      // Storage blocked (private window): drafts just aren't kept.
    }
  };

  const send = (solve: boolean) =>
    start(async () => {
      if (mode === 'note') return void addNote();
      const r = await replyToTicket(t.id, text, solve, macro?.id ?? null);
      if (r.error) return showToast(r.error);
      clearDraft();
      showToast(
        `Reply sent to ${firstName}. ${
          t.channel === 'app' && reader ? 'They get an in-app message and an email.' : 'They get it by email.'
        }${solve ? ' Ticket solved.' : ''}`,
      );
      if (solve)
        router.push(nextId && nextId !== t.id ? `/support/${nextId}?tab=${tab}` : `/support?tab=${tab}`);
      else router.refresh();
    });

  const addNote = async () => {
    const r = await addTicketNote(t.id, text);
    if (r.error) return showToast(r.error);
    clearDraft();
    showToast('Internal note saved. Only staff can see it.');
    router.refresh();
  };

  const change = (c: Parameters<typeof updateTicket>[1], done: string) =>
    start(async () => {
      const r = await updateTicket(t.id, c);
      if (r.error) return showToast(r.error);
      showToast(done);
      router.refresh();
    });

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <a href={`/support?tab=${tab}`}>Support inbox</a>
          <Icon name="chev" />
          <span className="mono">{t.ref}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>
              {t.subject}{' '}
              {late ? (
                <span className="st st-err">{`${sla.text.replace(' over', '')}, over SLA`}</span>
              ) : null}
            </h1>
            <div className="ph__meta">
              <span>{readerName}</span>
              <span>{`${t.channel === 'app' ? 'In-app' : 'Email'} · ${CATEGORY_LABEL[t.category]}`}</span>
              <span>{opened(t.created_at)}</span>
            </div>
          </div>
          <div className="ph__acts">
            <a
              className="btn btn-p"
              onClick={() => showToast('Grant credits opens with Credits and plans (flow 09).')}
            >
              Grant credits
            </a>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="panel">
            <div className="panel__head">
              <h2>Conversation</h2>
            </div>
            <div className="panel__body">
              <div className="ts-thread">
                {thread.map((m) => {
                  const name = m.author_name ?? (m.kind === 'reader' ? readerName : 'Arpedia team');
                  return (
                    <div key={m.id} className={`msg${m.kind === 'staff' ? ' staff' : ''}`}>
                      <span className={`av sm ${m.kind === 'staff' ? 'r' : 'b'}`}>{initials(name)}</span>
                      <div className="msg__b">
                        <small>{`${name} · ${when(m.created_at)}`}</small>
                        {m.body}
                      </div>
                    </div>
                  );
                })}
              </div>
              {notes.map((n) => (
                <div key={n.id} className="ts-note">
                  <b>{`Internal note, ${n.author_name ?? 'staff'}, ${when(n.created_at)}`}</b>
                  {n.body}
                  <small>Only staff can see this</small>
                </div>
              ))}
            </div>
            <div className="ts-reply">
              <div className="row">
                <div className="seg" data-single>
                  <button
                    className={mode === 'reply' ? 'is-selected' : undefined}
                    onClick={() => setMode('reply')}
                  >
                    Reply to reader
                  </button>
                  <button
                    className={mode === 'note' ? 'is-selected' : undefined}
                    onClick={() => setMode('note')}
                  >
                    Internal note
                  </button>
                </div>
                <span className="grow" />
                {macros.length ? (
                  <div className="mwrap" ref={menuRef}>
                    <button className="dd" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                      Macro: <b>{macro?.title ?? 'None'}</b>
                      <Icon name="chevd" />
                    </button>
                    {menu ? (
                      <div className="menu">
                        {macros.map((m) => (
                          <a
                            key={m.id}
                            onClick={() => {
                              setMacro(m);
                              setMode('reply');
                              setText(fill(m.body, firstName, reader?.balance ?? null));
                              setMenu(false);
                              showToast('Macro added');
                            }}
                          >
                            {m.title}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <textarea
                className="inp ta"
                rows={4}
                aria-label={mode === 'note' ? 'Internal note' : `Reply to ${firstName}`}
                placeholder={mode === 'note' ? 'Only staff can see notes' : `Write to ${firstName}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="row">
                <span className="grow" />
                <a
                  className="btn btn-g"
                  onClick={() => {
                    try {
                      if (draftKey) localStorage.setItem(draftKey, text);
                    } catch {
                      // Storage blocked (private window): drafts just aren't kept.
                    }
                    showToast('Draft saved');
                  }}
                >
                  Save draft
                </a>
                <a className="btn btn-g" aria-disabled={pending} onClick={() => !pending && start(addNote)}>
                  Add as internal note
                </a>
              </div>
            </div>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Ticket and reader</h2>
                {reader ? (
                  <a className="link" onClick={() => showToast('Reader pages open with People (flow 16).')}>
                    Open reader
                  </a>
                ) : null}
              </div>
              <div className="panel__body">
                <div className="f">
                  <label htmlFor="tk-status">Status</label>
                  <div className="inp sel">
                    <select
                      id="tk-status"
                      style={SELECT}
                      value={t.status}
                      disabled={pending}
                      onChange={(e) =>
                        change(
                          { status: e.target.value as Status },
                          `Status: ${STATUS_LABEL[e.target.value as Status]}`,
                        )
                      }
                    >
                      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevd" />
                  </div>
                </div>
                <div className="f">
                  <label htmlFor="tk-assignee">Assignee</label>
                  <div className="inp sel">
                    <select
                      id="tk-assignee"
                      style={SELECT}
                      value={t.assignee_id === meId ? 'me' : t.assignee_id ? 'other' : 'none'}
                      disabled={pending}
                      onChange={(e) =>
                        change(
                          { assignee: e.target.value as 'me' | 'none' },
                          e.target.value === 'me' ? 'Assigned to you' : 'Unassigned',
                        )
                      }
                    >
                      <option value="me">{meName}</option>
                      {t.assignee_id && t.assignee_id !== meId ? (
                        <option value="other" disabled>
                          {detail.assignee_name ?? 'Another teammate'}
                        </option>
                      ) : null}
                      <option value="none">Unassigned</option>
                    </select>
                    <Icon name="chevd" />
                  </div>
                </div>
                <div className="f">
                  <label htmlFor="tk-cat">Category</label>
                  <div className="inp sel">
                    <select
                      id="tk-cat"
                      style={SELECT}
                      value={t.category}
                      disabled={pending}
                      onChange={(e) => change({ category: e.target.value as Category }, 'Category changed')}
                    >
                      {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevd" />
                  </div>
                </div>
                <dl className="kv tight">
                  {reader ? (
                    <>
                      <dt>Credits balance</dt>
                      <dd>
                        <b>{num(reader.balance)}</b>
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt>Email</dt>
                      <dd>{t.email}</dd>
                      <dt>Account</dt>
                      <dd>No Arpedia account with this email</dd>
                    </>
                  )}
                  {detail.linked ? (
                    <>
                      <dt>Linked ticket</dt>
                      <dd>
                        <a className="link mono" href={`/support/${detail.linked.id}`}>
                          {detail.linked.ref}
                        </a>
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </div>
            {reader ? (
              <details className="fold">
                <summary>
                  More details <small>device, transactions</small>
                </summary>
                <div className="fold__b">
                  <dl className="kv tight">
                    <dt>Device</dt>
                    <dd>
                      {device
                        ? [device.os, device.model].filter(Boolean).join(' · ') || 'Unknown'
                        : 'No phone signed in'}
                    </dd>
                    {device?.app_version ? (
                      <>
                        <dt>App version</dt>
                        <dd>{device.app_version}</dd>
                      </>
                    ) : null}
                    {reader.joined_at ? (
                      <>
                        <dt>Joined</dt>
                        <dd>
                          {new Date(reader.joined_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Africa/Lagos',
                          })}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  <b>Recent transactions</b>
                  <div className="list">
                    {reader.transactions.length ? (
                      reader.transactions.slice(0, 3).map((x) => (
                        <div key={x.id} className="li">
                          <span className="li__body">
                            <b>{x.note ?? x.reason.replace(/_/g, ' ')}</b>
                            <small>
                              {when(x.created_at)}
                              {x.reason === 'chapter' ? (
                                <>
                                  {' · '}
                                  <a
                                    className="link"
                                    href="#return"
                                    onClick={(e) => (e.preventDefault(), setReturning(Number(x.id)))}
                                  >
                                    Return
                                  </a>
                                </>
                              ) : null}
                            </small>
                          </span>
                          <span className="li__trail">{`${x.delta > 0 ? '+' : ''}${num(x.delta)} credits`}</span>
                        </div>
                      ))
                    ) : (
                      <div className="empty">
                        <span>No credit movements yet.</span>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>
      <div className="decide">
        <div className="decide__q">
          {position ? (
            <>
              Ticket <b>{`${num(position.n)} of ${num(position.of)}`}</b> ·{' '}
            </>
          ) : null}
          <a className="link" href={`/support?tab=${tab}`}>
            Back to inbox
          </a>
        </div>
        <span className="grow" />
        <a className="btn btn-g" aria-disabled={pending} onClick={() => !pending && send(false)}>
          {mode === 'note' ? 'Add note' : 'Send'}
        </a>
        {mode === 'reply' ? (
          <a className="btn btn-p" aria-disabled={pending} onClick={() => !pending && send(true)}>
            Send and solve
          </a>
        ) : null}
        <a className="btn btn-q sm" onClick={skip}>
          Skip <span className="kbd">J</span>
        </a>
      </div>
      {returning !== null ? (
        <ReturnModal
          ledgerId={returning}
          initial={returnInitial?.ledger_id === returning ? returnInitial : null}
          onClose={() => setReturning(null)}
          onDone={(msg) => {
            setReturning(null);
            showToast(msg);
            router.refresh();
          }}
        />
      ) : null}
      {toastNode}
    </section>
  );
}
