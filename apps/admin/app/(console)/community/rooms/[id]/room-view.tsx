'use client';

import { formatRoomCode } from '@arpedia/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { avatarClass, initials, num } from '../../labels';
import { roomAction, roomMessages, roomTranscript, type TranscriptLine } from '../actions';
import { downloadText, roomWhen } from '../when';

export interface RoomDetail {
  id: string;
  name: string;
  code: string;
  book: { id: string; title: string; chapter_count: number; status: string } | null;
  host_id: string | null;
  host_name: string | null;
  pace: 'free' | 'three_week' | 'one_day';
  join_policy: 'code' | 'anyone';
  state: 'scheduled' | 'live' | 'ended';
  starts_at: string;
  ended_at: string | null;
  ended_by_name: string | null;
  locked: boolean;
  locked_by_staff: boolean;
  member_count: number;
  live_count: number;
  open_reports: number;
  members: {
    user_id: string;
    name: string;
    avatar_url: string | null;
    is_host: boolean;
    percent: number;
    chapter: number;
    finished_at: string | null;
    muted_until: string | null;
    last_seen_at: string | null;
  }[];
}

/** While watching (after Join silently) the transcript refreshes every 10 seconds. */
const WATCH_MS = 10_000;
const MUTE_HOURS = 24;
const SHOWN_MEMBERS = 50;
const TZ = 'Africa/Lagos';
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const pct = (n: number) => `${Math.round(Number(n))}%`;
const PACE: Record<RoomDetail['pace'], string> = { free: 'Free pace', three_week: '3 chapters a week', one_day: '1 chapter a day' };

