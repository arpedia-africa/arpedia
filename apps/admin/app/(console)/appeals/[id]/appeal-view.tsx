'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { initials, REASON_LABELS, tint, watTime, type ReportReason } from '../../reports/labels';
import { decideAppeal } from '../actions';
import { appealingLabel, shortDate, STATUS_LABEL, type AppealStatus, type AppealSubject } from '../labels';

type SanctionKind = 'warn' | 'mute' | 'suspend' | 'ban';

export interface AppealDetail {
  appeal: {
    id: string;
    user_id: string;
    subject_type: AppealSubject;
    text: string;
    status: AppealStatus;
    created_at: string;
    due_at: string;
    decided_at: string | null;
    decision_note: string | null;
  };
  user_name: string;
  original_decider_name: string | null;
  can_decide: boolean;
  action: {
    action: string;
    duration_days: number | null;
    reason: string;
    created_at: string;
    content_ref: { type?: string } | null;
  } | null;
  report: {
    id: string;
    ref: string;
    reason: ReportReason;
    content_type: string;
    snapshot: { body?: string | null; sender_name?: string; group_name?: string; title?: string; created_at?: string } | null;
  } | null;
  sanction: { kind: SanctionKind; starts_at: string; ends_at: string | null; state: string; created_at: string } | null;
}

const REDUCE_DAYS = 7;
const DAY = 86_400_000;
const dayMonth = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const first = (name: string) => name.replace(/^@/, '').split(/[\s_]+/)[0] ?? name;
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function outcomeText(a: AppealDetail['action'], s: AppealDetail['sanction']): string {
  if (!a) return 'Decision recorded';
  const removed = a.content_ref?.type ? 'Content removed' : null;
  const sanction =
    s?.kind === 'suspend'
      ? `suspended ${a.duration_days ?? ''} days`.replace('  ', ' ')
      : s?.kind === 'mute'
        ? `muted ${a.duration_days ?? ''} days`.replace('  ', ' ')
        : s?.kind === 'ban'
          ? 'banned'
          : s?.kind === 'warn'
            ? 'warned'
            : null;
  return [removed, sanction].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase()) || cap(a.action);
}

