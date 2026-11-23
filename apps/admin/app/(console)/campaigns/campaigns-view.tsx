'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import {
  cancelCampaign,
  deleteDraft,
  duplicateCampaign,
  pauseCampaign,
  restoreCampaign,
  setPushType,
  type ActionResult,
} from './actions';
import {
  audienceLabel,
  conversionLabel,
  LIMIT_BODY,
  LIMIT_TITLE,
  monthName,
  opensLabel,
  pct,
  STATUS_LABEL,
  whenLabel,
  type Audience,
  type CampaignStatus,
  type Target,
} from './labels';

export interface CampaignRow {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  open_target: Target;
  status: CampaignStatus;
  send_at: string | null;
  sent_at: string | null;
  reach: number | null;
  sent: number;
  delivered: number;
  opened: number;
  conversions: number;
  moved_from: string | null;
  updated_at: string;
}
export interface AutoRow {
  key: string;
  label: string;
  enabled: boolean;
  can_switch_off: boolean;
  title_template: string;
  body_template: string;
  switched_at: string | null;
  switched_by: string | null;
  sent_30d: number;
}
export interface CampaignList {
  stats: {
    sent_month: number;
    delivered_pct: number | null;
    delivered_prev_pct: number | null;
    opened_pct: number | null;
    best: { key: string; label: string; pct: number } | null;
  };
  push_off: { readers: number; pct: number | null };
  counts: { all: number; sent: number; scheduled: number; drafts: number };
  rows: CampaignRow[];
  automatic: AutoRow[];
}

/** Who gets each automatic notification and how it behaves (s-campaigns fold). */
const AUTO_HELP: Record<string, string> = {
  author_approved: 'To the applicant',
  book_approved: 'To the author · opens the book page',
  changes_requested: 'To the author · includes the first line of the staff note',
  author_new_post: 'To followers · batched to 1 per author per day',
  author_new_book: 'To followers · batched to 1 per author per day',
  room_starting: 'To readers who joined the room',
  reading_reminder: 'To readers who haven’t read in 3 days · at most 1 a week',
  credits_low: 'To subscribers · once per period · opens Credits',
  renewal_failed: 'To the subscriber · day 1, day 3 and day 5 of grace',
};

/** Short names for the Opened KPI's "Best:" line, so it stays on one line. */
const BEST_NAME: Record<string, string> = {
  club_message: 'club messages',
  author_reply: 'author replies',
  note_reply: 'note replies',
  room_starting: 'reading room reminders',
  room_finished: 'room finishes',
  author_new_post: 'author posts',
  author_new_book: 'new chapters',
  reading_reminder: 'reading reminders',
  new_arrival: 'new arrivals',
  campaign: 'staff pushes',
  author_approved: 'author approvals',
  book_approved: 'book approvals',
  changes_requested: 'change requests',
  renewal_failed: 'renewal notices',
};

type Filter = 'all' | 'sent' | 'scheduled' | 'drafts';
const FILTERS: { key: Filter; label: string; test: (r: CampaignRow) => boolean }[] = [
  { key: 'all', label: 'All notifications', test: () => true },
  { key: 'sent', label: 'Sent', test: r => r.status === 'sent' },
  { key: 'scheduled', label: 'Scheduled', test: r => ['scheduled', 'paused', 'sending'].includes(r.status) },
  { key: 'drafts', label: 'Drafts', test: r => r.status === 'draft' || r.status === 'in_review' },
];
type Sort = 'new' | 'old' | 'opened';
const SORTS: { key: Sort; label: string }[] = [
  { key: 'new', label: 'Newest first' },
  { key: 'old', label: 'Oldest first' },
  { key: 'opened', label: 'Most opened' },
];

const when = (r: CampaignRow) => r.sent_at ?? r.send_at ?? r.updated_at;
const openRate = (r: CampaignRow) => (r.delivered ? r.opened / r.delivered : -1);
const num = (n: number) => n.toLocaleString('en-NG');
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short' });

