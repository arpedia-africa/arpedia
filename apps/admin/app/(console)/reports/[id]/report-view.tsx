'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { assignToMe, decideReport, escalate } from '../actions';
import {
  age,
  initials,
  OUTCOME_LABEL,
  REASON_LABELS,
  tint,
  TYPE_LABEL,
  watTime,
  type ReportContentType,
  type ReportReason,
  type Severity,
} from '../labels';

interface ContextMessage {
  id: string;
  sender_id: string | null;
  sender_name: string;
  body: string | null;
  created_at: string;
}

export interface ReportDetail {
  report: {
    id: string;
    ref: string;
    content_type: ReportContentType;
    content_id: string;
    reason: ReportReason;
    severity: Severity;
    status: 'open' | 'auto_hidden' | 'resolved';
    outcome: string | null;
    created_at: string;
    escalated_at: string | null;
    group_id: string | null;
    book_id: string | null;
  };
  snapshot: {
    body?: string | null;
    sender_name?: string;
    group_name?: string;
    group_kind?: string;
    created_at?: string;
    context?: ContextMessage[];
    title?: string;
    author_name?: string;
    full_name?: string;
    username?: string | null;
    bio?: string | null;
  } | null;
  assignee_name: string | null;
  decided_by_name: string | null;
  late: boolean;
  user: {
    id: string;
    name: string;
    joined_at: string | null;
    deleted: boolean;
    is_minor: boolean;
    warnings: number;
    warnings_90d: number;
    other_reports: number;
    messages_sent: number;
    sanction: { kind: string; ends_at: string | null } | null;
  } | null;
  reporters: { name: string; reason: ReportReason; details: string | null; at: string; eligible: boolean }[];
  checks: { links: boolean; phone: boolean; new_account: boolean; matched: string | null; abuse_score: number };
}

type ActionKind = 'warn' | 'mute' | 'suspend' | 'ban';
const ACTIONS: { key: ActionKind; label: string; button: string }[] = [
  { key: 'warn', label: 'Warn', button: 'Remove and warn' },
  { key: 'mute', label: 'Mute 7 days', button: 'Remove and mute 7 days' },
  { key: 'suspend', label: 'Suspend 30 days', button: 'Remove and suspend 30 days' },
  { key: 'ban', label: 'Ban', button: 'Remove and ask to ban' },
];

const days = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0);
const first = (name: string) => name.split(/\s+/)[0] ?? name;
const until = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }) : 'for good';