/** s-appeal. The decision buttons are off for the original decider. J skips. */
export function AppealView({
  detail,
  failed,
  position,
  total,
  nextId,
  nextName,
}: {
  detail: AppealDetail | null;
  failed: boolean;
  position: number | null;
  total: number;
  nextId: string | null;
  nextName: string | null;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const s = detail?.sanction ?? null;
  const reducible =
    !!s && s.state !== 'overturned' && (s.kind === 'ban' || ((s.kind === 'mute' || s.kind === 'suspend') && (!s.ends_at || new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime() > REDUCE_DAYS * DAY)));
  const readAgain = s ? new Date(new Date(s.starts_at).getTime() + REDUCE_DAYS * DAY) : null;
  const name = detail?.user_name ?? '';
  const [reply, setReply] = useState(() =>
    !detail
      ? ''
      : reducible && readAgain
        ? `Hi ${first(name)}, thank you for explaining. We cannot lift this fully, so we have reduced it to ${REDUCE_DAYS} days. ${readAgain.getTime() <= Date.now() ? 'You can read again now.' : `You can read again from ${dayMonth(readAgain)}.`} Another incident will lead to a longer suspension.`
        : `Hi ${first(name)}, thank you for explaining. We looked at the decision again.`,
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === 'j' || e.key === 'J') && !(e.target as Element).closest('input, textarea') && nextId)
        router.push(`/appeals/${nextId}`);
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
              <b>This appeal didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
              <div className="row">
                <a className="btn btn-g" href="/appeals">
                  Back to appeals
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const { appeal: a, action, report } = detail;
  const decider = detail.original_decider_name;
  const open = a.status === 'new' || a.status === 'in_review';
  const appealing = appealingLabel(a.subject_type, action ? `${action.action}${action.duration_days ? ` ${action.duration_days} days` : ''}` : null);
  const article = /^[aeiou8]/i.test(appealing) || /^1[18]-/.test(appealing) ? 'an' : 'a';
  const snap = report?.snapshot;

  const decide = (outcome: 'upheld' | 'reduced' | 'overturned', msg: string) =>
    start(async () => {
      const res = await decideAppeal(a.id, outcome, reply.trim(), outcome === 'reduced' ? REDUCE_DAYS : undefined);
      if (res.error) return showToast(res.error);
      showToast(msg);
      router.push(nextId ? `/appeals/${nextId}` : '/appeals');
    });

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <a href="/appeals">Appeals</a>
          <Icon name="chev" />
          <span>{`Appeal from ${name}`}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>
              {`${name} appeals ${article} ${appealing.toLowerCase()} `}
              {a.status === 'new' ? <span className="st st-org">New</span> : open ? null : <span className="st">{STATUS_LABEL[a.status]}</span>}
            </h1>
            <div className="ph__meta">
              <span>{`Received ${shortDate(a.created_at).replace(/^Today/, 'today').replace(/^Yesterday/, 'yesterday')}`}</span>
              {decider && action ? <span>{`Decided by ${decider} on ${dayMonth(action.created_at)}`}</span> : null}
              <span>Promise: 3 days</span>
            </div>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>{report ? 'Original report' : 'Original decision'}</h2>
                {report ? (
                  <a className="link" href={`/reports/${report.id}`}>
                    Open report
                  </a>
                ) : null}
              </div>
              <div className="panel__body">
                {snap?.body ? (
                  <div className="msg flagged">
                    <span className={`av sm ${tint(snap.sender_name ?? name)}`}>{initials(snap.sender_name ?? name)}</span>
                    <div className="msg__b">
                      <small>
                        {[snap.sender_name ?? name, snap.created_at ? watTime(snap.created_at) : null, snap.group_name ?? snap.title]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      {snap.body}
                    </div>
                  </div>
                ) : null}
                <dl className="kv tight">
                  {report ? (
                    <>
                      <dt>Reason</dt>
                      <dd>{REASON_LABELS[report.reason]}</dd>
                    </>
                  ) : action ? (
                    <>
                      <dt>Reason</dt>
                      <dd>{action.reason}</dd>
                    </>
                  ) : null}
                  <dt>Outcome</dt>
                  <dd>{outcomeText(action, s)}</dd>
                  <dt>Decided by</dt>
                  <dd>{decider ? `${decider}${action ? `, ${dayMonth(action.created_at)} ${watTime(action.created_at)}` : ''}` : 'Automatic rule'}</dd>
                </dl>
                <b>What the user says</b>
                <div className="ts-review">{`"${a.text}"`}</div>
              </div>
            </div>
            <details className="fold">
              <summary>
                More details <small>history, appellant</small>
              </summary>
              <div className="fold__b">
                <b>
                  Appellant ·{' '}
                  <a className="link" href={`/users/${a.user_id}`}>
                    Open reader
                  </a>
                </b>
                <b>History</b>
                <div className="tl">
                  {a.decided_at ? (
                    <div className="tl__i">
                      <b>{`Appeal ${STATUS_LABEL[a.status].toLowerCase()}`}</b>
                      <small>{`${dayMonth(a.decided_at)}, ${watTime(a.decided_at)}`}</small>
                    </div>
                  ) : null}
                  <div className="tl__i org">
                    <b>Appeal sent from the app</b>
                    <small>{`${dayMonth(a.created_at)}, ${watTime(a.created_at)}`}</small>
                  </div>
                  {action ? (
                    <div className="tl__i err">
                      <b>
                        {s?.kind === 'suspend' || s?.kind === 'mute'
                          ? `${s.kind === 'mute' ? 'Muted' : 'Suspended'} ${action.duration_days ?? ''} days${s.ends_at ? ` (until ${dayMonth(s.ends_at)})` : ''}`
                          : outcomeText(action, s)}
                      </b>
                      <small>{`${dayMonth(action.created_at)}, ${watTime(action.created_at)}${decider ? ` · ${decider}` : ''}`}</small>
                    </div>
                  ) : null}
                </div>
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>{open ? `Reply to ${name}` : 'Reply sent'}</h2>
              </div>
              <div className="panel__body">
                {open ? (
                  <>
                    <div className="f">
                      <label htmlFor="ap-reply">Sent with your decision</label>
                      <textarea
                        id="ap-reply"
                        className="inp ta"
                        rows={4}
                        maxLength={2000}
                        value={reply}
                        disabled={!detail.can_decide}
                        onChange={(e) => setReply(e.target.value)}
                      />
                    </div>
                    <span className="hint">
                      {detail.can_decide
                        ? `A different staff member than ${decider ?? 'the original decider'} must decide, so you can decide this one.`
                        : 'You made the original decision, so a different staff member must decide this one.'}
                    </span>
                  </>
                ) : (
                  <div className="ts-review">{a.decision_note ?? 'No message was added.'}</div>
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
              Appeal <b>{`${position} of ${total}`}</b> ·{' '}
            </>
          ) : null}
          <a className="link" href="/appeals">
            Back to appeals
          </a>
        </div>
        <span className="grow" />
        {open ? (
          <>
            <button
              type="button"
              className="btn btn-g"
              disabled={pending || !detail.can_decide}
              onClick={() => decide('upheld', `Decision kept. ${name} told by app message and email.`)}
            >
              Uphold
            </button>
            {reducible ? (
              <button
                type="button"
                className="btn btn-p"
                disabled={pending || !detail.can_decide}
                onClick={() =>
                  decide(
                    'reduced',
                    `${s?.kind === 'mute' ? 'Mute' : 'Suspension'} reduced to ${REDUCE_DAYS} days. ${
                      readAgain && readAgain.getTime() > Date.now() ? `${name} can read again from ${dayMonth(readAgain)}.` : `${name} can read again now.`
                    }`,
                  )
                }
              >
                {`Reduce to ${REDUCE_DAYS} days`}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-g"
              disabled={pending || !detail.can_decide}
              onClick={() => decide('overturned', `Decision overturned. ${name} told and the strike removed.`)}
            >
              Overturn
            </button>
          </>
        ) : (
          <span className="muted">{STATUS_LABEL[a.status]}</span>
        )}
        {nextId ? (
          <a className="btn btn-q sm" href={`/appeals/${nextId}`} onClick={() => nextName && showToast(`Skipped. Next appeal: ${nextName}.`)}>
            Skip <span className="kbd">J</span>
          </a>
        ) : null}
      </div>
      {toastNode}
    </section>
  );
}