export function CampaignsView({
  data,
  genres,
  canSend,
  canDraft,
  done,
}: {
  data: CampaignList | null;
  genres: Record<string, string>;
  canSend: boolean;
  canDraft: boolean;
  done?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('new');
  const [menu, setMenu] = useState<string | null>(null);
  const [wording, setWording] = useState<AutoRow | null>(null);
  const [, start] = useTransition();
  const [toastNode, showToast] = useToast();

  // The composer lands here with its confirmation (s-campaign-confirm → s-campaigns toast).
  useEffect(() => {
    if (!done) return;
    showToast(done);
    window.history.replaceState(null, '', '/campaigns');
  }, [done, showToast]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.mwrap')) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const rows = data?.rows ?? [];
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const test = FILTERS.find(f => f.key === filter)!.test;
    return rows
      .filter(r => test(r) && (!t || r.title.toLowerCase().includes(t)))
      .sort((a, b) =>
        sort === 'opened'
          ? openRate(b) - openRate(a)
          : (sort === 'old' ? 1 : -1) * (new Date(when(a)).getTime() - new Date(when(b)).getTime()),
      );
  }, [rows, q, filter, sort]);

  const run = (p: Promise<ActionResult>, ok: string, undo?: () => void) =>
    start(async () => {
      const r = await p;
      if (r.ok) showToast(ok, undo);
      else showToast(r.error ?? "That didn't save. Try again.");
    });

  const duplicate = (r: CampaignRow, unopened: boolean) =>
    start(async () => {
      const res = await duplicateCampaign(r.id, unopened);
      if (!res.ok || !res.id) return showToast(res.error ?? "That didn't save. Try again.");
      showToast(unopened ? 'Copied as a new draft for readers who did not open it' : 'Copied as a new draft');
      router.push(`/campaigns/${res.id}`);
    });

  const month = monthName();
  const prevMonth = monthName(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15));
  const s = data?.stats;
  const deliveredDiff = s?.delivered_pct != null && s.delivered_prev_pct != null ? s.delivered_pct - s.delivered_prev_pct : null;
  const autoOn = (data?.automatic ?? []).filter(a => a.enabled).length;
  const offRows = (data?.automatic ?? []).filter(a => !a.enabled);
  const thisMonth = rows.filter(r => new Date(when(r)) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Push notifications</h1>
          </div>
          {canDraft ? (
            <div className="band__acts">
              <Link className="btn btn-n" href="/campaigns/new">
                <Icon name="plus" />
                New notification
              </Link>
            </div>
          ) : null}
        </div>
      </div>
      <div className="page">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__l">{`Sent in ${month}`}</span>
            <span className="kpi__v">{num(s?.sent_month ?? 0)}</span>
            <span className="kpi__d">{`${data?.counts.scheduled ?? 0} scheduled · ${data?.counts.drafts ?? 0} ${data?.counts.drafts === 1 ? 'draft' : 'drafts'}`}</span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Delivered</span>
            <span className="kpi__v">{s?.delivered_pct != null ? `${s.delivered_pct.toFixed(1)}%` : '–'}</span>
            <span className="kpi__d">
              {deliveredDiff != null ? (
                <>
                  <span className={deliveredDiff >= 0 ? 'up' : 'down'}>{`${deliveredDiff >= 0 ? '+' : ''}${deliveredDiff.toFixed(1)}%`}</span>
                  {` vs ${prevMonth}`}
                </>
              ) : (
                'From phone delivery receipts'
              )}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Opened</span>
            <span className="kpi__v">{s?.opened_pct != null ? `${s.opened_pct.toFixed(1)}%` : '–'}</span>
            <span className="kpi__d">
              {s?.best ? `Best: ${BEST_NAME[s.best.key] ?? s.best.label.toLowerCase()}, ${s.best.pct}%` : 'Of pushes delivered'}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi__l">Turned push off</span>
            <span className="kpi__v">{data?.push_off.pct != null ? `${data.push_off.pct.toFixed(1)}%` : '–'}</span>
            <span className="kpi__d">{`${num(data?.push_off.readers ?? 0)} ${data?.push_off.readers === 1 ? 'reader' : 'readers'}`}</span>
          </div>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input placeholder="Search by title" aria-label="Search campaigns" value={q} onChange={e => setQ(e.target.value)} />
          </label>
          <div className="mwrap">
            <button
              type="button"
              className="fbtn"
              aria-expanded={menu === 'filters'}
              onClick={() => setMenu(m => (m === 'filters' ? null : 'filters'))}
            >
              <Icon name="filter" />
              Filters
            </button>
            {menu === 'filters' ? (
              <div className="menu sy-menul">
                {FILTERS.map(f => (
                  <a
                    key={f.key}
                    href={`#${f.key}`}
                    aria-current={filter === f.key ? 'true' : undefined}
                    onClick={e => {
                      e.preventDefault();
                      setFilter(f.key);
                      setMenu(null);
                    }}
                  >
                    {f.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          <span className="grow"></span>
          <div className="mwrap">
            <button
              type="button"
              className="dd"
              aria-expanded={menu === 'sort'}
              onClick={() => setMenu(m => (m === 'sort' ? null : 'sort'))}
            >
              <Icon name="sort" />
              {SORTS.find(x => x.key === sort)!.label}
            </button>
            {menu === 'sort' ? (
              <div className="menu">
                {SORTS.map(x => (
                  <a
                    key={x.key}
                    href={`#${x.key}`}
                    aria-current={sort === x.key ? 'true' : undefined}
                    onClick={e => {
                      e.preventDefault();
                      setSort(x.key);
                      setMenu(null);
                    }}
                  >
                    {x.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="panel panel--flush">
          {!data ? (
            <div className="empty">
              <b>Pushes didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <b>No pushes yet. Compose your first.</b>
              <span>Sent, scheduled and draft pushes show here with delivered and opened.</span>
              {canDraft ? (
                <div className="row">
                  <Link className="btn btn-p" href="/campaigns/new">
                    New notification
                  </Link>
                </div>
              ) : null}
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">
              <b>Nothing matches</b>
              <span>Try another title, or show all notifications.</span>
              <div className="row">
                <button type="button" className="btn btn-g" onClick={() => (setQ(''), setFilter('all'))}>
                  Clear filters
                </button>
              </div>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Notification</th>
                    <th>When</th>
                    <th className="r">Delivered</th>
                    <th className="r">Opened</th>
                    <th className="r">Conversions</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => {
                    const sent = r.status === 'sent' || r.status === 'sending';
                    const draft = r.status === 'draft' || r.status === 'in_review';
                    const scheduled = r.status === 'scheduled' || r.status === 'paused';
                    const at = r.sent_at ?? r.send_at;
                    return (
                      <tr key={r.id} onClick={() => router.push(`/campaigns/${r.id}`)}>
                        <td>
                          <b>{r.title || 'Untitled push'}</b>
                          <br />
                          <small className="faint">
                            {[audienceLabel(r.audience, genres), r.reach != null ? num(r.reach) : null, opensLabel(r.open_target)]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </td>
                        <td className={at && !draft ? 'nw' : 'nw muted'}>
                          {at && !draft ? whenLabel(at) : 'Not scheduled'}
                          <br />
                          <small className="faint">{STATUS_LABEL[r.status]}</small>
                        </td>
                        <td className={sent ? 'n' : 'n muted'}>{sent ? pct(r.delivered, r.sent) : 'Not sent'}</td>
                        <td className={sent ? 'n' : 'n muted'}>{sent ? pct(r.opened, r.delivered) : 'Not sent'}</td>
                        <td className={r.conversions ? 'n' : 'n muted'}>
                          {r.conversions ? conversionLabel(r.open_target, r.conversions) : 'None yet'}
                        </td>
                        <td className="acts" onClick={e => e.stopPropagation()}>
                          {canDraft ? (
                            <div className="mwrap">
                              <button
                                type="button"
                                className="ib"
                                aria-expanded={menu === r.id}
                                aria-label="More actions"
                                onClick={() => setMenu(m => (m === r.id ? null : r.id))}
                              >
                                <Icon name="more" />
                              </button>
                              {menu === r.id ? (
                                <div className="menu">
                                  {scheduled && canSend ? (
                                    r.status === 'paused' ? (
                                      <button
                                        type="button"
                                        onClick={() => (setMenu(null), run(restoreCampaign(r.id), 'Back on the schedule.'))}
                                      >
                                        Resume
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => (
                                          setMenu(null),
                                          run(pauseCampaign(r.id), 'Paused. It will not go out until you resume it.', () =>
                                            run(restoreCampaign(r.id), 'Back on the schedule.'),
                                          )
                                        )}
                                      >
                                        Pause
                                      </button>
                                    )
                                  ) : null}
                                  <button type="button" onClick={() => (setMenu(null), duplicate(r, false))}>
                                    Duplicate
                                  </button>
                                  {r.status === 'sent' ? (
                                    <button type="button" onClick={() => (setMenu(null), duplicate(r, true))}>
                                      Send again to readers who did not open it
                                    </button>
                                  ) : null}
                                  {scheduled && canSend ? (
                                    <>
                                      <hr />
                                      <button
                                        type="button"
                                        className="danger"
                                        onClick={() => (
                                          setMenu(null),
                                          run(cancelCampaign(r.id), 'Cancelled. No readers will get it.', () =>
                                            run(restoreCampaign(r.id), 'Back on the schedule.'),
                                          )
                                        )}
                                      >
                                        Cancel push
                                      </button>
                                    </>
                                  ) : null}
                                  {draft ? (
                                    <>
                                      <hr />
                                      <button
                                        type="button"
                                        className="danger"
                                        onClick={() => (setMenu(null), run(deleteDraft(r.id), 'Draft deleted'))}
                                      >
                                        Delete draft
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{`${thisMonth} ${thisMonth === 1 ? 'notification' : 'notifications'} this month`}</span>
            <span>All times are WAT</span>
          </div>
        </div>
        {data?.automatic.length ? (
          <details className="fold">
            <summary>
              Automatic notifications{' '}
              <small>{`${data.automatic.length} sent by the system, ${autoOn} on`}</small>
            </summary>
            <div className="fold__b">
              <div className="list">
                {data.automatic.map(a => (
                  <div className="setrow" key={a.key}>
                    <span className="setrow__b">
                      <b>{a.label}</b>
                      <small>
                        {[
                          AUTO_HELP[a.key],
                          a.key === 'author_approved' ? `“${a.title_template}”` : null,
                          `sent ${num(a.sent_30d)} ${a.sent_30d === 1 ? 'time' : 'times'} in 30 days`,
                          a.can_switch_off ? null : 'cannot be switched off',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                    {canSend ? (
                      <a
                        className="link"
                        href={`#${a.key}`}
                        onClick={e => {
                          e.preventDefault();
                          setWording(a);
                        }}
                      >
                        Edit wording
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className={a.enabled ? 'switch on' : 'switch'}
                      role="switch"
                      aria-checked={a.enabled}
                      aria-label={a.label}
                      disabled={!canSend || !a.can_switch_off}
                      onClick={() =>
                        run(
                          setPushType(a.key, { enabled: !a.enabled }),
                          a.enabled ? `${a.label} is off. The audit log records it.` : `${a.label} is on again.`,
                        )
                      }
                    ></button>
                  </div>
                ))}
              </div>
              {offRows.map(a => (
                <span className="hint" key={a.key}>
                  {`${a.label} is off.${a.switched_by && a.switched_at ? ` Turned off by ${a.switched_by} on ${shortDay(a.switched_at)}.` : ''}`}
                </span>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      {wording ? (
        <WordingModal
          row={wording}
          onClose={() => setWording(null)}
          onSaved={() => {
            setWording(null);
            showToast(`Wording saved for ${wording.label}. The next one uses it.`);
          }}
        />
      ) : null}
      {toastNode}
    </section>
  );
}

/** Edit wording for one automatic notification, in the console's modal. */
function WordingModal({ row, onClose, onSaved }: { row: AutoRow; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(row.title_template);
  const [body, setBody] = useState(row.body_template);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <section className="screen overlay enter">
      <a
        className="backdrop"
        href="#close"
        aria-label="Close"
        onClick={e => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className="modal" role="dialog" aria-label="Edit wording">
        <div className="modal__h">
          <div className="grow">
            <h2>{row.label}</h2>
            <p>Words in double braces, like {'{{book_title}}'}, are filled in for each reader.</p>
          </div>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__b">
          <div className="form">
            <div className="f">
              <label htmlFor="w-t">Title</label>
              <div className="inp">
                <input id="w-t" value={title} maxLength={LIMIT_TITLE} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="sy-cnt">{`${title.length} of ${LIMIT_TITLE} characters`}</div>
            </div>
            <div className="f">
              <label htmlFor="w-b">Message</label>
              <textarea id="w-b" className="inp ta" value={body} maxLength={LIMIT_BODY} onChange={e => setBody(e.target.value)} />
              <div className="sy-cnt">{`${body.length} of ${LIMIT_BODY} characters`}</div>
            </div>
          </div>
          {error ? (
            <div className="note err" role="alert">
              <span className="grow">{error}</span>
            </div>
          ) : null}
        </div>
        <div className="modal__f">
          <button type="button" className="btn btn-g" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-p"
            disabled={pending || !title.trim()}
            aria-busy={pending}
            onClick={() =>
              start(async () => {
                const r = await setPushType(row.key, { title, body });
                if (r.ok) onSaved();
                else setError(r.error);
              })
            }
          >
            {pending ? 'Saving…' : 'Save wording'}
          </button>
        </div>
      </div>
    </section>
  );
}
