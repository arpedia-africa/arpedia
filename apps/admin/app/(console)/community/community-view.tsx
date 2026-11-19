'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { createOfficialChannel } from './actions';
import { KIND_LABEL, num, ownerLabel, postingLine, WHO_LABEL, type GroupKind, type WhoCanPost } from './labels';

export interface ChannelRow {
  id: string;
  kind: GroupKind;
  name: string;
  ownerName: string | null;
  whoCanPost: WhoCanPost;
  slowMode: number;
  members: number;
  messages7d: number;
  openReports: number;
  status: 'active' | 'quiet' | 'locked';
}

export interface CommunityStats {
  channels: number;
  official: number;
  author: number;
  rooms_live: number;
  rooms_readers: number;
  messages_today: number;
  messages_last_week: number;
  muted: number;
  muted_ending_week: number;
}

type KindFilter = 'all' | 'official' | 'club' | 'author' | 'readalong';
type StatusFilter = 'all' | 'active' | 'quiet' | 'locked';
const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'official', label: 'Official' },
  { key: 'author', label: 'Author' },
  { key: 'club', label: 'Club' },
  { key: 'readalong', label: 'Read-along' },
];
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Any status' },
  { key: 'active', label: 'Active' },
  { key: 'quiet', label: 'Quiet' },
  { key: 'locked', label: 'Chat locked' },
];

const lastWeekday = () => new Date(Date.now() - 7 * 86_400_000).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Africa/Lagos' });

