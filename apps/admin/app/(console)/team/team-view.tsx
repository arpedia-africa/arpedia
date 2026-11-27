'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import type { StaffRole } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { OfflineNote, useOnline } from '@/components/online';
import { useToast } from '@/components/toast';
import { ROLE_ORDER, roleLabel } from '@/lib/staff-rules';
import { changeRole, inviteStaff, resetTwoStep, setActive } from './actions';

export interface TeamRow {
  kind: 'staff' | 'invite';
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  mfaOn: boolean;
  lastActiveAt: string | null;
  invitedBy: string | null;
  expiresAt: string | null;
  isSelf: boolean;
}

/** The invite form's role cards (s-team-invite). */
const ROLE_HELP: Record<StaffRole, string> = {
  super_admin: 'Everything, including team, prices, payouts and exporting personal details. Keep this to the owners.',
  operations_admin: 'Readers, books, Discover, push and announcements. No money release or team changes.',
  publisher: 'Formats and reviews books, curates Discover. Cannot see readers’ personal details.',
  moderator: 'Reports, community, safety rules, first review of copyright claims.',
  finance: 'Revenue, refunds, author earnings and payouts. Releases need a Super admin as second person.',
  support: 'Support inbox, help articles, reader lookup, small credit grants up to 500.',
  analyst: 'Read-only analytics and exports without personal details.',
};

/** What the new person will see, for the invite's one warning. */
const ROLE_SEES: Record<StaffRole, string> = {
  super_admin: 'everything, including payouts and readers’ personal details',
  operations_admin: 'reader accounts, every book and the push tools',
  publisher: 'every book in the pipeline, including unpublished drafts',
  moderator: 'reports, community posts and readers’ names',
  finance: 'revenue, refunds and authors’ bank details',
  support: 'the support inbox and reader names',
  analyst: 'analytics and exports, without personal details',
};

const AVATAR = ['g', 'o', 'b', 't', 'm', 'k', 'r', 'n'];
/** Avatar colours run down the list in a fixed order, as on s-team. */
const avatarClass = (i: number) => AVATAR[i % AVATAR.length];
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const TZ = 'Africa/Lagos';
const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const time = (d: Date) => d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const dayName = (d: Date) =>
  d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');

/** "Now", "Today, 9:30", "Yesterday, 17:20", "Tue 10 Nov". */
function lastActive(iso: string | null, now: Date) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (now.getTime() - d.getTime() < 2 * 60_000) return 'Now';
  if (day(d) === day(now)) return `Today, ${time(d)}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${time(d)}`;
  return dayName(d);
}

type Filter = 'all' | 'admins' | 'books' | 'setup';
const FILTERS: { key: Filter; label: string; test: (r: TeamRow) => boolean }[] = [
  { key: 'all', label: 'Everyone', test: () => true },
  { key: 'admins', label: 'Super admins and Operations', test: r => r.role === 'super_admin' || r.role === 'operations_admin' },
  { key: 'books', label: 'Publishers and Moderators', test: r => r.role === 'publisher' || r.role === 'moderator' },
  { key: 'setup', label: 'Not set up yet', test: r => !r.mfaOn },
];

type Modal = { kind: 'invite'; prefill?: TeamRow } | { kind: 'role'; row: TeamRow } | null;

