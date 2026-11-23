'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { reachFor, requestReview, reviewCampaign, saveDraft, schedule, testPush, type Draft } from './actions';
import {
  goesTo,
  LIMIT_BODY,
  LIMIT_TITLE,
  SCREENS,
  STATUS_LABEL,
  whenLabel,
  type Audience,
  type AudienceKind,
  type CampaignStatus,
  type Reach,
  type ScreenKey,
  type Target,
} from './labels';

export interface Option {
  id: string;
  label: string;
}
export interface Campaign {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  open_target: Target;
  status: CampaignStatus;
  send_at: string | null;
  skip_capped: boolean;
  respect_quiet: boolean;
  quiet_override_reason: string | null;
  ab_test: { title_b?: string; split?: number } | null;
  created_by: string | null;
  reviewed_by: string | null;
  updated_at: string;
  similar_recent: string | null;
}

const AUDIENCES: { kind: AudienceKind; label: string; help: string }[] = [
  { kind: 'all', label: 'All readers', help: 'Everyone with push turned on' },
  { kind: 'subscribers', label: 'Subscribers', help: 'Active Monthly, Quarterly or Yearly plan' },
  { kind: 'lapsed_30', label: 'Lapsed 30 days', help: 'No app open in the last 30 days' },
  { kind: 'genre', label: 'Genre readers', help: 'Picked this genre, or read two or more books in it' },
  { kind: 'authors', label: 'Authors', help: 'Approved authors only' },
];
const OPENS: { kind: Target['kind'] | ScreenKey; label: string }[] = [
  { kind: 'book', label: 'Book' },
  { kind: 'author', label: 'Author' },
  { kind: 'room', label: 'Reading room' },
  ...SCREENS.map(s => ({ kind: s.key, label: `App screen: ${s.label}` })),
];

const TZ = 'Africa/Lagos';
const num = (n: number) => n.toLocaleString('en-NG');
/** Today and the next whole hour in WAT, for the Schedule fields. */
function nextHourWat() {
  const d = new Date(Date.now() + 3_600_000);
  const date = d.toLocaleDateString('en-CA', { timeZone: TZ });
  const hour = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2);
  return { date, time: `${hour}:00` };
}
function watParts(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-CA', { timeZone: TZ }),
    time: d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
  };
}
/** "Draft, saved 2 minutes ago". */
function savedAgo(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  return whenLabel(iso);
}
const inQuiet = (time: string) => time >= '22:00' || time < '07:00';

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={on ? 'switch on' : 'switch'}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    ></button>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return (
    <div className="sy-cnt" style={n > max - 10 ? { color: n > max ? 'var(--err-t)' : 'var(--warn-t)' } : undefined}>
      {`${n} of ${max} characters`}
    </div>
  );
}

