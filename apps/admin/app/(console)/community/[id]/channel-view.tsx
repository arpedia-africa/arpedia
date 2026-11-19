'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { muteMember, saveChannelSettings, setChannelState } from '../actions';
import { SELECT } from '../community-view';
import {
  avatarClass,
  initials,
  num,
  ownerLabel,
  SLOW_OPTIONS,
  slowLabel,
  WHO_LABEL,
  type GroupKind,
  type WhoCanPost,
} from '../labels';

type Visibility = 'public' | 'followers' | 'private';

export interface ChannelDetail {
  group: {
    id: string;
    kind: GroupKind;
    name: string;
    owner_id: string | null;
    owner_name: string | null;
    visibility: Visibility;
    who_can_post: WhoCanPost;
    slow_mode_seconds: number;
    muted_words: string[];
    locked_until: string | null;
    muted_until: string | null;
    member_count: number;
    members_week: number;
    messages_7d: number;
    posters_7d: number;
    open_reports: number;
    oldest_report_at: string | null;
    moderators: string[];
    created_at: string;
  };
  members: {
    user_id: string;
    name: string;
    role: 'owner' | 'moderator' | 'member';
    joined_at: string;
    muted_until: string | null;
    banned_at: string | null;
    messages: number;
  }[];
  flagged: {
    report_id: string;
    message_id: string;
    reason: string;
    sender_name: string | null;
    body: string | null;
    created_at: string;
  }[];
  pins: { message_id: string; body: string | null; sender_name: string; pinned_at: string }[];
}

const REASON: Record<string, string> = {
  spam: 'Spam or scams',
  harassment: 'Harassment or bullying',
  hate: 'Hate speech',
  sexual: 'Sexual content',
  violence: 'Violence or threats',
  self_harm: 'Self-harm',
  copyright: 'Copyright infringement',
  spoilers: 'Spoilers',
  impersonation: 'Impersonation',
  other: 'Something else',
};
const KIND_TITLE: Record<GroupKind, string> = {
  official: 'Official channel',
  club: 'Club',
  author: 'Author channel',
  readalong: 'Read-along',
  room: 'Reading room',
  dm: 'Message',
};
const ROLE: Record<string, string> = { owner: 'Owner', moderator: 'Moderator', member: 'Member' };
/** Lock with no end date: the chat stays locked until staff open it. */
const FOREVER = '9999-12-31T00:00:00Z';
const TZ = 'Africa/Lagos';
const fullDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

