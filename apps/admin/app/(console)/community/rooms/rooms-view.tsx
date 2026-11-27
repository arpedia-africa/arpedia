'use client';

import { formatRoomCode } from '@arpedia/core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { num } from '../labels';
import { roomAction, roomTranscript } from './actions';
import { downloadText, roomWhen } from './when';

export type RoomTab = 'live' | 'scheduled' | 'ended';

export interface RoomRow {
  id: string;
  name: string;
  book: string;
  host: string | null;
  members: number;
  live: number;
  startsAt: string;
  endedAt: string | null;
  code: string;
  reports: number;
  total: number;
}

export interface RoomCounts {
  live: number;
  scheduled: number;
  ended: number;
}

const TAB_LABEL: Record<RoomTab, string> = { live: 'Live now', scheduled: 'Scheduled', ended: 'Ended' };
const PANEL_TITLE: Record<RoomTab, string> = { live: 'Live now', scheduled: 'Scheduled', ended: 'Ended recently' };
const FOLD_NOTE: Record<RoomTab, string> = { live: 'open now', scheduled: 'next 3 days', ended: 'transcripts kept 90 days' };
const COUNT_HEAD: Record<RoomTab, string> = { live: 'Participants', scheduled: 'RSVP', ended: 'Peak' };
const WHEN_HEAD: Record<RoomTab, string> = { live: 'Started', scheduled: 'Starts', ended: 'Ended' };
const NOUN: Record<RoomTab, string> = { live: 'live rooms', scheduled: 'scheduled rooms', ended: 'ended rooms' };
/** Live participant counts refresh every 10 seconds (Admin side). */
const LIVE_REFRESH_MS = 10_000;

