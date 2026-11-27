'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { isVersion } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { OfflineNote, useOnline } from '@/components/online';
import { useToast } from '@/components/toast';
import { rollbackOta, saveConfig, saveCopy, saveFlag, saveFlagSettings } from './actions';

interface Stamp {
  updated_at: string | null;
  updated_by: string | null;
}
interface Flag extends Stamp {
  key: string;
  label: string;
  group: 'community' | 'money' | 'app';
  note: string | null;
  enabled: boolean;
  rollout_percent: number;
  min_app_version: string | null;
  warning: string | null;
}
interface Copy extends Stamp {
  key: string;
  text: string;
  required_placeholders: string[];
}
interface Ota {
  channel?: string;
  server?: string;
  current?: string | null;
  previous?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  reach_pct?: number | null;
}
export interface ConfigScreen {
  can_edit: boolean;
  config: Record<string, ({ value: unknown } & Stamp) | undefined>;
  flags: Flag[];
  copy: Copy[];
}

const GROUPS: [Flag['group'], string][] = [
  ['community', 'Community'],
  ['money', 'Money'],
  ['app', 'App'],
];

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }) : '';
const stamp = (s: Stamp) => [s.updated_by, day(s.updated_at)].filter(Boolean).join(' · ') || '–';
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  });

type Ask = { kind: 'maintenance' } | { kind: 'force_update' } | { kind: 'ota' };

/**
 * s-config and s-config-confirm. Super admins change everything (force update, maintenance and OTA
 * rollback ask for a fresh 2-step code); Operations admins edit Remote copy and see the rest read-only.
 */