/** s-room. */
export function RoomView({
  detail,
  messages: initial,
  failed,
  watching: watchingAtStart,
}: {
  detail: RoomDetail | null;
  messages: TranscriptLine[] | null;
  failed: boolean;
  watching: boolean;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const [watching, setWatching] = useState(watchingAtStart);
  const [messages, setMessages] = useState(initial);
  const told = useRef(false);

  useEffect(() => setMessages(initial), [initial]);

  useEffect(() => {
    if (watchingAtStart && !told.current) {
      told.current = true;
      showToast('Joined silently. Logged; the host is not told.');
    }
  }, [watchingAtStart, showToast]);

  useEffect(() => {
    if (!watching || !detail) return;
    const t = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const next = await roomMessages(detail.id);
      if (next) setMessages(next);
    }, WATCH_MS);
    return () => clearInterval(t);
  }, [watching, detail]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.mwrap')) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  if (failed || !detail)
    return (
      <section className="screen enter">
        <div className="ph">
          <div className="crumbs">
            <Link href="/community/rooms">Reading rooms</Link>
            <Icon name="chev" />
            <span>Room</span>
          </div>
        </div>
        <div className="page">
          <div className="panel">
            <div className="empty">
              <b>This room didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
              <div className="row">
                <button type="button" className="btn btn-g" onClick={() => router.refresh()}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );

  const r = detail;
  const ended = r.state === 'ended';
  const host = r.host_name ?? 'The host';
  const hostFirst = host.split(' ')[0];
  const readers = `${num(r.member_count)} ${r.member_count === 1 ? 'reader' : 'readers'}`;
  const hostRow = r.members.find(m => m.is_host);
  const chapters = r.book?.chapter_count ?? 0;
  const code = formatRoomCode(r.code);
  const list = messages ?? [];
  const last = list.at(-1);
  const now = Date.now();

  const run = (p: Promise<{ ok?: boolean; error?: string }>, ok: string, undo?: () => void, then?: () => void) =>
    start(async () => {
      const res = await p;
      if (!res.ok) return showToast(res.error ?? "That didn't save. Try again.");
      showToast(ok, undo);
      if (then) then();
      else router.refresh();
    });

  const lock = () =>
    run(
      roomAction(r.id, r.locked ? 'unlock' : 'lock'),
      r.locked ? 'Chat open again.' : 'Chat locked. The host sees: Arpedia staff locked the chat.',
      () => run(roomAction(r.id, r.locked ? 'lock' : 'unlock'), 'Undone.'),
    );
  const end = () => {
    setMenu(false);
    run(
      roomAction(r.id, 'end'),
      `Room ended. ${readers} and ${hostFirst} told. Transcript kept 90 days.`,
      () => run(roomAction(r.id, 'undo_end'), 'Room is open again.'),
    );
  };
  const mute = (m: RoomDetail['members'][number], muted: boolean) =>
    run(
      roomAction(r.id, 'mute', { user: m.user_id, until: muted ? null : new Date(now + MUTE_HOURS * 3_600_000).toISOString() }),
      muted ? `${m.name} can write again` : `${m.name} muted in this room for ${MUTE_HOURS} hours`,
      () => run(roomAction(r.id, 'mute', { user: m.user_id, until: muted ? m.muted_until : null }), 'Undone.'),
    );
  const transcript = () =>
    start(async () => {
      setMenu(false);
      const t = await roomTranscript(r.id);
      if (t.text === undefined) return showToast(t.error ?? "The transcript didn't download. Try again.");
      downloadText(`room-${code}.txt`, t.text || 'No messages.');
      showToast('Transcript downloaded. Kept for 90 days.');
    });
  const copyCode = () => {
    setMenu(false);
    void navigator.clipboard?.writeText(code).catch(() => undefined);
    showToast(`Join code ${code} copied`);
  };

  const status = ended
    ? `Ended ${roomWhen(r.ended_at ?? r.starts_at)}${r.ended_by_name ? ` by ${r.ended_by_name}` : ''}`
    : r.state === 'scheduled'
      ? `Scheduled · host ${host}`
      : `Live · host ${host}`;
  const started = r.state === 'scheduled' ? `Starts ${roomWhen(r.starts_at)}` : `Started ${roomWhen(r.starts_at, true)}`;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/community/rooms">Reading rooms</Link>
          <Icon name="chev" />
          <span>{r.name}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>{r.name}</h1>
            <div className="ph__meta">
              <span>{ended ? `${status} · host ${host}` : status}</span>
              <span>{`${started} · ${readers}`}</span>
              <span>
                Join code <span className="mono">{code}</span>
              </span>
              <span>
                {r.book
                  ? `Book: ${r.book.title}${hostRow && chapters > 0 ? `, chapter ${Math.min(Math.max(hostRow.chapter, 1), chapters)} of ${chapters}` : ''}`
                  : 'Book: taken down'}
              </span>
              {r.open_reports > 0 ? <span>{`${num(r.open_reports)} open ${r.open_reports === 1 ? 'report' : 'reports'}`}</span> : null}
              {r.locked ? <span className="err-t">{r.locked_by_staff ? 'Chat locked by staff' : 'Chat locked by the host'}</span> : null}
            </div>
          </div>
          <div className="ph__acts">
            {ended ? (
              <button type="button" className="btn btn-g" disabled={pending} onClick={transcript}>
                Transcript
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-g" disabled={pending} onClick={lock}>
                  {r.locked ? 'Open chat' : 'Lock chat'}
                </button>
                {watching ? null : (
                  <button
                    type="button"
                    className="btn btn-p"
                    disabled={pending}
                    onClick={() =>
                      run(roomAction(r.id, 'join_silently'), 'Joined silently. Logged; the host is not told.', undefined, () =>
                        setWatching(true),
                      )
                    }
                  >
                    Join silently
                  </button>
                )}
              </>
            )}
            <div className="mwrap">
              <button type="button" className="ib" aria-expanded={menu} aria-label="More actions" onClick={() => setMenu(m => !m)}>
                <Icon name="more" />
              </button>
              {menu ? (
                <div className="menu">
                  <button type="button" onClick={copyCode}>
                    Copy join code
                  </button>
                  {r.open_reports > 0 ? (
                    <Link href="/reports" onClick={() => setMenu(false)}>
                      Open the report
                    </Link>
                  ) : null}
                  {ended ? null : (
                    <>
                      <hr />
                      <button type="button" className="danger" onClick={end}>
                        End room for everyone
                      </button>
                    </>
                  )}
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
                <h2>Chat</h2>
                <span className="sub">
                  {`${ended ? 'Ended' : r.locked ? 'Locked' : 'Live'} · ${num(list.length)}${list.length === 50 ? '+' : ''} ${list.length === 1 ? 'message' : 'messages'}${last ? ` · last at ${clock(last.created_at)}` : ''}`}
                </span>
              </div>
              <div className="panel__body">
                {messages === null ? (
                  <div className="empty">
                    <b>Chat didn&apos;t load</b>
                    <span>Refresh the page to try again.</span>
                  </div>
                ) : list.length === 0 ? (
                  <div className="empty">
                    <b>No messages yet</b>
                    <span>Messages show up here as members write.</span>
                  </div>
                ) : (
                  list.map(m => {
                    const i = Math.max(0, r.members.findIndex(x => x.user_id === m.sender_id));
                    const isHost = m.sender_id && m.sender_id === r.host_id;
                    const hidden = m.state === 'removed' || m.state === 'auto_hidden';
                    return (
                      <div key={m.id} className={hidden ? 'msg flagged' : 'msg'}>
                        <span className={`av sm ${avatarClass(i)}`}>{initials(m.sender_name)}</span>
                        <div className="msg__b">
                          <small>{`${m.sender_name}${isHost ? ' (host)' : ''} · ${clock(m.created_at)}${hidden ? ' · hidden' : ''}`}</small>
                          {m.state === 'deleted' ? (
                            <span className="faint">Deleted by the sender.</span>
                          ) : hidden ? (
                            <>
                              {`Message hidden pending review. `}
                              <Link className="link" href="/reports">
                                Open report
                              </Link>
                            </>
                          ) : (
                            m.body
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="panel__foot">
                <span>{watching ? 'Watching silently. Refreshes every 10 s. Members do not see you.' : 'Staff view only. You are not in the room.'}</span>
              </div>
            </div>
            <details className="fold">
              <summary>
                Participants <small>{`${readers} in the room`}</small>
              </summary>
              <div className="fold__b">
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Reader</th>
                        <th>Role</th>
                        <th>{`Progress in ${r.book?.title ?? 'the book'}`}</th>
                        <th className="acts"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.members.slice(0, SHOWN_MEMBERS).map((m, i) => {
                        const muted = !!m.muted_until && new Date(m.muted_until).getTime() > now;
                        return (
                          <tr key={m.user_id}>
                            <td>
                              <div className="who">
                                <span className={`av sm ${avatarClass(i)}`}>{initials(m.name)}</span>
                                <span>
                                  <b>{m.name}</b>
                                </span>
                              </div>
                            </td>
                            <td>{m.is_host ? 'Host' : muted ? <span className="st st-warn">Muted</span> : 'Reader'}</td>
                            <td>
                              <div className="row">
                                <div className="meter grow">
                                  <i className={m.finished_at ? 'ok' : undefined} style={{ ['--v' as string]: pct(m.percent) }}></i>
                                </div>
                                <span className="faint">{pct(m.percent)}</span>
                              </div>
                            </td>
                            <td className="acts">
                              {m.is_host || ended ? null : (
                                <button type="button" className="btn btn-q sm" disabled={pending} onClick={() => mute(m, muted)}>
                                  {muted ? 'Unmute' : 'Mute'}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <span className="hint">{`Showing ${num(Math.min(r.members.length, SHOWN_MEMBERS))} of ${num(r.member_count)}.`}</span>
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Staff controls</h2>
              </div>
              <div className="panel__body">
                {ended ? (
                  <button type="button" className="btn btn-g block" disabled={pending} onClick={transcript}>
                    Download transcript
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-g block" disabled={pending} onClick={lock}>
                      {r.locked ? 'Open the chat' : 'Lock the chat'}
                    </button>
                    <button type="button" className="btn btn-d block" disabled={pending} onClick={end}>
                      End room for everyone
                    </button>
                  </>
                )}
                <span className="hint">All staff controls are written to the audit log.</span>
              </div>
            </div>
            <details className="fold">
              <summary>Room settings</summary>
              <div className="fold__b">
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Chat open</b>
                    <small>{ended ? 'The room has ended' : 'Participants can write'}</small>
                  </span>
                  <button
                    type="button"
                    className={!r.locked && !ended ? 'switch on' : 'switch'}
                    role="switch"
                    aria-checked={!r.locked && !ended}
                    aria-label="Chat open"
                    disabled={ended || pending}
                    onClick={lock}
                  ></button>
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Spoiler guard</b>
                    <small>Hide chat beyond reader&apos;s progress</small>
                  </span>
                  <span className="switch on" role="switch" aria-checked="true" aria-disabled="true"></span>
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Join by code only</b>
                    <small>{r.join_policy === 'code' ? code : 'Anyone can join from Discover'}</small>
                  </span>
                  <span className={r.join_policy === 'code' ? 'switch on' : 'switch'} role="switch" aria-checked={r.join_policy === 'code'} aria-disabled="true"></span>
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Pace</b>
                    <small>{PACE[r.pace]}</small>
                  </span>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
