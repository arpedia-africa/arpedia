'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { OfflineNote, useOnline } from '@/components/online';
import { useToast } from '@/components/toast';
import { Otp } from '../pricing/otp';
import {
  changePassword,
  finishNewAuthenticator,
  regenerateCodes,
  saveProfile,
  setAlert,
  signOutSessions,
  startNewAuthenticator,
} from './actions';

interface Session {
  id: string;
  created_at: string;
  refreshed_at: string | null;
  user_agent: string | null;
  ip: string | null;
  current: boolean;
}

export interface Account {
  name: string | null;
  email: string;
  phone: string | null;
  role: string;
  mfa_enrolled_at: string | null;
  backup_codes_left: number;
  alerts: Record<string, boolean>;
  sessions: Session[];
}

const ALERTS: { kind: string; label: string }[] = [
  { kind: 'high_severity_reports', label: 'High-severity reports' },
  { kind: 'failed_payouts', label: 'Failed payouts' },
  { kind: 'copyright_claims', label: 'Copyright claims' },
  { kind: 'applications_waiting', label: 'Applications waiting too long' },
  { kind: 'system_health', label: 'System health' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]!.toUpperCase())
    .join('') || '?';

const AVATARS = ['g', 'm', 'b', 'o', 't', 'r', 'k'];
/** The prototype's avatar colours, fixed per person (same hash as lib/money). */
function avClass(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lagos = (iso: string) => new Date(new Date(iso).getTime() + 3_600_000);
const hm = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

/** "active now", "last active 14:02", "last active yesterday 21:14", "last active 12 Nov 21:14". */
function lastActive(iso: string | null, now: number): string {
  if (!iso) return 'not used yet';
  const at = new Date(iso).getTime();
  if (now - at < 5 * 60_000) return 'active now';
  const d = lagos(iso);
  const today = lagos(new Date(now).toISOString());
  const yesterday = lagos(new Date(now - 86_400_000).toISOString());
  if (dayKey(d) === dayKey(today)) return `last active ${hm(d)}`;
  if (dayKey(d) === dayKey(yesterday)) return `last active yesterday ${hm(d)}`;
  return `last active ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hm(d)}`;
}

/** "Chrome on Windows 11" from a user agent; good enough to tell sessions apart. */
function device(ua: string | null): string {
  if (!ua) return 'Unknown browser';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /node|undici|supabase/i.test(ua)
              ? 'Script'
              : 'Browser';
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows NT 10/.test(ua)
          ? 'Windows'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Mac OS X/.test(ua)
              ? 'Mac'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  return os ? `${browser} on ${os}` : browser;
}

const dayMonthYear = (iso: string) => {
  const d = lagos(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** "803 555 0142" from "+2348035550142". */
const localPhone = (p: string | null) => {
  const d = (p ?? '').replace(/^\+?234/, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
};

type Modal = { kind: 'codes'; codes: string[] } | { kind: 'phone'; id: string; qr: string; secret: string } | null;

/** s-account below the band: profile, two-step, sessions, alerts and the folded password change. */
export function AccountView({
  account,
  id,
  roleName,
  mustKeepTwoStep,
}: {
  account: Account;
  id: string;
  roleName: string;
  mustKeepTwoStep: boolean;
}) {
  const router = useRouter();
  const online = useOnline();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const [name, setName] = useState(account.name ?? '');
  const [phone, setPhone] = useState(localPhone(account.phone));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [otp, setOtp] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', repeat: '' });
  const [pwError, setPwError] = useState<string | null>(null);

  const current = account.sessions.find(s => s.current);
  const others = account.sessions.filter(s => !s.current);
  const since = current ? hm(lagos(current.created_at)) : null;
  const displayName = account.name || account.email;

  const save = () =>
    start(async () => {
      setProfileError(null);
      const r = await saveProfile(name, phone);
      if (!r.ok) return setProfileError(r.error);
      show('Profile saved');
      router.refresh();
    });

  const toggleAlert = (kind: string, label: string, on: boolean) =>
    start(async () => {
      const r = await setAlert(kind, !on);
      show(r.ok ? `${label} ${on ? 'off' : 'on'}` : r.error);
      router.refresh();
    });

  const signOutOne = (s: Session) =>
    start(async () => {
      const r = await signOutSessions(s.id);
      show(r.ok ? `${device(s.user_agent)} signed out` : r.error);
      router.refresh();
    });

  const signOutOthers = () =>
    start(async () => {
      const r = await signOutSessions();
      show(
        r.ok
          ? r.count
            ? 'Signed out of all other sessions'
            : 'No other sessions were signed in'
          : r.error,
      );
      router.refresh();
    });

  const newCodes = () =>
    start(async () => {
      const r = await regenerateCodes();
      if (!r.ok) return show(r.error);
      setModal({ kind: 'codes', codes: r.codes });
      router.refresh();
    });

  const changePhone = () =>
    start(async () => {
      setOtp('');
      setModalError(null);
      const r = await startNewAuthenticator();
      if ('error' in r) return show(r.error);
      setModal({ kind: 'phone', ...r });
    });

  const confirmPhone = () =>
    start(async () => {
      if (modal?.kind !== 'phone') return;
      const r = await finishNewAuthenticator(modal.id, otp);
      setOtp('');
      if (!r.ok) return setModalError(r.error);
      setModal(null);
      show('New authenticator set up. Your old phone no longer works for codes.');
      router.refresh();
    });

  const updatePassword = () =>
    start(async () => {
      setPwError(null);
      const r = await changePassword(pw.current, pw.next, pw.repeat);
      if (!r.ok) return setPwError(r.error);
      setPw({ current: '', next: '', repeat: '' });
      show('Password updated. Other sessions were signed out.');
      router.refresh();
    });

  const off = pending || !online;

  return (
    <>
      <div className="page page--narrow">
        <OfflineNote online={online} />
        <div className="panel">
          <div className="panel__head">
            <h2>Profile</h2>
          </div>
          <div className="panel__body">
            <div className="row" style={{ gap: 14 }}>
              <span className={`av lg ${avClass(id)}`}>{initials(displayName)}</span>
              <span className="stack s4" style={{ minWidth: 0 }}>
                <b style={{ fontSize: 16 }}>{displayName}</b>
                <span className="muted">{account.email}</span>
              </span>
              <span className="grow" />
              <span className="muted nw">{since ? `${roleName} · signed in since ${since}` : roleName}</span>
            </div>
            <div className="fgrid">
              <div className="f">
                <label htmlFor="acc-name">Full name</label>
                <div className="inp">
                  <input id="acc-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-label="Full name" />
                </div>
              </div>
              <div className="f">
                <label>Work email</label>
                <div className="inp ro">
                  <input value={account.email} readOnly aria-label="Work email" />
                </div>
              </div>
              <div className="f">
                <label htmlFor="acc-phone">
                  Phone for urgent alerts <span className="opt">optional</span>
                </label>
                <div className="inp">
                  <span className="pre">+234</span>
                  <input
                    id="acc-phone"
                    value={phone}
                    inputMode="tel"
                    maxLength={14}
                    placeholder="803 555 0142"
                    onChange={e => setPhone(e.target.value)}
                    aria-label="Phone"
                  />
                </div>
              </div>
              <div className="f">
                <label>Role</label>
                <div className="inp ro">
                  <input value={roleName} readOnly aria-label="Role" />
                </div>
              </div>
            </div>
            {profileError && <span className="hint err-t">{profileError}</span>}
            <div>
              <button className="btn btn-g" type="button" disabled={off} onClick={save}>
                Save profile
              </button>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel__head">
            <h2>Two-step sign-in</h2>
            <span className="st-plain">{account.mfa_enrolled_at ? 'On' : 'Not set up'}</span>
          </div>
          <div className="list">
            <div className="setrow">
              <span className="setrow__b">
                <b>Authenticator app</b>
                <small>{account.mfa_enrolled_at ? `Set up on ${dayMonthYear(account.mfa_enrolled_at)}` : 'Not set up yet'}</small>
              </span>
              <button className="btn btn-g sm" type="button" disabled={off} onClick={changePhone}>
                Change phone
              </button>
            </div>
            <div className="setrow">
              <span className="setrow__b">
                <b>Backup codes</b>
                <small>{`${account.backup_codes_left} of 10 left, each works once`}</small>
              </span>
              <button className="btn btn-g sm" type="button" disabled={off} onClick={newCodes}>
                Regenerate codes
              </button>
            </div>
          </div>
          <div className="panel__foot">
            <span>
              {mustKeepTwoStep
                ? 'Super admins and Finance cannot turn two-step off.'
                : 'Two-step stays on for every staff account.'}
            </span>
          </div>
        </div>
        <div className="panel">
          <div className="panel__head">
            <h2>Active sessions</h2>
          </div>
          <div className="list">
            {[...(current ? [current] : []), ...others].map(s => (
              <div className="setrow" key={s.id}>
                <span className="setrow__b">
                  <b>
                    {device(s.user_agent)}
                    {s.current && (
                      <span className="st-plain" style={{ marginLeft: 6 }}>
                        This browser
                      </span>
                    )}
                  </b>
                  <small>
                    {s.ip && (
                      <>
                        <span className="mono">{s.ip}</span>
                        {' · '}
                      </>
                    )}
                    {s.current ? 'active now' : lastActive(s.refreshed_at ?? s.created_at, now)}
                  </small>
                </span>
                {!s.current && (
                  <button className="btn btn-d sm" type="button" disabled={off} onClick={() => signOutOne(s)}>
                    Sign out
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="panel__foot">
            {others.length ? (
              <a
                className="link"
                role="button"
                tabIndex={0}
                aria-disabled={off}
                onClick={() => !off && signOutOthers()}
                onKeyDown={e => e.key === 'Enter' && !off && signOutOthers()}
              >
                Sign out of all other sessions
              </a>
            ) : (
              <span>No other sessions are signed in.</span>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel__head">
            <h2>Alerts I get</h2>
            <span className="sub">Bell, and email for urgent ones</span>
          </div>
          <div className="list">
            {ALERTS.map(a => {
              const on = account.alerts[a.kind] ?? true;
              const locked = a.kind === 'high_severity_reports';
              return (
                <div className="setrow" key={a.kind}>
                  <span className="setrow__b">
                    <b>{a.label}</b>
                    {locked && <small>Always on</small>}
                  </span>
                  <button
                    className={on ? 'switch on' : 'switch'}
                    role="switch"
                    type="button"
                    aria-checked={on}
                    aria-label={a.label}
                    disabled={locked || off}
                    onClick={() => toggleAlert(a.kind, a.label, on)}
                  ></button>
                </div>
              );
            })}
          </div>
        </div>
        <details className="fold">
          <summary>
            Change password <small>signs you out of other sessions</small>
          </summary>
          <div className="fold__b">
            <form
              className="form"
              onSubmit={e => {
                e.preventDefault();
                updatePassword();
              }}
            >
              <div className="f">
                <label htmlFor="pw-cur">Current password</label>
                <div className="inp">
                  <input
                    id="pw-cur"
                    type="password"
                    autoComplete="current-password"
                    value={pw.current}
                    onChange={e => setPw({ ...pw, current: e.target.value })}
                    aria-label="Current password"
                  />
                </div>
              </div>
              <div className="fgrid">
                <div className="f">
                  <label htmlFor="pw-new">New password</label>
                  <div className="inp">
                    <input
                      id="pw-new"
                      type="password"
                      autoComplete="new-password"
                      value={pw.next}
                      placeholder="At least 12 characters"
                      onChange={e => setPw({ ...pw, next: e.target.value })}
                      aria-label="New password"
                    />
                  </div>
                </div>
                <div className="f">
                  <label htmlFor="pw-rep">Repeat new password</label>
                  <div className="inp">
                    <input
                      id="pw-rep"
                      type="password"
                      autoComplete="new-password"
                      value={pw.repeat}
                      onChange={e => setPw({ ...pw, repeat: e.target.value })}
                      aria-label="Repeat password"
                    />
                  </div>
                </div>
              </div>
              {pwError && <span className="hint err-t">{pwError}</span>}
              <div>
                <button className="btn btn-p" type="submit" disabled={off || !pw.current || !pw.next}>
                  {pending ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </details>
      </div>
      {toast}
      {modal?.kind === 'codes' && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => setModal(null)}></a>
          <div className="modal" role="dialog" aria-label="New backup codes">
            <div className="modal__h">
              <div className="grow">
                <h2>10 new backup codes</h2>
                <p>Your old codes stopped working</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => setModal(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <span className="muted">Save these somewhere safe. Each works once, and they are shown only now.</span>
              <div className="fgrid">
                {modal.codes.map(c => (
                  <span className="mono" key={c}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="modal__f">
              <button
                className="btn btn-g"
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(modal.codes.join('\n'));
                  show('Codes copied');
                }}
              >
                Copy codes
              </button>
              <button className="btn btn-p" type="button" onClick={() => setModal(null)}>
                I saved them
              </button>
            </div>
          </div>
        </section>
      )}
      {modal?.kind === 'phone' && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => !pending && setModal(null)}></a>
          <div className="modal" role="dialog" aria-label="Change phone">
            <div className="modal__h">
              <div className="grow">
                <h2>Set up your new phone</h2>
                <p>Your current phone keeps working until you confirm</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => !pending && setModal(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <span className="muted">Scan this in your authenticator app on the new phone, then enter the code it shows.</span>
              <img src={modal.qr} alt="Two-step setup QR code" width={160} height={160} />
              <span className="mono">{modal.secret}</span>
              <div className="f">
                <span className="lbl">Code from the new phone</span>
                <Otp value={otp} onChange={setOtp} invalid={!!modalError} />
                {modalError && <span className="hint">{modalError}</span>}
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn btn-p" type="button" disabled={off || otp.length !== 6} onClick={confirmPhone}>
                {pending ? 'Checking…' : 'Use this phone'}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