export function ComposeView({
  campaign,
  genres,
  books,
  authors,
  initialReach,
  staffId,
  canSend,
  isSuper,
}: {
  campaign: Campaign | null;
  genres: Option[];
  books: Option[];
  authors: Option[];
  initialReach: Record<AudienceKind, Reach | null>;
  staffId: string;
  canSend: boolean;
  isSuper: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState(campaign?.id ?? null);
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [body, setBody] = useState(campaign?.body ?? '');
  const [target, setTarget] = useState<Target>(campaign?.open_target ?? { kind: 'book', id: books[0]?.id });
  const [audience, setAudience] = useState<Audience>(campaign?.audience ?? { kind: 'all' });
  const [genreId, setGenreId] = useState(
    (campaign?.audience.kind === 'genre' && campaign.audience.genre_id) || genres[0]?.id || '',
  );
  const [reach, setReach] = useState(initialReach);
  const [now, setNow] = useState(true);
  const first = campaign?.send_at ? watParts(campaign.send_at) : nextHourWat();
  const [date, setDate] = useState(first.date);
  const [time, setTime] = useState(first.time);
  const [ab, setAb] = useState(!!campaign?.ab_test);
  const [titleB, setTitleB] = useState(campaign?.ab_test?.title_b ?? '');
  const [skipCapped, setSkipCapped] = useState(campaign?.skip_capped ?? true);
  const [quiet, setQuiet] = useState(campaign?.respect_quiet ?? true);
  const [quietReason, setQuietReason] = useState(campaign?.quiet_override_reason ?? '');
  const [savedAt, setSavedAt] = useState(campaign?.updated_at ?? null);
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? 'draft');
  const [confirm, setConfirm] = useState<{ reach: number; sendAt: string; moved: boolean } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [toastNode, showToast] = useToast();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Reach follows the frequency-cap switch and the chosen genre (rule 16).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let live = true;
    Promise.all(
      AUDIENCES.map(a =>
        a.kind === 'genre' && !genreId
          ? Promise.resolve(null)
          : reachFor(a.kind === 'genre' ? { kind: 'genre', genre_id: genreId } : { kind: a.kind }, skipCapped),
      ),
    ).then(r => live && setReach(Object.fromEntries(AUDIENCES.map((a, i) => [a.kind, r[i] ?? null])) as typeof reach));
    return () => {
      live = false;
    };
  }, [skipCapped, genreId]);

  const aud: Audience = audience.kind === 'genre' ? { kind: 'genre', genre_id: genreId } : { kind: audience.kind };
  const genreMap = Object.fromEntries(genres.map(g => [g.id, g.label]));
  const genreName = genreMap[genreId] ?? 'Genre';
  const cur = reach[audience.kind];
  const reachN = cur?.reach ?? 0;
  const sendAtIso = now ? null : `${date}T${time}:00+01:00`;
  const moved = !now && quiet && inQuiet(time);
  const sendsLabel = now ? 'Now, in about 2 minutes' : `${whenLabel(`${date}T${moved ? '07:00' : time}:00+01:00`)} WAT`;
  const targetName =
    target.kind === 'book'
      ? books.find(b => b.id === target.id)?.label
      : target.kind === 'author'
        ? authors.find(a => a.id === target.id)?.label
        : target.kind === 'room'
          ? 'Reading room'
          : SCREENS.find(s => s.key === target.screen)?.label;
  const draft: Draft = {
    title: title.trim(),
    body: body.trim(),
    audience: aud,
    open_target: target,
    skip_capped: skipCapped,
    respect_quiet: quiet,
    quiet_override_reason: quiet ? undefined : quietReason.trim(),
    ab_test: ab ? { title_b: titleB.trim(), split: 0.2 } : null,
  };
  const reviewedByOther = !!campaign?.reviewed_by && campaign.reviewed_by !== campaign.created_by;
  const canReview = canSend && !!campaign && campaign.created_by !== staffId && !reviewedByOther;

  const keep = (r: { id?: string }) => {
    if (r.id && r.id !== id) {
      setId(r.id);
      window.history.replaceState(null, '', `/campaigns/${r.id}`);
    }
  };

  const onSave = () =>
    start(async () => {
      setError(undefined);
      const r = await saveDraft(id, draft);
      keep(r);
      if (r.ok) {
        setSavedAt(new Date().toISOString());
        showToast('Draft saved');
      } else setError(r.error);
    });

  const onSchedule = (confirmed: boolean) =>
    start(async () => {
      setError(undefined);
      const r = await schedule(id, draft, sendAtIso, confirmed);
      keep(r);
      if (r.needsReview) {
        setError(`This push reaches ${num(r.reach ?? 0)} readers. Someone other than you must review it before it can go out.`);
        return;
      }
      if (r.needsConfirm) {
        setConfirm({ reach: r.reach ?? reachN, sendAt: r.sendAt ?? new Date().toISOString(), moved: !!r.moved });
        return;
      }
      if (!r.ok) {
        setConfirm(null);
        setError(r.error);
        return;
      }
      setStatus('scheduled');
      const at = r.sendAt ? whenLabel(r.sendAt) : 'now';
      const msg = `Push scheduled for ${at}${r.moved ? ' (moved out of quiet hours)' : ''}. ${num(r.reach ?? 0)} readers will get it.`;
      router.push(`/campaigns?done=${encodeURIComponent(msg)}`);
    });

  const onReview = () =>
    start(async () => {
      if (!id) return;
      const r = await reviewCampaign(id);
      if (r.ok) {
        showToast('Reviewed. It can be scheduled now.');
        router.refresh();
      } else setError(r.error);
    });

  const onRequestReview = () =>
    start(async () => {
      const r = await requestReview(id, draft);
      keep(r);
      if (r.ok) {
        setStatus('in_review');
        showToast('Sent for review. An Operations admin or Super admin will look at it.');
      } else setError(r.error);
    });

  const onTest = () =>
    start(async () => {
      const r = await testPush(id, draft);
      keep(r);
      if (r.noDevice) showToast('Sign in to the Arpedia app on your phone first. Test pushes go to your own devices.');
      else if (r.ok) showToast('Test push sent to your phone. It shows as it will on readers’ phones.');
      else setError(r.error);
    });

  const editable = ['draft', 'in_review', 'paused'].includes(status);
  const lockDate = new Date(clock).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
  const lockTime = new Date(clock).toLocaleTimeString('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/campaigns">Push notifications</Link>
          <Icon name="chev" size="s" />
          <span>{campaign ? campaign.title || 'Untitled push' : 'New notification'}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>Compose push</h1>
            <div className="ph__meta">
              <span>
                {status === 'draft' || status === 'in_review'
                  ? `${STATUS_LABEL[status]}${savedAt ? `, saved ${savedAgo(savedAt, clock)}` : ', not saved yet'}`
                  : STATUS_LABEL[status]}
              </span>
              <span>{`Reaches ${num(reachN)} ${reachN === 1 ? 'reader' : 'readers'}`}</span>
            </div>
          </div>
          {editable ? (
            <div className="ph__acts">
              <button type="button" className="btn btn-g" disabled={pending} onClick={onSave}>
                Save draft
              </button>
              <button type="button" className="ib" aria-label="Send test to my device" disabled={pending} onClick={onTest}>
                <Icon name="phone" />
              </button>
              {canReview && reachN > 10000 ? (
                <button type="button" className="btn btn-g" disabled={pending} onClick={onReview}>
                  Mark as reviewed
                </button>
              ) : null}
              {canSend ? (
                <button
                  type="button"
                  className="btn btn-p"
                  disabled={pending || !title.trim() || !body.trim()}
                  aria-busy={pending}
                  onClick={() => onSchedule(false)}
                >
                  <Icon name="cal" />
                  {now ? 'Send push' : 'Schedule push'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-p"
                  disabled={pending || status === 'in_review' || !title.trim()}
                  onClick={onRequestReview}
                >
                  {status === 'in_review' ? 'Waiting for review' : 'Request review'}
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <div className="page">
        <div className="split split--wide">
          <div className="stack s20">
            {error ? (
              <div className="note err" role="alert">
                <span className="grow">{error}</span>
              </div>
            ) : null}
            {campaign?.similar_recent ? (
              <div className="note warn">
                <span className="grow">
                  <b>Similar push sent recently</b>
                  {`“${campaign.similar_recent}” went out in the last few hours. Check this isn’t a repeat.`}
                </span>
              </div>
            ) : null}
            <div className="panel">
              <div className="panel__head">
                <h2>1. What to say</h2>
              </div>
              <div className="panel__body">
                <div className="form">
                  <div className="f">
                    <label htmlFor="c-title">Title</label>
                    <div className={title.length > LIMIT_TITLE ? 'inp error' : 'inp'}>
                      <input id="c-title" value={title} aria-label="Title" disabled={!editable} onChange={e => setTitle(e.target.value)} />
                    </div>
                    <Counter n={title.length} max={LIMIT_TITLE} />
                  </div>
                  <div className="f">
                    <label htmlFor="c-body">Message</label>
                    <textarea
                      id="c-body"
                      className={body.length > LIMIT_BODY ? 'inp ta error' : 'inp ta'}
                      aria-label="Message"
                      value={body}
                      disabled={!editable}
                      onChange={e => setBody(e.target.value)}
                    ></textarea>
                    <Counter n={body.length} max={LIMIT_BODY} />
                  </div>
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="c-opens">Tapping it opens</label>
                      <div className="inp sel">
                        <select
                          id="c-opens"
                          value={target.kind === 'screen' ? target.screen : target.kind}
                          style={{ appearance: 'none' }}
                          disabled={!editable}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === 'book') setTarget({ kind: 'book', id: books[0]?.id });
                            else if (v === 'author') setTarget({ kind: 'author', id: authors[0]?.id });
                            else if (v === 'room') setTarget({ kind: 'room' });
                            else setTarget({ kind: 'screen', screen: v as ScreenKey });
                          }}
                        >
                          {OPENS.map(o => (
                            <option key={o.kind} value={o.kind}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <Icon name="chevd" size="s" />
                      </div>
                    </div>
                    {target.kind === 'book' || target.kind === 'author' ? (
                      <div className="f">
                        <label htmlFor="c-which">{target.kind === 'book' ? 'Which book' : 'Which author'}</label>
                        <div className="inp sel">
                          <select
                            id="c-which"
                            value={target.id ?? ''}
                            style={{ appearance: 'none' }}
                            disabled={!editable}
                            onChange={e => setTarget({ kind: target.kind, id: e.target.value })}
                          >
                            {(target.kind === 'book' ? books : authors).length === 0 ? (
                              <option value="">{target.kind === 'book' ? 'No live books yet' : 'No authors yet'}</option>
                            ) : null}
                            {(target.kind === 'book' ? books : authors).map(o => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <Icon name="chevd" size="s" />
                        </div>
                      </div>
                    ) : target.kind === 'room' ? (
                      <div className="f">
                        <label htmlFor="c-room">Which reading room</label>
                        <div className="inp">
                          <input
                            id="c-room"
                            placeholder="Room link or id"
                            value={target.id ?? ''}
                            disabled={!editable}
                            onChange={e => setTarget({ kind: 'room', id: e.target.value.trim().split('/').pop() })}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>2. Who gets it</h2>
              </div>
              <div className="panel__body">
                <div className="radios" role="radiogroup" aria-label="Who gets it">
                  {AUDIENCES.map(a => (
                    <div
                      key={a.kind}
                      className={audience.kind === a.kind ? 'radio is-selected' : 'radio'}
                      role="radio"
                      aria-checked={audience.kind === a.kind}
                      tabIndex={audience.kind === a.kind ? 0 : -1}
                      onClick={() => editable && setAudience({ kind: a.kind })}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && editable && (e.preventDefault(), setAudience({ kind: a.kind }))}
                    >
                      <span>
                        <b>{a.kind === 'genre' ? `${genreName} readers` : a.label}</b>
                        <small>{a.help}</small>
                      </span>
                      <span className="sy-n">{reach[a.kind] ? num(reach[a.kind]!.reach) : '–'}</span>
                    </div>
                  ))}
                </div>
                {audience.kind === 'genre' ? (
                  <div className="f">
                    <label htmlFor="c-genre">Genre</label>
                    <div className="inp sel">
                      <select
                        id="c-genre"
                        value={genreId}
                        style={{ appearance: 'none' }}
                        disabled={!editable}
                        onChange={e => setGenreId(e.target.value)}
                      >
                        {genres.map(g => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevd" size="s" />
                    </div>
                  </div>
                ) : null}
                <div className="sy-reach">
                  <b>{num(reachN)}</b>
                  <span className="muted">
                    {`${reachN === 1 ? 'reader' : 'readers'} will get this.`}
                    {cur && cur.left_out_cap > 0 && skipCapped
                      ? ` ${num(cur.left_out_cap)} more ${cur.left_out_cap === 1 ? 'is' : 'are'} left out because they already got 2 marketing pushes this week.`
                      : ''}
                  </span>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>3. When</h2>
              </div>
              <div className="panel__body">
                <div className="radios h" role="radiogroup" aria-label="When">
                  {[
                    { v: true, b: 'Send now', s: 'Goes out in about 2 minutes' },
                    { v: false, b: 'Schedule', s: 'Pick a date and time in WAT' },
                  ].map(o => (
                    <div
                      key={o.b}
                      className={now === o.v ? 'radio is-selected' : 'radio'}
                      role="radio"
                      aria-checked={now === o.v}
                      tabIndex={now === o.v ? 0 : -1}
                      onClick={() => editable && setNow(o.v)}
                      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && editable && (e.preventDefault(), setNow(o.v))}
                    >
                      <span>
                        <b>{o.b}</b>
                        <small>{o.s}</small>
                      </span>
                    </div>
                  ))}
                </div>
                {!now ? (
                  <>
                    <div className="fgrid">
                      <div className="f">
                        <label htmlFor="c-date">Date</label>
                        <div className="inp">
                          <input id="c-date" type="date" aria-label="Date" value={date} disabled={!editable} onChange={e => setDate(e.target.value)} />
                        </div>
                      </div>
                      <div className="f">
                        <label htmlFor="c-time">Time (WAT)</label>
                        <div className="inp">
                          <input id="c-time" type="time" aria-label="Time" value={time} disabled={!editable} onChange={e => setTime(e.target.value)} />
                        </div>
                      </div>
                    </div>
                    {moved ? (
                      <span className="hint">No pushes go out 22:00 to 07:00 WAT, so this one moves to 07:00.</span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>4. Review</h2>
              </div>
              <div className="panel__body sy-rev">
                <div className="kv-row">
                  <span>Message</span>
                  <b>{title.trim() || 'Add a title'}</b>
                </div>
                <div className="kv-row">
                  <span>Goes to</span>
                  <b>{goesTo(aud, reachN, genreMap)}</b>
                </div>
                <div className="kv-row">
                  <span>Sends</span>
                  <b>{sendsLabel}</b>
                </div>
                <details className="fold" open={ab || !quiet || undefined}>
                  <summary>
                    More options <small>A/B test, frequency cap, quiet hours</small>
                  </summary>
                  <div className="fold__b">
                    <div className="setrow">
                      <span className="setrow__b">
                        <b>A/B test the title</b>
                        <small>A second title goes to 20% first, the winner goes to everyone else after 2 hours</small>
                      </span>
                      <Switch on={ab} label="A/B test" disabled={!editable} onChange={setAb} />
                    </div>
                    {ab ? (
                      <div className="f">
                        <label htmlFor="c-title-b">Second title</label>
                        <div className={titleB.length > LIMIT_TITLE ? 'inp error' : 'inp'}>
                          <input id="c-title-b" value={titleB} disabled={!editable} onChange={e => setTitleB(e.target.value)} />
                        </div>
                        <Counter n={titleB.length} max={LIMIT_TITLE} />
                      </div>
                    ) : null}
                    <div className="setrow">
                      <span className="setrow__b">
                        <b>Skip readers who got 2 marketing pushes this week</b>
                        <small>
                          {`${num(cur?.left_out_cap ?? 0)} ${cur?.left_out_cap === 1 ? 'reader is' : 'readers are'} left out. Account and money messages are never capped.`}
                        </small>
                      </span>
                      <Switch on={skipCapped} label="Frequency cap" disabled={!editable} onChange={setSkipCapped} />
                    </div>
                    <div className="setrow">
                      <span className="setrow__b">
                        <b>Respect quiet hours</b>
                        <small>
                          {isSuper
                            ? 'No sends 22:00 to 07:00 WAT. Turn off only for something urgent.'
                            : 'No sends 22:00 to 07:00 WAT. Only a Super admin can turn this off.'}
                        </small>
                      </span>
                      <Switch on={quiet} label="Quiet hours" disabled={!editable || !isSuper} onChange={setQuiet} />
                    </div>
                    {!quiet ? (
                      <div className="f">
                        <label htmlFor="c-why">Why can’t this wait until 07:00?</label>
                        <div className="inp">
                          <input id="c-why" value={quietReason} disabled={!editable} onChange={e => setQuietReason(e.target.value)} />
                        </div>
                        <span className="hint">For urgent service messages only. The audit log records the reason.</span>
                      </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
          </div>
          <div className="sy-prevcol">
            <div className="phone">
              <div className="phone__s lock">
                <div className="lock__time">{lockTime}</div>
                <div className="sy-lockdate">{lockDate}</div>
                <div className="push">
                  <span className="app">
                    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" focusable="false">
                      <image href="/brand/mark.png" width="48" height="48" />
                    </svg>
                  </span>
                  <span>
                    <b>{title.trim() || 'Your title shows here'}</b>
                    {body.trim() || 'Your message shows here.'}
                    <br />
                    <small>Arpedia · now</small>
                  </span>
                </div>
                <div className="sy-lockhint">Preview of an Android lock screen</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {confirm ? (
        <section className="screen overlay enter">
          <a
            className="backdrop"
            href="#close"
            aria-label="Close"
            onClick={e => {
              e.preventDefault();
              setConfirm(null);
            }}
          />
          <div className="modal" role="dialog" aria-label="Confirm push">
            <div className="modal__h">
              <div className="grow">
                <h2>{`Send this push to ${num(confirm.reach)} readers?`}</h2>
                <p>Check it once. Readers cannot take back a push after it is delivered.</p>
              </div>
              <button type="button" className="ib" aria-label="Close" onClick={() => setConfirm(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <div className="sy-inbox">
                <b>{title.trim()}</b>
                <span className="muted">{body.trim()}</span>
              </div>
              <div className="kv-row">
                <span>Goes to</span>
                <b>{goesTo(aud, confirm.reach, genreMap)}</b>
              </div>
              <div className="kv-row">
                <span>Sends</span>
                <b>{now && !confirm.moved ? 'Now, in about 2 minutes' : `${whenLabel(confirm.sendAt)} WAT`}</b>
              </div>
              <div className="kv-row">
                <span>Tapping it opens</span>
                <b>{targetName ?? 'Home'}</b>
              </div>
              {confirm.moved ? (
                <span className="hint">Moved to 07:00 because no pushes go out 22:00 to 07:00 WAT.</span>
              ) : null}
              {Math.abs(confirm.reach - reachN) > reachN * 0.1 ? (
                <div className="note warn">
                  <span className="grow">{`The audience changed since you opened this page: it was ${num(reachN)} readers.`}</span>
                </div>
              ) : null}
            </div>
            <div className="modal__f">
              <button type="button" className="btn btn-g" onClick={() => setConfirm(null)}>
                Back to edit
              </button>
              <button type="button" className="btn btn-p" disabled={pending} aria-busy={pending} onClick={() => onSchedule(true)}>
                {pending ? 'Scheduling…' : now ? 'Send push' : 'Schedule push'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {toastNode}
    </section>
  );
}
