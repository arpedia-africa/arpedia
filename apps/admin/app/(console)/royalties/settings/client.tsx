'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { Otp } from '../../pricing/otp';
import { saveSettings } from '../actions';
import { dayTime, monthLabel, n0 } from '../shared';

export interface Settings {
  hold_days: number;
  min_payout_kobo: number;
  payout_day: number;
  gift_loop_detection: boolean;
}
interface LogRow extends Settings {
  effective_from: string;
  changed_name: string | null;
  note: string | null;
}

const ord = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;

/** What changed between two settings rows, for the change log. */
function changes(a: Settings, b: Settings): string[] {
  const out: string[] = [];
  if (a.hold_days !== b.hold_days) out.push(`Hold changed ${a.hold_days} to ${b.hold_days} days`);
  if (a.min_payout_kobo !== b.min_payout_kobo) out.push(`Minimum payout set to ₦${n0(b.min_payout_kobo / 100)}`);
  if (a.payout_day !== b.payout_day) out.push(`Payout day moved to the ${ord(b.payout_day)}`);
  if (a.gift_loop_detection !== b.gift_loop_detection) out.push(`Gift-loop detection turned ${b.gift_loop_detection ? 'on' : 'off'}`);
  return out;
}

/**
 * s-royalty-settings (rule 32): hold days, minimum payout, payout day, gift-loop detection. Super
 * admin saves with a fresh 2-step code; Finance views. Changes apply to the open month only.
 */