/** s-report, s-report-review and the s-report-action overlay. J skips to the next report. */
export function ReportView({
  detail,
  failed,
  position,
  total,
  nextId,
  canDecide,
}: {
  detail: ReportDetail | null;
  failed: boolean;
  position: number | null;
  total: number;
  nextId: string | null;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [menu, setMenu] = useState(false);
  const [acting, setActing] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'j' || e.key === 'J') && !(e.target as Element).closest('input, textarea') && nextId) router.push(`/reports/${nextId}`);
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [nextId, router]);

  if (failed || !detail) {
    return (
      <section className="screen enter">
        <div className="page">
          <div className="panel">
            <div className="empty">
              <b>This report didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
              <div className="row">
                <a className="btn btn-g" href="/reports">
                  Back to queue
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const { report: r, snapshot: s, user } = detail;
  const isChat = r.content_type === 'message' || r.content_type === 'dm';
  const isReview = r.content_type === 'review' || r.content_type === 'discussion_comment';
  const where = s?.group_name ?? s?.title ?? s?.full_name ?? '';
  const reporters = detail.reporters.length;
  const decided = r.status === 'resolved';
  const after = (msg: string) => {
    showToast(msg);
    router.push(nextId ? `/reports/${nextId}` : '/reports');
  };
  const run = (fn: () => Promise<{ ok?: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) showToast(res.error);
      else after(msg);
    });

  const title = `${REASON_LABELS[r.reason]} · ${TYPE_LABEL[r.content_type].toLowerCase()}`;
  const ctx = s?.context ?? [];
  const flaggedAt = s?.created_at ?? r.created_at;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <a href="/reports">Reports</a>
          <Icon name="chev" />
          <span>{r.ref}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>
              {title} {r.severity === 'high' ? <span className="st st-err">High</span> : null}
            </h1>
            <div className="ph__meta">
              <span>
                {[decided ? (OUTCOME_LABEL[r.outcome ?? ''] ?? 'Resolved') : r.status === 'auto_hidden' ? 'Auto-hidden' : null, TYPE_LABEL[r.content_type], where]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span>{`First report ${age(r.created_at)} ago · ${reporters} ${reporters === 1 ? 'reporter' : 'reporters'}`}</span>
              <span>
                {decided
                  ? `Decided by ${detail.decided_by_name ?? 'staff'}`
                  : detail.assignee_name
                    ? `Assigned to ${detail.assignee_name}`
                    : 'Unassigned'}
                {r.escalated_at ? ' · escalated to Super admin' : ''}
              </span>
            </div>
          </div>
          <div className="ph__acts">
            <div className="mwrap">
              <button type="button" className="ib" aria-expanded={menu} aria-label="More actions" onClick={() => setMenu(m => !m)}>
                <Icon name="more" />
              </button>
              {menu ? (
                <div className="menu">
                  {user ? <a href={`/readers/${user.id}`}>{`Open ${user.name}`}</a> : null}
                  {canDecide && !decided ? (
                    <a
                      href="#assign"
                      onClick={e => {
                        e.preventDefault();
                        setMenu(false);
                        start(async () => {
                          const res = await assignToMe(r.id);
                          showToast(res.error ?? 'Assigned to you');
                          router.refresh();
                        });
                      }}
                    >
                      Assign to me
                    </a>
                  ) : null}
                  <hr />
                  <a
                    className="danger"
                    href="#escalate"
                    onClick={e => {
                      e.preventDefault();
                      setMenu(false);
                      start(async () => {
                        const res = await escalate(r.id);
                        showToast(res.error ?? 'Escalated to Super admin. They decide whether to contact the police and keep the logs.');
                        router.refresh();
                      });
                    }}
                  >
                    Escalate to Super admin
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>{isChat ? (r.content_type === 'dm' ? 'Reported conversation' : 'Message in context') : TYPE_LABEL[r.content_type]}</h2>
                {isChat && ctx.length ? (
                  <span className="sub">{`${watTime(ctx[0]!.created_at)} to ${watTime(ctx[ctx.length - 1]!.created_at)} · times in WAT`}</span>
                ) : null}
              </div>
              <div className="panel__body">
                {isChat ? (
                  (ctx.length ? ctx : [{ id: r.content_id, sender_id: null, sender_name: s?.sender_name ?? '', body: s?.body ?? null, created_at: flaggedAt }]).map(m => {
                    const flagged = m.id === r.content_id;
                    return (
                      <div key={m.id} className={`msg${flagged ? ' flagged' : ''}`}>
                        <span className={`av sm ${tint(m.sender_name)}`}>{initials(m.sender_name)}</span>
                        <div className="msg__b">
                          <small>{`${m.sender_name} · ${watTime(m.created_at)}${flagged ? ` · reported by ${reporters}` : ''}`}</small>
                          {(flagged ? (s?.body ?? m.body) : m.body) ?? 'Message deleted'}
                        </div>
                      </div>
                    );
                  })
                ) : r.content_type === 'book' ? (
                  <dl className="kv tight">
                    <dt>Book</dt>
                    <dd>{s?.title}</dd>
                    <dt>Author</dt>
                    <dd>{s?.author_name}</dd>
                  </dl>
                ) : r.content_type === 'profile' ? (
                  <div className="who">
                    <span className={`av lg ${tint(s?.full_name ?? '')}`}>{initials(s?.full_name ?? '?')}</span>
                    <span>
                      <b>{s?.full_name}</b>
                      <small>{[s?.username ? `@${s.username}` : null, s?.bio].filter(Boolean).join(' · ')}</small>
                    </span>
                  </div>
                ) : (
                  <p>{s?.body ?? 'Content removed'}</p>
                )}
              </div>
            </div>
            <details className="fold">
              <summary>
                More details <small>reporters, automatic checks</small>
              </summary>
              <div className="fold__b">
                <b>{`Reporters · ${reporters} ${reporters === 1 ? 'reader' : 'readers'}${detail.reporters[0] ? `, first at ${watTime(detail.reporters[0].at)}` : ''}`}</b>
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Reader</th>
                        <th>Reason chosen</th>
                        <th>Comment</th>
                        <th className="r">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.reporters.map(p => (
                        <tr key={`${p.name}${p.at}`}>
                          <td>
                            <div className="who">
                              <span className={`av xs ${tint(p.name)}`}>{initials(p.name)}</span>
                              <span>
                                <b>{p.name}</b> {p.eligible ? null : <small>new account</small>}
                              </span>
                            </div>
                          </td>
                          <td>{REASON_LABELS[p.reason]}</td>
                          <td className="muted">{p.details ? `"${p.details}"` : 'No comment'}</td>
                          <td className="n">{watTime(p.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <b>Automatic checks</b>
                <div className="stack s8">
                  <div className="row between">
                    <span className="muted">How abusive it looks to the automatic check</span>
                    <b>{`${detail.checks.abuse_score} of 100`}</b>
                  </div>
                  <div className="meter">
                    <i className={detail.checks.abuse_score >= 70 ? 'err' : undefined} style={{ width: `${detail.checks.abuse_score}%` }} />
                  </div>
                </div>
                <div className="kv-row">
                  <span>Contains links</span>
                  <b>{detail.checks.links ? 'Yes' : 'No'}</b>
                </div>
                <div className="kv-row">
                  <span>Phone number</span>
                  <b>{detail.checks.phone ? 'Yes' : 'No'}</b>
                </div>
                <div className="kv-row">
                  <span>New account (under 7 days)</span>
                  <b>{detail.checks.new_account ? 'Yes' : 'No'}</b>
                </div>
                <div className="kv-row">
                  <span>Matched phrase</span>
                  <b>{detail.checks.matched ? `"${detail.checks.matched}"` : 'None'}</b>
                </div>
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Reported user</h2>
                {user ? (
                  <a className="link" href={`/readers/${user.id}`}>
                    {`Open ${first(user.name)}`}
                  </a>
                ) : null}
              </div>
              <div className="panel__body">
                {!user || user.deleted ? (
                  <div className="empty">
                    <b>Account deleted</b>
                    <span>The decision is recorded; there is nobody to act on.</span>
                  </div>
                ) : (
                  <>
                    <div className="who">
                      <span className={`av lg ${tint(user.name)}`}>{initials(user.name)}</span>
                      <span>
                        <b>{user.name}</b>
                        <small>{user.is_minor ? 'Reader · under 18' : 'Reader'}</small>
                      </span>
                    </div>
                    <dl className="kv tight">
                      <dt>Account age</dt>
                      <dd>
                        {`${days(user.joined_at)} days`} {days(user.joined_at) < 14 ? <span className="st st-warn">New</span> : null}
                      </dd>
                      <dt>Prior warnings</dt>
                      <dd>{user.warnings}</dd>
                      <dt>Other reports</dt>
                      <dd>{user.other_reports}</dd>
                      <dt>Messages sent</dt>
                      <dd>{user.messages_sent.toLocaleString('en-NG')}</dd>
                      <dt>Muted or banned</dt>
                      <dd>{user.sanction ? `${user.sanction.kind === 'mute' ? 'Muted' : user.sanction.kind === 'ban' ? 'Banned' : 'Suspended'} until ${until(user.sanction.ends_at)}` : 'No'}</dd>
                    </dl>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="decide">
        <div className="decide__q">
          {position ? (
            <>
              Report <b>{`${position} of ${total}`}</b> ·{' '}
            </>
          ) : null}
          <a className="link" href="/reports">
            Back to queue
          </a>
        </div>
        <span className="grow" />
        {canDecide && !decided ? (
          <>
            <button
              type="button"
              className="btn btn-g"
              disabled={pending}
              onClick={() => run(() => decideReport(r.id, 'keep'), isChat ? 'Report closed. Message restored.' : 'Report closed. Nothing removed.')}
            >
              Keep
            </button>
            <button
              type="button"
              className="btn btn-g"
              disabled={pending}
              onClick={() => run(() => decideReport(r.id, 'remove', { reason: REASON_LABELS[r.reason] }), `Removed. ${reporters} ${reporters === 1 ? 'reporter' : 'reporters'} told.`)}
            >
              Remove
            </button>
            {isReview ? (
              <button
                type="button"
                className="btn btn-g"
                disabled={pending}
                onClick={() => run(() => decideReport(r.id, 'spoiler', { reason: 'Spoilers' }), 'Marked as spoiler. The reviewer was told why.')}
              >
                Mark as spoiler
              </button>
            ) : null}
            {user && !user.deleted ? (
              <button type="button" className="btn btn-p" disabled={pending} onClick={() => setActing(true)}>
                Remove and act on user…
              </button>
            ) : null}
          </>
        ) : decided ? (
          <span className="muted">{`Decided by ${detail.decided_by_name ?? 'staff'}`}</span>
        ) : null}
        {nextId ? (
          <a className="btn btn-q sm" href={`/reports/${nextId}`}>
            Skip <span className="kbd">J</span>
          </a>
        ) : null}
      </div>
      {acting && user ? (
        <ActionModal
          detail={detail}
          user={user}
          where={where}
          onClose={() => setActing(false)}
          onDone={msg => {
            setActing(false);
            after(msg);
          }}
          onError={showToast}
        />
      ) : null}
      {toastNode}
    </section>
  );
}

function ActionModal({
  detail,
  user,
  where,
  onClose,
  onDone,
  onError,
}: {
  detail: ReportDetail;
  user: NonNullable<ReportDetail['user']>;
  where: string;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const r = detail.report;
  const name = first(user.name);
  const suggested: ActionKind = user.warnings_90d >= 2 ? 'mute' : r.severity === 'high' ? 'mute' : 'warn';
  const [kind, setKind] = useState<ActionKind>(suggested);
  const reporters = detail.reporters.length;
  const outcome = (k: ActionKind) =>
    k === 'warn'
      ? 'removed it and added a formal warning to your account'
      : k === 'mute'
        ? 'removed it and muted your account for 7 days. You can still read your books'
        : k === 'suspend'
          ? 'removed it and suspended your account for 30 days. Your subscription keeps running; you can cancel it in the Play Store'
          : 'removed it and closed your account';
  const draft = (k: ActionKind) =>
    `Hi ${name}, your ${TYPE_LABEL[r.content_type].toLowerCase()}${where ? ` in "${where}"` : ''} broke the Arpedia community rules (${REASON_LABELS[r.reason].toLowerCase()}), so we ${outcome(k)}. If you think we got this wrong, you can appeal from the app within 14 days.`;
  const [message, setMessage] = useState(draft(suggested));
  const [edited, setEdited] = useState(false);
  const [tell, setTell] = useState(true);
  const [reason, setReason] = useState<ReportReason>(r.reason);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const options = ACTIONS.filter(a => !(user.is_minor && a.key === 'suspend'));
  const pick = (k: ActionKind) => {
    setKind(k);
    if (!edited) setMessage(draft(k));
  };
  const help: Record<ActionKind, string> = {
    warn: `Content removed. A formal warning is added to the account${user.warnings ? ` (warning ${user.warnings + 1})` : ''}.`,
    mute: 'Content removed. Cannot post in chats, rooms, discussions, comments or DMs for 7 days. Can still read.',
    suspend: 'Content removed. Cannot sign in to the app for 30 days. The subscription keeps running.',
    ban: user.is_minor
      ? 'Permanent. Under 18: a Super admin reviews it before it applies. Credits are not refunded.'
      : 'Permanent. Only a Super admin can confirm. Credits are not refunded.',
  };
  const submit = () =>
    start(async () => {
      const res = await decideReport(r.id, 'action', {
        action: kind,
        days: kind === 'mute' ? 7 : kind === 'suspend' ? 30 : undefined,
        reason: REASON_LABELS[reason],
        note: note.trim() || undefined,
        message: message.trim(),
        notifyReporters: tell,
      });
      if (res.error) return onError(res.error);
      const what =
        kind === 'warn' ? 'warned' : kind === 'mute' ? 'muted for 7 days' : kind === 'suspend' ? 'suspended for 30 days' : 'sent to a Super admin to confirm the ban';
      onDone(`Removed and ${name} ${what}.${tell && reporters ? ` ${reporters} ${reporters === 1 ? 'reporter' : 'reporters'} told.` : ''}${res.suggest === 'mute' ? ' Third warning in 90 days: consider Mute 7 days.' : ''}`);
    });

  return (
    <div className="screen overlay">
      <a className="backdrop" href="#close" aria-label="Close" onClick={e => (e.preventDefault(), onClose())} />
      <div className="modal wide" role="dialog" aria-label="Take action">
        <div className="modal__h">
          <div className="grow">
            <h2>{`Take action on ${user.name}`}</h2>
            <p>{`Report ${r.ref} · ${REASON_LABELS[r.reason].toLowerCase()}`}</p>
          </div>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__b">
          <div className="radios" role="radiogroup">
            {options.map(a => (
              <div
                key={a.key}
                role="radio"
                aria-checked={kind === a.key}
                tabIndex={0}
                className={`radio${kind === a.key ? ' is-selected' : ''}`}
                onClick={() => pick(a.key)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && pick(a.key)}
              >
                <span>
                  <b>{a.label}</b>
                  <small>{help[a.key]}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="f full">
            <label htmlFor="ra-msg">{`Message ${name} will receive`}</label>
            <textarea
              id="ra-msg"
              className="inp ta"
              rows={4}
              value={message}
              maxLength={2000}
              onChange={e => (setMessage(e.target.value), setEdited(true))}
            />
            <span className="hint">Sent as an in-app message and email. You can edit it.</span>
          </div>
          {reporters ? (
            <label className="checkrow" onClick={() => setTell(v => !v)}>
              <span className={`cb${tell ? ' on' : ''}`} role="checkbox" aria-checked={tell} />
              <span>
                <b>{`Tell the ${reporters} ${reporters === 1 ? 'reporter' : 'reporters'}`}</b>
                <br />
                <small className="faint">They get: &quot;We took action on your report.&quot; They are not told what the action was.</small>
              </span>
            </label>
          ) : null}
          <details className="fold">
            <summary>
              More options <small>reason, internal note</small>
            </summary>
            <div className="fold__b">
              <div className="f">
                <label htmlFor="ra-reason">Reason</label>
                <select id="ra-reason" className="inp sel" value={reason} onChange={e => setReason(e.target.value as ReportReason)}>
                  {Object.entries(REASON_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="f">
                <label htmlFor="ra-note">
                  Internal note <span className="opt">(staff only)</span>
                </label>
                <div className="inp">
                  <input id="ra-note" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} />
                </div>
              </div>
            </div>
          </details>
        </div>
        <div className="modal__f">
          <button type="button" className="btn btn-g" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-p" disabled={pending || !message.trim()} onClick={submit}>
            {ACTIONS.find(a => a.key === kind)!.button}
          </button>
        </div>
      </div>
    </div>
  );
}