/** s-rooms. */
export function RoomsView({
  tab,
  q,
  rows,
  counts,
  channels,
  failed,
  canAct,
}: {
  tab: RoomTab;
  q: string;
  rows: Record<RoomTab, RoomRow[]>;
  counts: RoomCounts | null;
  channels: number | null;
  failed: boolean;
  canAct: boolean;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState(q);
  const first = useRef(true);

  const go = (next: { tab?: RoomTab; q?: string }) => {
    const p = new URLSearchParams();
    const t = next.tab ?? tab;
    const s = (next.q ?? search).trim();
    if (t !== 'live') p.set('tab', t);
    if (s) p.set('q', s);
    router.replace(`/community/rooms${p.size ? `?${p}` : ''}`, { scroll: false });
  };

  // Search as you type (server side, so codes like grac-e24a match too).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => go({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  const run = (p: Promise<{ ok?: boolean; error?: string }>, ok: string, undo?: () => void, then?: () => void) =>
    start(async () => {
      const r = await p;
      if (!r.ok) return showToast(r.error ?? "That didn't save. Try again.");
      showToast(ok, undo);
      if (then) then();
      else router.refresh();
    });

  const transcript = (row: RoomRow) =>
    start(async () => {
      const r = await roomTranscript(row.id);
      if (r.text === undefined) return showToast(r.error ?? "The transcript didn't download. Try again.");
      downloadText(`room-${formatRoomCode(row.code)}.txt`, r.text || 'No messages.');
      showToast('Transcript downloaded. Kept for 90 days.');
    });

  const count = (t: RoomTab) => counts?.[t] ?? 0;
  const open = (row: RoomRow) => canAct && router.push(`/community/rooms/${row.id}`);

  const table = (t: RoomTab) => {
    const list = rows[t];
    if (list.length === 0)
      return (
        <div className="empty">
          <b>{q ? 'No rooms match' : t === 'live' ? 'No live rooms right now' : t === 'scheduled' ? 'Nothing scheduled' : 'No rooms ended in the last 90 days'}</b>
          <span>{q ? 'Try a room name, book title or join code.' : t === 'live' ? 'Rooms readers start show up here as they open.' : 'Rooms show up here when they have a start date or end.'}</span>
        </div>
      );
    return (
      <div className="tw">
        <table className="tbl">
          <thead>
            <tr>
              <th>Room</th>
              <th className="r">{COUNT_HEAD[t]}</th>
              <th>{WHEN_HEAD[t]}</th>
              <th>Join code</th>
              <th className="r">Reports</th>
              <th className="acts"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(r => (
              <tr
                key={r.id}
                data-go={canAct ? 'room' : undefined}
                tabIndex={canAct ? 0 : undefined}
                onClick={() => open(r)}
                onKeyDown={e => e.key === 'Enter' && open(r)}
              >
                <td>
                  <b>{r.name}</b>
                  <br />
                  <small className="faint">{`${r.book} · host ${r.host ?? 'left the room'}`}</small>
                </td>
                <td className="n">{num(t === 'live' ? r.live : r.members)}</td>
                <td className="nw">{roomWhen(t === 'ended' ? (r.endedAt ?? r.startsAt) : r.startsAt, t === 'live')}</td>
                <td className="mono">{formatRoomCode(r.code)}</td>
                <td className="n">{r.reports > 0 ? <span className="st st-err">{num(r.reports)}</span> : 0}</td>
                <td className="acts" onClick={e => e.stopPropagation()}>
                  {!canAct ? null : t === 'live' ? (
                    <button
                      type="button"
                      className="btn btn-g sm"
                      disabled={pending}
                      onClick={() =>
                        run(roomAction(r.id, 'join_silently'), 'Joined silently. Logged; the host is not told.', undefined, () =>
                          router.push(`/community/rooms/${r.id}?watch=1`),
                        )
                      }
                    >
                      Join silently
                    </button>
                  ) : t === 'scheduled' ? (
                    <button
                      type="button"
                      className="btn btn-q sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          roomAction(r.id, 'cancel'),
                          `Room cancelled. ${r.host ?? 'The host'} and ${num(r.members)} ${r.members === 1 ? 'reader' : 'readers'} told.`,
                          () => run(roomAction(r.id, 'undo_end'), 'Room is back on.'),
                        )
                      }
                    >
                      Cancel room
                    </button>
                  ) : (
                    <button type="button" className="btn btn-q sm" disabled={pending} onClick={() => transcript(r)}>
                      Transcript
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Reading rooms</h1>
          </div>
          <div className="band__acts">
            <Link className="ib" href="/reports" aria-label="Reports">
              <Icon name="flag" />
            </Link>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected="false" href="/community">
          Channels{channels === null ? null : <> <span className="c">{num(channels)}</span></>}
        </Link>
        <a role="tab" aria-selected="true" className="is-selected">
          Reading rooms <span className="c">{`${num(count('live'))} live`}</span>
        </a>
      </div>
      <div className="page">
        <div className="toolbar">
          <div className="seg">
            {(['live', 'scheduled', 'ended'] as RoomTab[]).map(t => (
              <button key={t} type="button" className={t === tab ? 'is-selected' : undefined} aria-pressed={t === tab} onClick={() => go({ tab: t })}>
                {TAB_LABEL[t]} <span className="faint">{num(count(t))}</span>
              </button>
            ))}
          </div>
          <span className="grow"></span>
          <label className="search">
            <Icon name="search" />
            <input placeholder="Room, book, host or join code" aria-label="Search rooms" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
        </div>
        {failed ? (
          <div className="panel">
            <div className="empty">
              <b>Rooms didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
              <div className="row">
                <button type="button" className="btn btn-g" onClick={() => router.refresh()}>
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>{PANEL_TITLE[tab]}</h2>
              </div>
              {table(tab)}
              {rows[tab].length > 0 ? (
                <div className="pager">
                  <span>{`Showing ${num(rows[tab].length)} of ${num(rows[tab][0]?.total ?? rows[tab].length)} ${NOUN[tab]}`}</span>
                </div>
              ) : null}
            </div>
            {(['live', 'scheduled', 'ended'] as RoomTab[]).filter(t => t !== tab).map(t => (
              <details key={t} className="fold">
                <summary>
                  {PANEL_TITLE[t]} <small>{`${num(count(t))} · ${FOLD_NOTE[t]}`}</small>
                </summary>
                <div className="fold__b">{table(t)}</div>
              </details>
            ))}
          </>
        )}
      </div>
      {toastNode}
    </section>
  );
}