/** s-community. */
export function CommunityView({
  rows,
  stats,
  failed,
  canEdit,
}: {
  rows: ChannelRow[];
  stats: CommunityStats | null;
  failed: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [reportsOnly, setReportsOnly] = useState(false);
  const [menu, setMenu] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const t = q.trim().toLowerCase();
  const shown = rows.filter(
    r =>
      (kind === 'all' || r.kind === kind) &&
      (status === 'all' || r.status === status) &&
      (!reportsOnly || r.openReports > 0) &&
      (!t || `${r.name} ${ownerLabel(r.ownerName)}`.toLowerCase().includes(t)),
  );
  const filtered = kind !== 'all' || status !== 'all' || reportsOnly;
  const soon = () => showToast('Reading rooms arrive with a later part of the build.');

  const today = stats?.messages_today ?? 0;
  const base = stats?.messages_last_week ?? 0;
  const change = base > 0 ? Math.round(((today - base) / base) * 100) : null;

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Community</h1>
          </div>
          <div className="band__acts">
            {canEdit ? (
              <button type="button" className="btn btn-n" onClick={() => setCreating(true)}>
                <Icon name="plus" />
                Create official channel
              </button>
            ) : null}
            <a className="ib" href="/reports" aria-label="Reports">
              <Icon name="flag" />
            </a>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <a role="tab" aria-selected="true" className="is-selected">
          Channels <span className="c">{num(rows.length)}</span>
        </a>
        <a
          role="tab"
          aria-selected="false"
          href="#rooms"
          onClick={e => {
            e.preventDefault();
            soon();
          }}
        >
          Reading rooms <span className="c">{`${num(stats?.rooms_live ?? 0)} live`}</span>
        </a>
      </div>
      <div className="page">
        <div className="kpis">
          <div className="kpi">
            <span className="kpi__l">Channels</span>
            <span className="kpi__v">{num(stats?.channels ?? rows.length)}</span>
            <span className="kpi__d">{`${num(stats?.official ?? 0)} official · ${num(stats?.author ?? 0)} author`}</span>
          </div>
          <a
            className="kpi"
            href="#rooms"
            onClick={e => {
              e.preventDefault();
              soon();
            }}
          >
            <span className="kpi__l">Reading rooms live now</span>
            <span className="kpi__v">{num(stats?.rooms_live ?? 0)}</span>
            <span className="kpi__d">{`${num(stats?.rooms_readers ?? 0)} readers inside`}</span>
          </a>
          <div className="kpi">
            <span className="kpi__l">Messages today</span>
            <span className="kpi__v">{num(today)}</span>
            <span className="kpi__d">
              {change === null ? (
                `${num(base)} last ${lastWeekday()}`
              ) : (
                <>
                  <span className={change >= 0 ? 'up' : 'down'}>{`${change >= 0 ? '+' : '−'}${Math.abs(change)}%`}</span>
                  {` vs last ${lastWeekday()}`}
                </>
              )}
            </span>
          </div>
          <a className="kpi" href="/reports">
            <span className="kpi__l">Members muted</span>
            <span className="kpi__v">{num(stats?.muted ?? 0)}</span>
            <span className="kpi__d">{`${num(stats?.muted_ending_week ?? 0)} expire this week`}</span>
          </a>
        </div>
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input placeholder="Channel or owner" aria-label="Search channels" value={q} onChange={e => setQ(e.target.value)} />
          </label>
          <div className="mwrap">
            <button type="button" className="fbtn" aria-expanded={menu} onClick={() => setMenu(m => !m)}>
              <Icon name="filter" />
              Filters
            </button>
            {menu ? (
              <div className="menu sy-menul">
                {KIND_FILTERS.map(f => (
                  <a
                    key={f.key}
                    href={`#${f.key}`}
                    aria-current={kind === f.key ? 'true' : undefined}
                    onClick={e => {
                      e.preventDefault();
                      setKind(f.key);
                    }}
                  >
                    {f.label}
                  </a>
                ))}
                <hr />
                {STATUS_FILTERS.map(f => (
                  <a
                    key={f.key}
                    href={`#${f.key}`}
                    aria-current={status === f.key ? 'true' : undefined}
                    onClick={e => {
                      e.preventDefault();
                      setStatus(f.key);
                    }}
                  >
                    {f.label}
                  </a>
                ))}
                <hr />
                <a
                  href="#reports"
                  aria-current={reportsOnly ? 'true' : undefined}
                  onClick={e => {
                    e.preventDefault();
                    setReportsOnly(v => !v);
                  }}
                >
                  With open reports
                </a>
              </div>
            ) : null}
          </div>
        </div>
        <div className="panel panel--flush">
          {failed ? (
            <div className="empty">
              <b>Channels didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <b>No channels yet</b>
              <span>Author channels appear here when an author is approved.</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">
              <b>Nothing matches</b>
              <span>Try another name, or show every channel.</span>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-g"
                  onClick={() => (setQ(''), setKind('all'), setStatus('all'), setReportsOnly(false))}
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : (
            <div className="tw">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Type</th>
                    <th className="r">Members</th>
                    <th className="r">Messages, 7 days</th>
                    <th className="r">Open reports</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => (
                    <tr
                      key={r.id}
                      data-go="channel"
                      tabIndex={0}
                      onClick={() => router.push(`/community/${r.id}`)}
                      onKeyDown={e => e.key === 'Enter' && router.push(`/community/${r.id}`)}
                    >
                      <td>
                        <b>{r.name}</b>
                        <br />
                        <small className="faint">{`${ownerLabel(r.ownerName)} · ${postingLine(r.whoCanPost, r.slowMode)}`}</small>
                      </td>
                      <td>{KIND_LABEL[r.kind]}</td>
                      <td className="n">{num(r.members)}</td>
                      <td className="n">{num(r.messages7d)}</td>
                      <td className="n">{r.openReports > 1 ? <b className="warn-t">{r.openReports}</b> : r.openReports}</td>
                      <td>
                        {r.status === 'locked' ? (
                          <span className="st st-warn">Chat locked</span>
                        ) : r.status === 'quiet' ? (
                          'Quiet'
                        ) : (
                          'Active'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{`Showing ${num(shown.length)} of ${num(rows.length)} channels${filtered || t ? '' : ' · most active first'}`}</span>
            <span>Author channels are created automatically on approval</span>
          </div>
        </div>
      </div>
      {creating ? (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={id => {
            setCreating(false);
            showToast('Official channel created. Staff only post until you change it.');
            router.push(`/community/${id}`);
          }}
        />
      ) : null}
      {toastNode}
    </section>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [who, setWho] = useState<WhoCanPost>('staff');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
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
      <div className="modal" role="dialog" aria-label="Create official channel">
        <div className="modal__h">
          <div className="grow">
            <h2>Create official channel</h2>
            <p>Announcements, regional and faith groups run by the Arpedia team.</p>
          </div>
          <button type="button" className="ib" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__b">
          <div className="f">
            <label htmlFor="oc-n">Name</label>
            <div className={error && /name/.test(error) ? 'inp error' : 'inp'}>
              <input id="oc-n" value={name} maxLength={60} onChange={e => setName(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="f">
            <label htmlFor="oc-d">Description</label>
            <div className="inp">
              <input id="oc-d" value={description} maxLength={500} onChange={e => setDescription(e.target.value)} />
            </div>
            <span className="hint">Shows on the Discover card, two lines.</span>
          </div>
          <div className="f">
            <label htmlFor="oc-w">Who can post</label>
            <div className="inp sel">
              <select id="oc-w" value={who} onChange={e => setWho(e.target.value as WhoCanPost)} style={SELECT}>
                <option value="staff">{WHO_LABEL.staff}</option>
                <option value="members">{WHO_LABEL.members}</option>
              </select>
              <Icon name="chevd" />
            </div>
          </div>
          <div className="f">
            <span className="lbl">Visibility</span>
            <div className="seg">
              <button type="button" className={visibility === 'public' ? 'is-selected' : undefined} onClick={() => setVisibility('public')}>
                Public
              </button>
              <button type="button" className={visibility === 'private' ? 'is-selected' : undefined} onClick={() => setVisibility('private')}>
                Invite only
              </button>
            </div>
            <span className="hint">Public channels show in Discover.</span>
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
            disabled={pending || name.trim().length < 3}
            aria-busy={pending}
            onClick={() =>
              start(async () => {
                const r = await createOfficialChannel(name, description, who, visibility);
                if (r.ok && r.id) onCreated(r.id);
                else setError(r.error);
              })
            }
          >
            {pending ? 'Creating…' : 'Create channel'}
          </button>
        </div>
      </div>
    </section>
  );
}

/** A native select inside the prototype's `.inp.sel` box, keeping the box's look. */
export const SELECT: React.CSSProperties = {
  appearance: 'none',
  border: 0,
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  flex: 1,
  minWidth: 0,
  height: '100%',
  outline: 'none',
  cursor: 'pointer',
};