/** s-team, with s-team-invite and Change role as overlays. */
export function TeamView({ rows, failed, openInvite }: { rows: TeamRow[]; failed: boolean; openInvite?: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menu, setMenu] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(openInvite ? { kind: 'invite' } : null);
  const [, start] = useTransition();
  const [toastNode, showToast] = useToast();
  const online = useOnline();
  const now = new Date();

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

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          Number(b.isSelf) - Number(a.isSelf) ||
          Number(a.kind === 'invite') - Number(b.kind === 'invite') ||
          ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
          a.name.localeCompare(b.name),
      ),
    [rows],
  );
  const shown = sorted.filter(r => {
    const t = q.trim().toLowerCase();
    return FILTERS.find(f => f.key === filter)!.test(r) && (!t || `${r.name} ${r.email}`.toLowerCase().includes(t));
  });
  const disabled = rows.filter(r => r.kind === 'staff' && !r.active).length;

  const run = (p: () => Promise<{ ok?: boolean; error?: string }>, ok: string, undo?: () => void) => {
    if (!navigator.onLine) return showToast("You're offline. Try again when the connection is back.");
    start(async () => {
      const r = await p();
      if (r.ok) showToast(ok, undo);
      else showToast(r.error ?? "That didn't save. Try again.");
    });
  };

  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>Team and roles</h1>
          </div>
          <div className="band__acts">
            <button type="button" className="btn btn-n" disabled={!online} onClick={() => setModal({ kind: 'invite' })}>
              <Icon name="uplus" />
              Invite staff
            </button>
          </div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <a role="tab" aria-selected="true" className="is-selected">
          Staff <span className="c">{rows.length}</span>
        </a>
        <Link role="tab" aria-selected="false" href="/roles">
          Roles and permissions
        </Link>
      </div>
      <div className="page">
        <OfflineNote online={online} />
        <div className="toolbar">
          <label className="search">
            <Icon name="search" />
            <input placeholder="Name or email" aria-label="Search staff" value={q} onChange={e => setQ(e.target.value)} />
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
        </div>
        <div className="panel panel--flush">
          {failed ? (
            <div className="empty">
              <b>Team didn&apos;t load</b>
              <span>Check your connection and refresh the page.</span>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty">
              <b>Nobody matches</b>
              <span>Try another name, or show everyone.</span>
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
                    <th>Name</th>
                    <th>Role</th>
                    <th>Two-step</th>
                    <th>Last active</th>
                    <th>Status</th>
                    <th className="acts"></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) =>
                    r.kind === 'invite' ? (
                      <tr key={r.id}>
                        <td>
                          <div className="who">
                            <span className="av sm" style={{ background: '#C7CBD1', color: 'var(--ink-2)' }}>
                              ?
                            </span>
                            <span>
                              <b>{r.name}</b>
                              <small>
                                {`${r.email} · invited by ${firstName(r.invitedBy ?? 'a Super admin')}, `}
                                {r.expiresAt && new Date(r.expiresAt) < now
                                  ? 'expired'
                                  : `expires ${r.expiresAt ? `${dayName(new Date(r.expiresAt))} ${time(new Date(r.expiresAt))}` : ''}`}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td>{roleLabel[r.role]}</td>
                        <td>
                          <span className="st st-warn">Not set up</span>
                        </td>
                        <td className="nw muted">Never</td>
                        <td>
                          <span className="st-plain">Invited</span>
                        </td>
                        <td className="acts">
                          <button
                            type="button"
                            className="btn btn-g sm"
                            onClick={() =>
                              run(() => inviteStaff(r.email, r.name, r.role), `Invite sent again to ${r.email}. It expires in 72 hours.`)
                            }
                          >
                            Resend
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={r.id}>
                        <td>
                          <div className="who">
                            <span className={`av sm ${avatarClass(i)}`}>{initials(r.name)}</span>
                            <span>
                              <b>
                                {r.name}
                                {r.isSelf ? (
                                  <>
                                    {' '}
                                    <small style={{ display: 'inline' }}>(you)</small>
                                  </>
                                ) : null}
                              </b>
                              <small>{r.email}</small>
                            </span>
                          </div>
                        </td>
                        <td>{roleLabel[r.role]}</td>
                        <td>{r.mfaOn ? <span className="st-plain">On</span> : <span className="st st-warn">Not set up</span>}</td>
                        <td className={r.lastActiveAt ? 'nw' : 'nw muted'}>{lastActive(r.lastActiveAt, now)}</td>
                        <td>
                          <span className="st-plain">{r.active ? 'Active' : 'Disabled'}</span>
                        </td>
                        <td className="acts">
                          <div className="mwrap">
                            <button
                              type="button"
                              className="ib sm"
                              aria-expanded={menu === r.id}
                              aria-label={`More actions for ${r.name}`}
                              onClick={() => setMenu(m => (m === r.id ? null : r.id))}
                            >
                              <Icon name="more" />
                            </button>
                            {menu === r.id ? (
                              <RowMenu
                                row={r}
                                close={() => setMenu(null)}
                                onRole={() => setModal({ kind: 'role', row: r })}
                                onReset={() =>
                                  run(
                                    () => resetTwoStep(r.id),
                                    r.isSelf
                                      ? 'Two-step reset. You set it up again at your next sign-in.'
                                      : `Two-step reset for ${r.name}. They set it up again at next sign-in.`,
                                  )
                                }
                                onActive={active =>
                                  run(
                                    () => setActive(r.id, active),
                                    active ? `${r.name} can sign in again.` : `${r.name} disabled. Signed out everywhere within 1 minute.`,
                                    active ? undefined : () => run(() => setActive(r.id, true), `${r.name} can sign in again.`),
                                  )
                                }
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <span>{`${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}</span>
            <span>{`${disabled} disabled`}</span>
          </div>
        </div>
      </div>
      {modal?.kind === 'invite' ? (
        <InviteModal
          onClose={() => setModal(null)}
          onSent={email => {
            setModal(null);
            showToast(`Invite sent to ${email}. It expires in 72 hours.`);
          }}
        />
      ) : null}
      {modal?.kind === 'role' ? (
        <RoleModal
          row={modal.row}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            showToast(`Role changed for ${modal.row.name}. The audit log records it.`);
          }}
        />
      ) : null}
      {toastNode}
    </section>
  );
}

function RowMenu({
  row,
  close,
  onRole,
  onReset,
  onActive,
}: {
  row: TeamRow;
  close: () => void;
  onRole: () => void;
  onReset: () => void;
  onActive: (active: boolean) => void;
}) {
  const item = (label: string, fn: () => void, className?: string) => (
    <button
      type="button"
      className={className}
      onClick={() => {
        close();
        fn();
      }}
    >
      {label}
    </button>
  );
  if (row.isSelf)
    return (
      <div className="menu">
        <Link href="/account" onClick={close}>
          Change my details
        </Link>
        {item('Reset my two-step', onReset)}
      </div>
    );
  return (
    <div className="menu">
      {item('Change role', onRole)}
      {item('Reset two-step', onReset)}
      <hr />
      {row.active ? item('Disable account', () => onActive(false), 'danger') : item('Switch account on', () => onActive(true))}
    </div>
  );
}

/** The role cards from s-team-invite, single choice. */
function RoleRadios({ value, onChange }: { value: StaffRole; onChange: (r: StaffRole) => void }) {
  return (
    <div className="radios" role="radiogroup" aria-label="Role">
      {ROLE_ORDER.map(r => (
        <div
          key={r}
          className={value === r ? 'radio is-selected' : 'radio'}
          role="radio"
          aria-checked={value === r}
          tabIndex={value === r ? 0 : -1}
          onClick={() => onChange(r)}
          onKeyDown={e => {
            const i = ROLE_ORDER.indexOf(value);
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') onChange(ROLE_ORDER[(i + 1) % ROLE_ORDER.length]!);
            else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') onChange(ROLE_ORDER[(i + ROLE_ORDER.length - 1) % ROLE_ORDER.length]!);
            else return;
            e.preventDefault();
          }}
        >
          <span>
            <b>{roleLabel[r]}</b>
            <small>{ROLE_HELP[r]}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function Overlay({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
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
      <div className="modal wide" role="dialog" aria-label={label}>
        {children}
      </div>
    </section>
  );
}

/** s-team-invite. */
function InviteModal({ onClose, onSent }: { onClose: () => void; onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('support');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const online = useOnline();
  const who = firstName(name.trim()) || 'They';
  return (
    <Overlay label="Invite staff" onClose={onClose}>
      <div className="modal__h">
        <div className="grow">
          <h2>Invite staff</h2>
          <p>They get an email with a link to create their password and set up two-step.</p>
        </div>
        <button type="button" className="ib" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="modal__b">
        <div className="fgrid">
          <div className="f">
            <label htmlFor="iv-e">Work email</label>
            <div className={error && /email|team/.test(error) ? 'inp error' : 'inp'}>
              <input id="iv-e" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" autoFocus />
            </div>
          </div>
          <div className="f">
            <label htmlFor="iv-n">Full name</label>
            <div className={error && /name/.test(error) ? 'inp error' : 'inp'}>
              <input id="iv-n" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
            </div>
          </div>
        </div>
        <div className="f">
          <span className="lbl">Role</span>
          <RoleRadios value={role} onChange={setRole} />
        </div>
        <div className="kv-row">
          <span>Invite link expires after</span>
          <b>72 hours</b>
        </div>
        <div className="note warn">
          <span className="grow">
            <b>{`${who} will see ${ROLE_SEES[role]}`}</b>Make sure this is the right role. You can change it later in Team and roles.
          </span>
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
          disabled={pending || !online}
          aria-busy={pending}
          onClick={() =>
            start(async () => {
              const r = await inviteStaff(email, name, role);
              if (r.ok) onSent(email.trim().toLowerCase());
              else setError(r.error);
            })
          }
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </Overlay>
  );
}

/** Change role: the invite form's role cards in the same modal. */
function RoleModal({ row, onClose, onSaved }: { row: TeamRow; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState<StaffRole>(row.role);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const online = useOnline();
  return (
    <Overlay label="Change role" onClose={onClose}>
      <div className="modal__h">
        <div className="grow">
          <h2>Change role</h2>
          <p>{`${row.name} gets the new role on their next request.`}</p>
        </div>
        <button type="button" className="ib" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="modal__b">
        <div className="f">
          <span className="lbl">Role</span>
          <RoleRadios value={role} onChange={setRole} />
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
          disabled={pending || !online || role === row.role}
          aria-busy={pending}
          onClick={() =>
            start(async () => {
              const r = await changeRole(row.id, role);
              if (r.ok) onSaved();
              else setError(r.error);
            })
          }
        >
          {pending ? 'Saving…' : 'Save role'}
        </button>
      </div>
    </Overlay>
  );
}