/** "12 min", "5 h", "1 day", "3 days". */
function age(iso: string, now = Date.now()) {
  const m = Math.max(1, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

/** "Muted 7 d", "Muted 5 h", "Muted until unmuted". */
function mutedFor(iso: string) {
  if (new Date(iso).getFullYear() > 9000) return 'Muted';
  const h = Math.ceil((new Date(iso).getTime() - Date.now()) / 3_600_000);
  return h >= 24 ? `Muted ${Math.round(h / 24)} d` : `Muted ${Math.max(1, h)} h`;
}

const whoOptions = (kind: GroupKind): WhoCanPost[] =>
  kind === 'author' ? ['members', 'owner_and_followers', 'staff'] : ['members', 'staff'];

/** s-channel. */
export function ChannelView({ detail, failed, canEdit }: { detail: ChannelDetail | null; failed: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState(false);
  const g = detail?.group;
  const [visibility, setVisibility] = useState<Visibility>(g?.visibility ?? 'public');
  const [who, setWho] = useState<WhoCanPost>(g?.who_can_post ?? 'members');
  const [slow, setSlow] = useState(g?.slow_mode_seconds ?? 0);
  const [words, setWords] = useState<string[]>(g?.muted_words ?? []);
  const [adding, setAdding] = useState<string | null>(null);

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

  const flagged = useMemo(() => {
    const by = new Map<string, { first: ChannelDetail['flagged'][number]; reporters: number; oldest: string }>();
    for (const f of detail?.flagged ?? []) {
      const hit = by.get(f.message_id);
      if (!hit) by.set(f.message_id, { first: f, reporters: 1, oldest: f.created_at });
      else {
        hit.reporters++;
        if (f.created_at < hit.oldest) hit.oldest = f.created_at;
      }
    }
    return [...by.values()].sort((a, b) => a.oldest.localeCompare(b.oldest));
  }, [detail]);

  if (failed || !g || !detail)
    return (
      <section className="screen enter">
        <div className="ph">
          <div className="crumbs">
            <Link href="/community">Community</Link>
            <Icon name="chev" />
            <span>Channel</span>
          </div>
        </div>
        <div className="page">
          <div className="panel">
            <div className="empty">
              <b>This channel didn&apos;t load</b>
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

  const now = Date.now();
  const locked = !!g.locked_until && new Date(g.locked_until).getTime() > now;
  const muted = !!g.muted_until && new Date(g.muted_until).getTime() > now;
  const owner = ownerLabel(g.owner_name);
  const ownerFirst = owner.split(' ')[0];

  const run = (p: Promise<{ ok?: boolean; error?: string }>, ok: string, undo?: () => void) =>
    start(async () => {
      const r = await p;
      if (r.ok) showToast(ok, undo);
      else showToast(r.error ?? "That didn't save. Try again.");
      if (r.ok) router.refresh();
    });
  const restore = () => setChannelState(g.id, g.locked_until, g.muted_until);

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/community">Community</Link>
          <Icon name="chev" />
          <span>{g.name}</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>{g.name}</h1>
            <div className="ph__meta">
              <span>{`${KIND_TITLE[g.kind]} · owner ${owner} · created ${fullDate(g.created_at)}`}</span>
              <span>{`${num(g.member_count)} members (+${num(g.members_week)} this week)`}</span>
              <span>{`${num(g.messages_7d)} messages in 7 days · ${num(g.posters_7d)} active posters`}</span>
              <span>
                {g.open_reports > 0
                  ? `${num(g.open_reports)} open ${g.open_reports === 1 ? 'report' : 'reports'}, oldest ${age(g.oldest_report_at ?? g.created_at, now)}`
                  : 'No open reports'}
              </span>
              {locked ? (
                <span className="err-t">
                  {new Date(g.locked_until!).getFullYear() > 9000 ? 'Chat locked' : `Chat locked until ${clock(g.locked_until!)}`}
                </span>
              ) : null}
              {muted ? <span className="warn-t">{`Muted until ${shortDate(g.muted_until!)} ${clock(g.muted_until!)}`}</span> : null}
            </div>
          </div>
          <div className="ph__acts">
            {g.kind === 'author' ? (
              <Link className="btn btn-g" href={`/users?q=${encodeURIComponent(owner)}`}>
                Open author
              </Link>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="btn btn-p"
                disabled={pending}
                aria-busy={pending}
                onClick={() =>
                  run(
                    saveChannelSettings(g.id, { visibility, who_can_post: who, slow_mode_seconds: slow, muted_words: words }),
                    'Settings saved. Change logged.',
                  )
                }
              >
                Save settings
              </button>
            ) : null}
            <div className="mwrap">
              <button type="button" className="ib" aria-expanded={menu} aria-label="More actions" onClick={() => setMenu(m => !m)}>
                <Icon name="more" />
              </button>
              {menu ? (
                <div className="menu">
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(false);
                          run(
                            setChannelState(g.id, locked ? null : FOREVER, g.muted_until),
                            locked ? 'Chat open again.' : `Chat locked. ${ownerFirst} and members see that staff locked it.`,
                            () => run(restore(), 'Undone.'),
                          );
                        }}
                      >
                        {locked ? 'Open chat' : 'Lock chat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(false);
                          run(
                            setChannelState(g.id, g.locked_until, muted ? null : new Date(now + 86_400_000).toISOString()),
                            muted ? 'Channel unmuted.' : 'Channel muted for 24 hours.',
                            () => run(restore(), 'Undone.'),
                          );
                        }}
                      >
                        {muted ? 'Unmute channel' : 'Mute channel for 24 hours'}
                      </button>
                    </>
                  ) : null}
                  <Link href="/reports" onClick={() => setMenu(false)}>
                    Open reports
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel panel--flush">
              <div className="panel__head">
                <h2>Flagged messages</h2>
                <Link className="link" href="/reports">
                  All reports
                </Link>
              </div>
              {flagged.length === 0 ? (
                <div className="empty">
                  <b>No flagged messages</b>
                  <span>Reports from this channel show up here.</span>
                </div>
              ) : (
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Message</th>
                        <th>From</th>
                        <th>Reason</th>
                        <th className="r">Reporters</th>
                        <th className="r">Age</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flagged.map(f => (
                        <tr key={f.first.message_id} data-go="report" tabIndex={0} onClick={() => router.push('/reports')}>
                          <td>
                            <span className="ts-ex">{f.first.body ? `“${f.first.body}”` : 'Message deleted'}</span>
                          </td>
                          <td>
                            <b>{f.first.sender_name ?? 'Deleted user'}</b>
                          </td>
                          <td>{REASON[f.first.reason] ?? f.first.reason}</td>
                          <td className="n">{f.reporters}</td>
                          <td className="n">{age(f.oldest, now)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <details className="fold">
              <summary>
                More details <small>members, pinned messages</small>
              </summary>
              <div className="fold__b">
                <b>{`Members · ${num(g.member_count)}, sorted by role`}</b>
                <div className="tw">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Role</th>
                        <th className="r">Messages</th>
                        <th>Joined</th>
                        <th className="acts"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.members
                        .filter(m => !m.banned_at)
                        .map((m, i) => {
                          const isMuted = !!m.muted_until && new Date(m.muted_until).getTime() > now;
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
                              <td>
                                {ROLE[m.role]}
                                {isMuted ? (
                                  <>
                                    {' · '}
                                    <b className="err-t">{mutedFor(m.muted_until!)}</b>
                                  </>
                                ) : null}
                              </td>
                              <td className="n">{num(m.messages)}</td>
                              <td>{fullDate(m.joined_at)}</td>
                              <td className="acts">
                                {canEdit && m.role !== 'owner' ? (
                                  <button
                                    type="button"
                                    className="btn btn-q sm"
                                    disabled={pending}
                                    onClick={() =>
                                      isMuted
                                        ? run(muteMember(g.id, m.user_id, null), `${m.name} unmuted`, () =>
                                            run(muteMember(g.id, m.user_id, m.muted_until), 'Undone.'),
                                          )
                                        : run(
                                            muteMember(g.id, m.user_id, new Date(now + 86_400_000).toISOString()),
                                            `${m.name} muted for 24 hours`,
                                            () => run(muteMember(g.id, m.user_id, null), 'Undone.'),
                                          )
                                    }
                                  >
                                    {isMuted ? 'Unmute' : 'Mute'}
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <span className="hint">{`Showing ${num(Math.min(detail.members.length, g.member_count))} of ${num(g.member_count)}.`}</span>
                <b>{`Pinned messages · ${detail.pins.length} of 3`}</b>
                {detail.pins.length === 0 ? (
                  <span className="hint">Nothing pinned. The owner and moderators pin from the app.</span>
                ) : (
                  detail.pins.map(p => (
                    <div className="ts-rep" key={p.message_id}>
                      <span className="grow">
                        <b>{p.body ?? 'Message deleted'}</b>
                        <small>{`${p.sender_name} · pinned ${shortDate(p.pinned_at)}`}</small>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Settings</h2>
              </div>
              <div className="panel__body">
                <div className="f">
                  <span className="lbl">Visibility</span>
                  <div className="seg">
                    {(
                      [
                        ['public', 'Public'],
                        ['followers', 'Followers only'],
                        ...(g.visibility === 'private' || g.kind === 'official' ? [['private', 'Invite only']] : []),
                      ] as [Visibility, string][]
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        disabled={!canEdit}
                        className={visibility === v ? 'is-selected' : undefined}
                        onClick={() => setVisibility(v)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="hint">Public channels show in Discover and the book page.</span>
                </div>
                <div className="f">
                  <label htmlFor="ch-who">Who can post</label>
                  <div className="inp sel">
                    <select id="ch-who" value={who} disabled={!canEdit} onChange={e => setWho(e.target.value as WhoCanPost)} style={SELECT}>
                      {whoOptions(g.kind).map(w => (
                        <option key={w} value={w}>
                          {WHO_LABEL[w]}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevd" />
                  </div>
                </div>
                <div className="f">
                  <label htmlFor="ch-slow">Slow mode</label>
                  <div className="inp sel">
                    <select id="ch-slow" value={slow} disabled={!canEdit} onChange={e => setSlow(Number(e.target.value))} style={SELECT}>
                      {SLOW_OPTIONS.map(s => (
                        <option key={s} value={s}>
                          {slowLabel(s)}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevd" />
                  </div>
                </div>
                <div className="f">
                  <label>Muted words in this channel</label>
                  <div className="ts-chips">
                    {words.map(w => (
                      <span
                        key={w}
                        className="ts-pill"
                        role={canEdit ? 'button' : undefined}
                        tabIndex={canEdit ? 0 : undefined}
                        title={canEdit ? 'Remove' : undefined}
                        aria-label={canEdit ? `Remove ${w}` : undefined}
                        onClick={() => canEdit && setWords(ws => ws.filter(x => x !== w))}
                      >
                        {w}
                      </span>
                    ))}
                    {canEdit ? (
                      adding === null ? (
                        <button type="button" className="fchip" onClick={() => setAdding('')}>
                          + Add word
                        </button>
                      ) : (
                        <input
                          className="fchip"
                          autoFocus
                          aria-label="New muted word"
                          value={adding}
                          maxLength={40}
                          onChange={e => setAdding(e.target.value)}
                          onBlur={() => setAdding(null)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setAdding(null);
                            if (e.key !== 'Enter') return;
                            const w = adding.trim().toLowerCase();
                            if (w && !words.includes(w)) {
                              setWords(ws => [...ws, w]);
                              showToast('Word added to this channel. Save settings to keep it.');
                            }
                            setAdding(null);
                          }}
                        />
                      )
                    ) : null}
                  </div>
                  <span className="hint">These add to the global safety rules; they never replace them.</span>
                </div>
                <div className="f">
                  <label>Moderators</label>
                  <div className="ts-chips">
                    {g.moderators.length === 0 ? <span className="hint">None yet</span> : null}
                    {g.moderators.map(m => (
                      <span key={m} className="ts-pill">
                        {m}
                      </span>
                    ))}
                  </div>
                  <span className="hint">{g.kind === 'author' ? 'Chosen by the author. Maximum 5.' : 'Chosen by the owner. Maximum 5.'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {toastNode}
    </section>
  );
}
