'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { decideRefund } from '../actions';

const n0 = (n: number) => n.toLocaleString('en-NG');

const HEADLINE: Record<string, string> = {
  full: 'Recommended: refund in full',
  partial: 'Recommended: partial refund or decline',
  decline: 'Recommended: decline',
  duplicate: 'Recommended: refund the duplicate',
};

/**
 * Refund (s-refund, rule 32): opens on the recommended outcome. Partial refund and a note are under
 * More options. Refund goes to Flutterwave; unspent credits come off once it lands; the reader is emailed.
 */
export function RefundModal({
  id,
  name,
  status,
  grossKobo,
  feeKobo,
  granted,
  used,
  recommendation,
  agrees,
  reason,
  days,
  pct,
  bought,
  refunded,
}: {
  id: string;
  name: string;
  status: string;
  grossKobo: number;
  feeKobo: number;
  granted: number;
  used: number;
  recommendation: string;
  agrees: boolean;
  reason: string;
  days: number;
  pct: number;
  bought: string;
  refunded: string;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [type, setType] = useState<'full' | 'partial'>('full');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const first = name.split(' ')[0]!;
  const waiting = status === 'waiting';
  const partialKobo = Math.round((Number(amount.replace(/,/g, '')) || 0) * 100);
  const kobo = type === 'full' ? grossKobo : partialKobo;
  // Only credits still unspent come back, in proportion to the amount refunded.
  const unspent = Math.max(0, granted - used);
  const removed = type === 'full' ? unspent : Math.min(unspent, Math.ceil((granted * partialKobo) / Math.max(grossKobo, 1)));

  const decide = (refund: boolean) =>
    start(async () => {
      const r = await decideRefund(id, refund, type, refund ? kobo : null, note, name);
      if (!r.ok) return show(r.error);
      router.push(`/refunds?done=${encodeURIComponent(r.message)}`);
    });

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href="/refunds" aria-label="Close"></Link>
      <div className="modal wide" role="dialog" aria-label={`Refund ${naira(grossKobo)} to ${name}`}>
        <div className="modal__h">
          <div className="grow">
            <h2>{`Refund ${naira(grossKobo)} to ${name}`}</h2>
            <p>{bought}</p>
          </div>
          <Link className="ib" href="/refunds" aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="form">
            <div className="mn-rec">
              <b>{HEADLINE[recommendation] ?? 'Recommendation'}</b>
              <span>
                {`${first} asked ${days === 0 ? 'the same day' : `${days} day${days === 1 ? '' : 's'} after buying`}, and used ${n0(used)} of ${n0(granted)} credits (${pct}%). ${reason}`}
                {!agrees && ' The rule (within 7 days and under 25% used) would say otherwise, so check before you decide.'}
              </span>
            </div>
            <div className="panel__body">
              <div className="kv-row">
                <span>{`Refund to ${first}'s card`}</span>
                <b>{naira(kobo)}</b>
              </div>
              <div className="kv-row">
                <span>Credits granted · already spent</span>
                <b>{`${n0(granted)} · ${n0(used)}`}</b>
              </div>
              <div className="kv-row total">
                <span>Credits removed from the balance</span>
                <b>{n0(removed)}</b>
              </div>
            </div>
            <span className="muted">Credits already spent stay paid to authors. Only unspent credits come off.</span>
            {waiting ? (
              <details className="fold">
                <summary>
                  More options <small>partial refund, note</small>
                </summary>
                <div className="fold__b form">
                  <div className="f">
                    <span className="lbl">Refund type</span>
                    <div className="seg">
                      <button type="button" className={type === 'full' ? 'is-selected' : ''} onClick={() => setType('full')}>
                        Full
                      </button>
                      <button type="button" className={type === 'partial' ? 'is-selected' : ''} onClick={() => setType('partial')}>
                        Partial
                      </button>
                    </div>
                  </div>
                  <div className="fgrid">
                    <div className="f">
                      <label htmlFor="rf-a">Amount to refund</label>
                      <div className={`inp${type === 'full' ? ' ro' : ''}`}>
                        <span className="pre">₦</span>
                        <input
                          id="rf-a"
                          inputMode="decimal"
                          readOnly={type === 'full'}
                          value={type === 'full' ? n0(grossKobo / 100) : amount}
                          onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                        />
                      </div>
                      <span className="hint">{`Flutterwave's ${naira(feeKobo)} fee is not returned to Arpedia.`}</span>
                    </div>
                    <div className="f">
                      <label htmlFor="rf-n">Note (staff only)</label>
                      <div className="inp">
                        <input id="rf-n" value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
                      </div>
                      <span className="hint">Goes in the audit log.</span>
                    </div>
                  </div>
                </div>
              </details>
            ) : (
              <span className="muted">
                {status === 'refunded'
                  ? `Already refunded${refunded ? `: ${refunded}` : ''}.`
                  : status === 'declined'
                    ? 'This request was declined.'
                    : status === 'refunding'
                      ? 'The refund is with Flutterwave. Credits come off once it lands.'
                      : 'The refund did not go through. Ask engineering to check the Flutterwave call.'}
              </span>
            )}
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href="/refunds">
            {waiting ? 'Cancel' : 'Close'}
          </Link>
          {waiting && (
            <>
              <button className="btn btn-g" type="button" disabled={pending} onClick={() => decide(false)}>
                Decline
              </button>
              <button className="btn btn-p" type="button" disabled={pending || kobo < 1} onClick={() => decide(true)}>
                {`Refund ${naira(kobo)}`}
              </button>
            </>
          )}
        </div>
      </div>
      {toast}
    </section>
  );
}