export function ConfigView({ screen, env }: { screen: ConfigScreen; env: string }) {
  const router = useRouter();
  const online = useOnline();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const edit = screen.can_edit && online;
  const val = <T,>(k: string, d: T) => (screen.config[k]?.value ?? d) as T;

  const [minAndroid, setMinAndroid] = useState(val('android_min_version', ''));
  const [minIos, setMinIos] = useState(val('ios_min_version', ''));
  const maintenance = val<{ on: boolean; message: string }>('maintenance', { on: false, message: '' });
  const [message, setMessage] = useState(maintenance.message);
  const force = val('force_update', false);
  const ota = val<Ota>('ota', {});
  const [ask, setAsk] = useState<Ask | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copyKey, setCopyKey] = useState<string | null>(null);
  const [copyText, setCopyText] = useState('');
  const [copyError, setCopyError] = useState<string | null>(null);
  const [verError, setVerError] = useState<{ key: string; text: string } | null>(null);
  const [flagKey, setFlagKey] = useState<string | null>(null);
  const [rollout, setRollout] = useState('');
  const [flagVersion, setFlagVersion] = useState('');
  const [flagError, setFlagError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string, undo?: () => void) =>
    start(async () => {
      const r = await fn();
      show(r.ok ? done : r.error, r.ok ? undo : undefined);
      router.refresh();
    });

  const saveVersion = (key: 'android_min_version' | 'ios_min_version', v: string, label: string) => {
    const before = val(key, '');
    if (v.trim() === before) return;
    if (!isVersion(v)) return setVerError({ key, text: 'Use a version like 25.4 (major.minor).' });
    setVerError(null);
    run(() => saveConfig(key, v.trim()), `Minimum ${label} version is ${v.trim()}. It is in the audit log.`);
  };

  const confirm = () =>
    start(async () => {
      if (!ask) return;
      setError(null);
      const r =
        ask.kind === 'maintenance'
          ? await saveConfig('maintenance', { on: true, message }, code)
          : ask.kind === 'force_update'
            ? await saveConfig('force_update', true, code)
            : await rollbackOta(code);
      if (!r.ok) {
        setError(r.error);
        if (r.needCode) setCode('');
        return;
      }
      setAsk(null);
      setCode('');
      show(
        ask.kind === 'maintenance'
          ? 'Maintenance mode is on. All readers see your message. Turn it off here when you are done.'
          : ask.kind === 'force_update'
            ? 'Force update is on. Readers below the minimum must update before they can read. Tell Support.'
            : 'Rolled back to the previous bundle. Phones switch within about 10 minutes, the next time the app opens.',
      );
      router.refresh();
    });

  const open = (a: Ask) => {
    setError(null);
    setCode('');
    setAsk(a);
  };

  const flagRow = (f: Flag) => (
    <tr key={f.key}>
      <td>
        <b>{f.label}</b>
        {f.warning ? (
          <small className="warn-t">{f.warning}</small>
        ) : f.min_app_version ? (
          <small className="faint" style={{ display: 'block' }}>{`Needs app ${f.min_app_version} or newer`}</small>
        ) : (
          f.note && <small className="faint" style={{ display: 'block' }}>{f.note}</small>
        )}
      </td>
      <td>
        {flagKey === f.key ? (
          <div className="stack s4">
            <div className="row" style={{ gap: 8 }}>
              <div className="f grow">
                <div className="inp">
                  <input
                    value={rollout}
                    inputMode="numeric"
                    maxLength={3}
                    autoFocus
                    onChange={e => setRollout(e.target.value.replace(/[^0-9]/g, ''))}
                    aria-label={`${f.label} rollout percent`}
                  />
                </div>
              </div>
              <b className="num">%</b>
              <div className="f grow">
                <div className="inp">
                  <input
                    value={flagVersion}
                    inputMode="decimal"
                    placeholder="Any version"
                    onChange={e => setFlagVersion(e.target.value)}
                    aria-label={`${f.label} minimum app version`}
                  />
                </div>
              </div>
            </div>
            <span className={flagError ? 'hint err-t' : 'hint'}>
              {flagError ?? 'Rollout 0 to 100%, and the oldest app version that gets it (empty for any).'}
            </span>
          </div>
        ) : (
        <div className="row" style={{ gap: 8 }}>
          <div className="meter grow">
            <i
              className={f.enabled && f.rollout_percent === 100 ? 'ok' : undefined}
              style={{ '--v': `${f.enabled ? f.rollout_percent : 0}%` } as React.CSSProperties}
            ></i>
          </div>
          <b className="num">{`${f.rollout_percent}%`}</b>
        </div>
        )}
      </td>
      <td className="nw">{stamp(f)}</td>
      <td>
        <span className="row" style={{ gap: 10 }}>
          <span className="st-plain">{f.enabled ? 'On' : 'Off'}</span>
          {screen.can_edit && flagKey === f.key && (
            <>
              <button className="btn btn-g sm" type="button" disabled={pending} onClick={() => setFlagKey(null)}>
                Cancel
              </button>
              <button
                className="btn btn-p sm"
                type="button"
                disabled={pending || !online || rollout === ''}
                onClick={() =>
                  start(async () => {
                    const r = await saveFlagSettings(f.key, f.enabled, Number(rollout), flagVersion);
                    if (!r.ok) return setFlagError(r.error);
                    setFlagKey(null);
                    show(`${f.label} now reaches ${Number(rollout)}% of readers${flagVersion.trim() ? ` on app ${flagVersion.trim()} or newer` : ''}. It is in the audit log.`);
                    router.refresh();
                  })
                }
              >
                Save
              </button>
            </>
          )}
          {screen.can_edit && flagKey !== f.key && (
            <button
              className="btn btn-g sm"
              type="button"
              disabled={pending || !online}
              onClick={() => {
                setFlagKey(f.key);
                setRollout(String(f.rollout_percent));
                setFlagVersion(f.min_app_version ?? '');
                setFlagError(null);
              }}
            >
              Edit
            </button>
          )}
          {screen.can_edit && flagKey !== f.key && (
            <button
              className="btn btn-q sm"
              type="button"
              disabled={pending || !online}
              onClick={() =>
                run(
                  () => saveFlag(f.key, !f.enabled),
                  f.enabled
                    ? `${f.label} is off for everyone. It is in the audit log.`
                    : `${f.label} is on again. It is in the audit log.`,
                  () => run(() => saveFlag(f.key, f.enabled), `${f.label} is back as it was.`),
                )
              }
            >
              {f.enabled ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </span>
      </td>
    </tr>
  );

  return (
    <>
      <section className="screen enter">
        <div className="band">
          <div className="band__row">
            <div className="band__text">
              <h1>App configuration</h1>
            </div>
            <div className="band__acts">
              <span className="st-plain">{env}</span>
            </div>
          </div>
        </div>
        <div className="page">
          <OfflineNote online={online} />
          {!screen.can_edit && (
            <div className="note">
              <span className="grow">
                <b>You can edit Remote copy</b>Versions, force update, maintenance mode and flags are Super admin only.
              </span>
            </div>
          )}
          <div className="g2 grid">
            <div className="panel">
              <div className="panel__head">
                <h2>App versions</h2>
              </div>
              <div className="panel__body">
                <div className="sy-ver">
                  <div className="f">
                    <label htmlFor="min-android">Minimum Android version</label>
                    <div className={`inp${edit ? '' : ' ro'}`}>
                      <input
                        id="min-android"
                        value={minAndroid}
                        readOnly={!edit}
                        inputMode="decimal"
                        onChange={e => setMinAndroid(e.target.value)}
                        onBlur={() => edit && saveVersion('android_min_version', minAndroid, 'Android')}
                        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                        aria-label="Minimum Android"
                      />
                    </div>
                    {verError?.key === 'android_min_version' && <span className="hint err-t">{verError.text}</span>}
                  </div>
                  <div className="f">
                    <label htmlFor="min-ios">Minimum iOS version</label>
                    <div className={`inp${edit ? '' : ' ro'}`}>
                      <input
                        id="min-ios"
                        value={minIos}
                        readOnly={!edit}
                        inputMode="decimal"
                        onChange={e => setMinIos(e.target.value)}
                        onBlur={() => edit && saveVersion('ios_min_version', minIos, 'iOS')}
                        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                        aria-label="Minimum iOS"
                      />
                    </div>
                    {verError?.key === 'ios_min_version' && <span className="hint err-t">{verError.text}</span>}
                  </div>
                  <div className="f">
                    <label>Latest Android</label>
                    <div className="inp ro">
                      <input value={val('android_latest', '–')} readOnly aria-label="Latest Android" />
                    </div>
                  </div>
                  <div className="f">
                    <label>Latest iOS</label>
                    <div className="inp ro">
                      <input value={val('ios_latest', '–')} readOnly aria-label="Latest iOS" />
                    </div>
                  </div>
                </div>
                <div className="setrow" style={{ padding: 0, border: 0 }}>
                  <span className="setrow__b">
                    <b>Force update</b>
                    <small>Readers below the minimum cannot read until they update.</small>
                  </span>
                  {screen.can_edit &&
                    (force ? (
                      <button
                        className="btn btn-g"
                        type="button"
                        disabled={pending || !online}
                        onClick={() =>
                          run(() => saveConfig('force_update', false), 'Force update is off. Every version can read again.')
                        }
                      >
                        Turn off force update
                      </button>
                    ) : (
                      <button className="btn btn-g" type="button" disabled={pending || !online} onClick={() => open({ kind: 'force_update' })}>
                        Turn on force update
                      </button>
                    ))}
                </div>
                <div className={`note ${force ? 'err' : 'warn'}`}>
                  <span className="grow">
                    <b>{force ? 'Force update is on' : 'Force update locks out readers below the minimum'}</b>
                    {`Android below ${val('android_min_version', '–')}, iOS below ${val('ios_min_version', '–')}. Tell Support first.`}
                  </span>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>Maintenance mode</h2>
                <span className={maintenance.on ? 'st st-err' : 'st-plain'}>{maintenance.on ? 'On' : 'Off'}</span>
              </div>
              <div className="panel__body">
                <div className="setrow" style={{ padding: 0, border: 0 }}>
                  <span className="setrow__b">
                    <b>Show maintenance screen</b>
                    <small>Readers see the message below. The staff console keeps working.</small>
                  </span>
                  {screen.can_edit &&
                    (maintenance.on ? (
                      <button
                        className="btn btn-g"
                        type="button"
                        disabled={pending || !online}
                        onClick={() =>
                          run(
                            () => saveConfig('maintenance', { on: false, message }),
                            'Maintenance mode is off. Readers can read again.',
                          )
                        }
                      >
                        Turn off maintenance mode
                      </button>
                    ) : (
                      <button
                        className="btn btn-d"
                        type="button"
                        disabled={pending || !online || message.trim().length < 10}
                        onClick={() => open({ kind: 'maintenance' })}
                      >
                        Turn on maintenance mode
                      </button>
                    ))}
                </div>
                <div className="f">
                  <label htmlFor="maint-msg">Message to readers</label>
                  <textarea
                    id="maint-msg"
                    className="inp ta"
                    value={message}
                    readOnly={!edit || maintenance.on}
                    maxLength={280}
                    onChange={e => setMessage(e.target.value)}
                    aria-label="Maintenance message"
                  />
                </div>
                <div className="note err">
                  <span className="grow">
                    <b>Stops all reading, including offline sync</b>Database work only. Downloaded books stay readable.
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Feature flags</h2>
              <span className="sub">{`${env} · 100% means everyone`}</span>
            </div>
            <div className="tw">
              <table className="tbl sy-flag">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Rollout</th>
                    <th>Last changed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.flatMap(([g, label]) => {
                    const rows = screen.flags.filter(f => f.group === g);
                    if (!rows.length) return [];
                    return [
                      <tr className="sy-grp" key={g}>
                        <td colSpan={4}>{label}</td>
                      </tr>,
                      ...rows.map(flagRow),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <details className="fold">
            <summary>
              Over-the-air updates{' '}
              <small>
                {[ota.channel ?? 'production', ota.reach_pct != null ? `reached ${ota.reach_pct}% of phones` : 'working']
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </summary>
            <div className="fold__b">
              <dl className="kv">
                <dt>Channel</dt>
                <dd>{ota.channel ?? 'production'}</dd>
                <dt>Server</dt>
                <dd className="mono">{ota.server ?? '–'}</dd>
                <dt>Current bundle</dt>
                <dd className="mono">{ota.current ?? 'None published yet'}</dd>
                <dt>Published</dt>
                <dd>
                  {ota.published_at
                    ? `${when(ota.published_at)}${ota.published_by ? ` by ${ota.published_by}` : ''}`
                    : '–'}
                </dd>
                <dt>Reached</dt>
                <dd>{ota.reach_pct != null ? `${ota.reach_pct}% of phones` : 'Shown once app opens are counted'}</dd>
                <dt>Previous bundle</dt>
                <dd className="mono">{ota.previous ?? 'None'}</dd>
              </dl>
              {screen.can_edit && (
                <div className="row">
                  <button
                    className="btn btn-d"
                    type="button"
                    disabled={pending || !online || !ota.previous}
                    onClick={() => open({ kind: 'ota' })}
                  >
                    Roll back to previous bundle
                  </button>
                  <span className="hint">About 10 minutes, asks for your two-step code.</span>
                </div>
              )}
            </div>
          </details>
          <details className="fold">
            <summary>
              Remote copy <small>{`${screen.copy.length} keys the app loads at start-up`}</small>
            </summary>
            <div className="fold__b">
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Current text</th>
                      <th>Last edited</th>
                      <th className="acts"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {screen.copy.map(c => (
                      <tr key={c.key}>
                        <td className="mono">{c.key}</td>
                        <td>
                          {copyKey === c.key ? (
                            <div className="f">
                              <div className="inp">
                                <input
                                  value={copyText}
                                  maxLength={200}
                                  autoFocus
                                  onChange={e => setCopyText(e.target.value)}
                                  aria-label={c.key}
                                />
                              </div>
                              {copyError ? (
                                <span className="hint err-t">{copyError}</span>
                              ) : (
                                c.required_placeholders.length > 0 && (
                                  <span className="hint">{`Keep ${c.required_placeholders.join(', ')}`}</span>
                                )
                              )}
                            </div>
                          ) : (
                            c.text
                          )}
                        </td>
                        <td className="nw">{stamp(c)}</td>
                        <td className="acts">
                          {copyKey === c.key ? (
                            <span className="row">
                              <button className="btn btn-g sm" type="button" disabled={pending} onClick={() => setCopyKey(null)}>
                                Cancel
                              </button>
                              <button
                                className="btn btn-p sm"
                                type="button"
                                disabled={pending || !online || !copyText.trim()}
                                onClick={() =>
                                  start(async () => {
                                    const r = await saveCopy(c.key, copyText);
                                    if (!r.ok) return setCopyError(r.error);
                                    setCopyKey(null);
                                    show(`${c.key} saved. The app picks up the new wording the next time it starts.`);
                                    router.refresh();
                                  })
                                }
                              >
                                Save
                              </button>
                            </span>
                          ) : (
                            <button
                              className="btn btn-g sm"
                              type="button"
                              disabled={pending || !online}
                              onClick={() => {
                                setCopyKey(c.key);
                                setCopyText(c.text);
                                setCopyError(null);
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </div>
        {toast}
      </section>
      {ask && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => !pending && setAsk(null)}></a>
          <div
            className="modal danger"
            role="dialog"
            aria-label={
              ask.kind === 'maintenance'
                ? 'Turn on maintenance mode'
                : ask.kind === 'force_update'
                  ? 'Turn on force update'
                  : 'Roll back to previous bundle'
            }
          >
            <div className="modal__h">
              <div className="grow">
                <h2>
                  {ask.kind === 'maintenance'
                    ? 'Turn on maintenance mode?'
                    : ask.kind === 'force_update'
                      ? 'Turn on force update?'
                      : 'Roll back to the previous bundle?'}
                </h2>
                <p>
                  {ask.kind === 'maintenance'
                    ? 'Every reader will see the message below and cannot read until you turn it off.'
                    : ask.kind === 'force_update'
                      ? `Readers on Android below ${val('android_min_version', '–')} or iOS below ${val('ios_min_version', '–')} cannot read until they update.`
                      : 'Phones switch within about 10 minutes, the next time the app opens.'}
                </p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => !pending && setAsk(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              {ask.kind === 'maintenance' && (
                <div className="sy-inbox">
                  <b>Message to readers</b>
                  <span className="muted">{message}</span>
                </div>
              )}
              {ask.kind === 'ota' && (
                <div className="sy-inbox">
                  <b>Goes back to</b>
                  <span className="muted mono">{ota.previous}</span>
                </div>
              )}
              <div className="f">
                <label htmlFor="stepup">Your two-step code</label>
                <div className="inp">
                  <input
                    id="stepup"
                    className="mono"
                    value={code}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={9}
                    onChange={e => setCode(e.target.value.trim())}
                    aria-label="Two-step code"
                    aria-invalid={!!error}
                  />
                </div>
                <span className={error ? 'hint err-t' : 'hint'}>
                  {error ??
                    (ask.kind === 'maintenance'
                      ? 'From your authenticator app. Downloaded books stay readable.'
                      : 'From your authenticator app, or a backup code.')}
                </span>
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => setAsk(null)}>
                Cancel
              </button>
              <button
                className="btn btn-d"
                type="button"
                disabled={pending || !online || code.length < 6}
                onClick={confirm}
              >
                {pending
                  ? 'Saving…'
                  : ask.kind === 'maintenance'
                    ? 'Turn on maintenance mode'
                    : ask.kind === 'force_update'
                      ? 'Turn on force update'
                      : 'Roll back'}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