export function SettingsForm({
  current,
  canSave,
  rate,
  lastMonth,
  undone,
  refunded,
  giftLoop,
  log,
}: {
  current: Settings;
  canSave: boolean;
  rate: string;
  lastMonth: string | null;
  undone: number;
  refunded: number;
  giftLoop: { credits: number; readers: number };
  log: LogRow[];
}) {
  const router = useRouter();
  const [toast] = useToast();
  const [pending, start] = useTransition();
  const [hold, setHold] = useState(String(current.hold_days));
  const [min, setMin] = useState(n0(current.min_payout_kobo / 100));
  const [payDay, setPayDay] = useState(String(current.payout_day));
  const [loop, setLoop] = useState(current.gift_loop_detection);
  const [confirm, setConfirm] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const month = lastMonth ? ` in ${monthLabel(lastMonth, { bare: true })}` : '';
  const draft: Settings = {
    hold_days: Number(hold),
    min_payout_kobo: Math.round(Number(min.replace(/,/g, '')) * 100),
    payout_day: Number(payDay.replace(/\D/g, '')),
    gift_loop_detection: loop,
  };
  const diff = changes(current, draft);

  const save = () =>
    start(async () => {
      const r = await saveSettings({
        holdDays: draft.hold_days,
        minNaira: draft.min_payout_kobo / 100,
        payoutDay: draft.payout_day,
        giftLoop: loop,
        otp,
      });
      if (!r.ok) {
        setError(r.error);
        if (r.needCode) setOtp('');
        return;
      }
      setConfirm(false);
      router.push(`/royalties?done=${encodeURIComponent(r.message)}`);
    });

  const ro = !canSave;
  return (
    <>
      <section className="screen enter">
        <div className="ph">
          <div className="crumbs">
            <Link href="/royalties">Author earnings</Link>
            <Icon name="chev" size="s" />
            <span>Settings</span>
          </div>
          <div className="ph__row">
            <div className="ph__title">
              <h1>Earnings settings</h1>
              {ro && <div className="ph__meta">Only a Super admin can change these settings.</div>}
            </div>
            <div className="ph__acts">
              <Link className="btn btn-g" href="/royalties">
                Cancel
              </Link>
              <button
                className="btn btn-p"
                type="button"
                disabled={ro || diff.length === 0}
                onClick={() => {
                  setError(null);
                  setOtp('');
                  setConfirm(true);
                }}
              >
                Save settings
              </button>
            </div>
          </div>
        </div>
        <div className="page">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Payouts</h2>
              </div>
              <div className="panel__body form">
                <div className="fgrid">
                  <div className="f">
                    <span className="lbl">Author rate</span>
                    <div className="inp ro">{`${rate} per credit spent`}</div>
                    <span className="hint">
                      Books, tips and messages.{' '}
                      <Link className="link" href="/pricing-rules">
                        Change in Pricing rules
                      </Link>
                    </span>
                  </div>
                  <div className="f">
                    <label htmlFor="rs-h">Hold period</label>
                    <div className={`inp${ro ? ' ro' : ''}`}>
                      <input id="rs-h" inputMode="numeric" readOnly={ro} value={hold} onChange={e => setHold(e.target.value.replace(/\D/g, '').slice(0, 3))} />
                      <span className="suf">days</span>
                    </div>
                    <span className="hint">Time to catch refunds and chargebacks.</span>
                  </div>
                  <div className="f">
                    <label htmlFor="rs-m">Minimum payout</label>
                    <div className={`inp${ro ? ' ro' : ''}`}>
                      <span className="pre">₦</span>
                      <input
                        id="rs-m"
                        inputMode="numeric"
                        readOnly={ro}
                        value={min}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 7);
                          setMin(v ? n0(Number(v)) : '');
                        }}
                      />
                    </div>
                    <span className="hint">Below this, the amount carries to next month.</span>
                  </div>
                  <div className="f">
                    <label htmlFor="rs-d">Payout day</label>
                    <div className={`inp${ro ? ' ro' : ''}`}>
                      <input
                        id="rs-d"
                        inputMode="numeric"
                        readOnly={ro}
                        value={payDay}
                        onChange={e => setPayDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      />
                      <span className="suf">of the month</span>
                    </div>
                    <span className="hint">The 1st to the 28th.</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="panel">
              <div className="panel__head">
                <h2>What is not paid</h2>
              </div>
              <div className="panel__body form">
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Chapter charges undone within 10 minutes</b>
                    <small>{`${n0(undone)} credits${month}`}</small>
                  </span>
                  <span className="switch on" role="switch" aria-checked="true" aria-disabled="true" aria-label="Exclude undone chapters"></span>
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Unspent credits taken back by refunds</b>
                    <small>{`${n0(refunded)} credits${month}. Spent credits stay paid.`}</small>
                  </span>
                  <span className="switch on" role="switch" aria-checked="true" aria-disabled="true" aria-label="Exclude refunded credits"></span>
                </div>
                <div className="setrow">
                  <span className="setrow__b">
                    <b>Gift-loop detection</b>
                    <small>
                      {`Freezes credits passed back and forth between accounts.${giftLoop.readers ? ` ${giftLoop.readers} account${giftLoop.readers === 1 ? '' : 's'}${month} (${n0(giftLoop.credits)} credits).` : ''}`}
                    </small>
                  </span>
                  <button
                    type="button"
                    className={`switch${loop ? ' on' : ''}`}
                    role="switch"
                    aria-checked={loop}
                    aria-label="Gift-loop detection"
                    disabled={ro}
                    onClick={() => setLoop(v => !v)}
                  ></button>
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                More details <small>change log</small>
              </summary>
              <div className="fold__b">
                <div className="tl">
                  {log.map((row, i) => {
                    const prev = log[i + 1];
                    const what = prev ? changes(prev, row) : [];
                    const title = what.length ? what.join(', ') : row.note || (prev ? 'Settings saved' : 'Launch settings');
                    return (
                      <div key={row.effective_from} className={`tl__i${i === 0 ? ' org' : ''}`}>
                        <b>{title}</b>
                        <small>{`${dayTime(row.effective_from).split(',')[0]} ${new Date(row.effective_from).getUTCFullYear()}${row.changed_name ? ` · ${row.changed_name}` : ''}`}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>
        </div>
        {toast}
      </section>
      {confirm && (
        <section className="screen overlay enter">
          <a className="backdrop" aria-label="Close" onClick={() => !pending && setConfirm(false)}></a>
          <div className="modal" role="dialog" aria-label="Save earnings settings">
            <div className="modal__h">
              <div className="grow">
                <h2>Save earnings settings?</h2>
                <p>Applies to this month’s earnings. Closed and paid months never change.</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => !pending && setConfirm(false)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              {diff.map(d => (
                <div className="kv-row" key={d}>
                  <span>{d}</span>
                </div>
              ))}
              <div className="f">
                <span className="lbl">2-step code</span>
                <Otp value={otp} onChange={setOtp} invalid={!!error} />
                {error && <span className="hint">{error}</span>}
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-p" type="button" disabled={pending || otp.length !== 6} onClick={save}>
                {pending ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
