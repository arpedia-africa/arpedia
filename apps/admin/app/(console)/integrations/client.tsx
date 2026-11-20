'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { OfflineNote, useOnline } from '@/components/online';
import { useToast } from '@/components/toast';
import { Otp } from '../pricing/otp';
import { checkAllNow, rotateKey } from './actions';

export interface Integration {
  service: string;
  label: string;
  description: string | null;
  status: 'working' | 'degraded' | 'failing';
  last_event_at: string | null;
  last_event_text: string | null;
  error_rate_24h: number | null;
  error_note: string | null;
  address: string | null;
  key_masked: string | null;
  key_owner: string | null;
  key_rotated_at: string | null;
  old_key_valid_until: string | null;
  checked_at: string | null;
}

const STATUS: Record<Integration['status'], string> = { working: 'Working', degraded: 'Check', failing: 'Failing' };

/** "12 seconds ago" / "1 hour 12 minutes ago" / "15 Oct, 10:02" for older events. */
function ago(iso: string | null, now: number): string {
  if (!iso) return 'No events yet';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (s < 60) return `${plural(s, 'second')} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${plural(m, 'minute')} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${plural(h, 'hour')}${m % 60 ? ` ${plural(m % 60, 'minute')}` : ''} ago`;
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Africa/Lagos',
  });
}

function rate(i: Integration): string {
  if (i.error_rate_24h == null) return '–';
  const r = `${Number(i.error_rate_24h).toLocaleString('en-NG', { maximumFractionDigits: 2 })}%`;
  return i.error_note ? `${r} · ${i.error_note}` : r;
}

const lastEvent = (i: Integration, now: number) =>
  i.last_event_text ? `${ago(i.last_event_at, now)}, ${i.last_event_text}` : ago(i.last_event_at, now);

/**
 * s-integrations: one summary line, an open panel per service that needs a look, the healthy ones
 * in one table, and the masked keys folded. Rotating a key asks for a fresh 2-step code.
 */
export function IntegrationsView({ services, canRotate }: { services: Integration[]; canRotate: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [rotating, setRotating] = useState<Integration | null>(null);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const bad = services.filter(s => s.status !== 'working');
  const good = services.filter(s => s.status === 'working');
  const summary = bad.length
    ? `${bad.map(s => s.label).join(', ')} need${bad.length === 1 ? 's' : ''} a look.`
    : 'Everything is working.';

  const checkAll = () =>
    start(async () => {
      const r = await checkAllNow();
      show(r.ok ? `Checking all ${services.length} services now. Results show within a minute.` : r.error);
      router.refresh();
    });

  const rotate = () =>
    start(async () => {
      if (!rotating) return;
      setError(null);
      const r = await rotateKey(rotating.service, otp);
      if (!r.ok) {
        setError(r.error);
        setOtp('');
        return;
      }
      show(
        `New ${rotating.label} key recorded. Paste it into ${rotating.key_owner ?? 'its settings'} within 24 hours, when the old key stops working.`,
      );
      setRotating(null);
      setOtp('');
      router.refresh();
    });

  return (
    <>
      <section className="screen enter">
        <div className="band">
          <div className="band__row">
            <div className="band__text">
              <h1>Integrations</h1>
            </div>
            <div className="band__acts">
              <button className="btn btn-n" type="button" disabled={pending || !online} onClick={checkAll}>
                <Icon name="refresh" />
                Check all now
              </button>
            </div>
          </div>
        </div>
        <div className="page">
          <OfflineNote online={online} />
          <div className="sline">
            <span className={bad.length ? 'dot warn' : 'dot'}></span>
            <span>
              <b>{`${good.length} of ${services.length} working`}</b>
              {` · ${summary} Health checks run every minute.`}
            </span>
          </div>
          {bad.map(s => (
            <div className="panel panel--flush" key={s.service}>
              <div className="panel__head">
                <h2>{s.label}</h2>
                <span className={`st ${s.status === 'failing' ? 'st-err' : 'st-warn'}`}>{STATUS[s.status]}</span>
              </div>
              <div className="panel__body">
                {s.error_note && (
                  <div className={`note ${s.status === 'failing' ? 'err' : 'warn'}`}>
                    <span className="grow">
                      <b>{s.error_note}</b>
                      {s.description}
                    </span>
                  </div>
                )}
                <dl className="kv tight">
                  <dt>Last event</dt>
                  <dd>{lastEvent(s, now)}</dd>
                  <dt>Error rate</dt>
                  <dd>{rate(s)}</dd>
                </dl>
              </div>
            </div>
          ))}
          <div className="panel panel--flush">
            <div className="panel__head">
              <h2>Working</h2>
              <span className="sub">{`${good.length} service${good.length === 1 ? '' : 's'}`}</span>
            </div>
            {good.length ? (
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Last event</th>
                      <th className="r">Error rate</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {good.map(s => (
                      <tr key={s.service}>
                        <td>
                          <b>{s.label}</b>
                          {s.description && (
                            <small className="faint" style={{ display: 'block' }}>
                              {s.description}
                            </small>
                          )}
                        </td>
                        <td>{lastEvent(s, now)}</td>
                        <td className="n">{rate(s)}</td>
                        <td>
                          <span className="st-plain">Working</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <b>Nothing is working right now</b>
                <span>Every service above needs a look. Health checks run every minute.</span>
              </div>
            )}
          </div>
          <details className="fold">
            <summary>
              Keys and webhooks <small>{`masked, ${services.length} services`}</small>
            </summary>
            <div className="fold__b">
              <div className="tw">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Webhook or address</th>
                      <th>Key</th>
                      <th className="acts"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map(s => (
                      <tr key={s.service}>
                        <td>
                          <b>{s.label}</b>
                        </td>
                        <td>
                          {s.address ? (
                            <span className={s.address.startsWith('http') ? 'sy-url' : 'mono'}>{s.address}</span>
                          ) : (
                            <span className="faint">None</span>
                          )}
                        </td>
                        <td className="mono">
                          {s.key_masked ?? '–'}
                          {s.old_key_valid_until && new Date(s.old_key_valid_until).getTime() > now && (
                            <small className="faint">Old key works for 24 hours after rotation</small>
                          )}
                        </td>
                        <td className="acts">
                          {canRotate && (
                            <button
                              className="btn btn-g sm"
                              type="button"
                              disabled={pending || !online}
                              onClick={() => {
                                setError(null);
                                setOtp('');
                                setRotating(s);
                              }}
                            >
                              Rotate
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
      {rotating && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => !pending && setRotating(null)}></a>
          <div className="modal" role="dialog" aria-label={`Rotate the ${rotating.label} key`}>
            <div className="modal__h">
              <div className="grow">
                <h2>{`Rotate the ${rotating.label} key?`}</h2>
                <p>The old key keeps working for 24 hours</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => !pending && setRotating(null)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <span className="muted">
                {`Make the new key in the provider first. This records the rotation in the audit log; paste the new key into ${rotating.key_owner ?? 'its settings'} within 24 hours.`}
              </span>
              <div className="f">
                <span className="lbl">2-step code</span>
                <Otp value={otp} onChange={setOtp} invalid={!!error} />
                {error && <span className="hint">{error}</span>}
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => setRotating(null)}>
                Cancel
              </button>
              <button className="btn btn-p" type="button" disabled={pending || !online || otp.length !== 6} onClick={rotate}>
                {pending ? 'Rotating…' : 'Rotate key'}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
