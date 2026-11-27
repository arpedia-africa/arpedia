'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { Otp } from '../../../pricing/otp';
import { releaseCycle, releaseCyclePart } from '../../actions';

export interface Held {
  name: string;
  kobo: number;
  href: string;
}

/**
 * s-royalty-release (rule 14): payable, held for unverified accounts, sent now, balance left, the two
 * people, and a fresh 2-step code. Cannot be undone; releasing twice sends nothing twice.
 * When the Flutterwave balance is short (13-12), it sends whole lines up to `budgetKobo` and says who
 * stays approved, not sent; `rest` sends what an earlier partial release left.
 */
export function ReleaseModal(props: {
  id: string;
  title: string;
  month: string;
  next: string;
  payableKobo: number;
  payableAuthors: number;
  payableCredits: number;
  rate: string;
  heldKobo: number;
  held: Held[];
  sendKobo: number;
  sendAuthors: number;
  leftKobo: number;
  leftAuthors: number;
  budgetKobo: number | null;
  rest: boolean;
  balanceKobo: number | null;
  carried: number;
  preparer: { name: string; initials: string; av: string; at: string };
  me: { name: string; initials: string; av: string };
  blocked: string | null;
}) {
  const p = props;
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [otp, setOtp] = useState('');
  const [bad, setBad] = useState(false);
  const back = `/royalties/${p.id}`;

  const release = () =>
    start(async () => {
      const r =
        p.budgetKobo == null
          ? await releaseCycle(p.id, otp, p.title)
          : await releaseCyclePart(p.id, otp, p.title, p.budgetKobo);
      if (!r.ok) {
        setBad(!!r.needCode);
        return show(r.error);
      }
      router.push(`/payouts?done=${encodeURIComponent(r.message)}`);
    });

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={back} aria-label="Close"></Link>
      <div className="modal wide danger" role="dialog" aria-label={`Release ${p.month} payouts`}>
        <div className="modal__h">
          <div className="grow">
            <h2>{`Release ${naira(p.sendKobo)} to ${p.sendAuthors} author${p.sendAuthors === 1 ? '' : 's'}`}</h2>
            <p>
              {`${p.title} author earnings${p.rest ? ' approved, not sent' : ''}, sent by Flutterwave bank transfer. This cannot be undone.`}
            </p>
          </div>
          <Link className="ib" href={back} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="kv-row">
            <span>{`${p.rest ? 'Approved, not sent' : 'Payable'} to ${p.payableAuthors} author${p.payableAuthors === 1 ? '' : 's'} (${p.payableCredits.toLocaleString('en-NG')} credits × ${p.rate})`}</span>
            <b>{naira(p.payableKobo)}</b>
          </div>
          {p.heldKobo > 0 && (
            <div className="kv-row">
              <span>{`Held for ${p.held.length} unverified bank account${p.held.length === 1 ? '' : 's'}`}</span>
              <b>{`−${naira(p.heldKobo)}`}</b>
            </div>
          )}
          {p.leftAuthors > 0 && (
            <div className="kv-row">
              <span>{`Not sent for ${p.leftAuthors} author${p.leftAuthors === 1 ? '' : 's'} until the balance is topped up`}</span>
              <b>{`−${naira(p.leftKobo)}`}</b>
            </div>
          )}
          <div className="kv-row total">
            <span>{`Sent now to ${p.sendAuthors} author${p.sendAuthors === 1 ? '' : 's'}`}</span>
            <b>{naira(p.sendKobo)}</b>
          </div>
          <div className="kv-row">
            <span>
              {p.balanceKobo == null
                ? 'Flutterwave balance could not be read'
                : `Flutterwave balance ${naira(p.balanceKobo)}, left after release`}
            </span>
            <b>{p.balanceKobo == null ? '' : naira(p.balanceKobo - p.sendKobo)}</b>
          </div>
          {(p.held.length > 0 || p.carried > 0) && (
            <div className="note warn">
              <div className="grow">
                {p.held.length > 0 && (
                  <b>
                    {'Held: '}
                    {p.held.map((h, i) => (
                      <span key={h.href + h.name}>
                        {i > 0 && (i === p.held.length - 1 ? ' and ' : ', ')}
                        <Link className="link" href={h.href}>{`${h.name} ${naira(h.kobo)}`}</Link>
                      </span>
                    ))}
                  </b>
                )}
                {p.held.length > 0 && 'Paid when their bank accounts are verified. '}
                {p.carried > 0 &&
                  `Amounts under ₦1,000 for ${p.carried} other author${p.carried === 1 ? '' : 's'} carry over to ${p.next}.`}
              </div>
            </div>
          )}
          {p.leftAuthors > 0 && !p.blocked && (
            <div className="note warn">
              <div className="grow">
                <b>The Flutterwave balance is below the amount to send</b>
                {`Smallest amounts go first, so ${p.sendAuthors} author${p.sendAuthors === 1 ? ' is' : 's are'} paid now. The other ${p.leftAuthors} stay approved, not sent: top up the balance, then send the rest from this month.`}
              </div>
            </div>
          )}
          {p.blocked && (
            <div className="note err">
              <div className="grow">
                <b>Release is blocked</b>
                {p.blocked}
              </div>
            </div>
          )}
          <div className="mn-two">
            <div className="stack s8">
              <b>Two-person approval</b>
              <div className="who">
                <span className={`av sm ${p.preparer.av}`}>{p.preparer.initials}</span>
                <span>
                  <b>{p.preparer.name}</b>
                  <small>{`Prepared · ${p.preparer.at}`}</small>
                </span>
              </div>
              <div className="who">
                <span className={`av sm ${p.me.av}`}>{p.me.initials}</span>
                <span>
                  <b>{`${p.me.name} (you)`}</b>
                  <small>Approving now</small>
                </span>
              </div>
            </div>
            <div className="f">
              <span className="lbl">2-step code</span>
              <Otp
                value={otp}
                invalid={bad}
                onChange={v => {
                  setBad(false);
                  setOtp(v);
                }}
              />
            </div>
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={back}>
            Cancel
          </Link>
          <button
            className="btn btn-p"
            type="button"
            disabled={pending || !!p.blocked || otp.length !== 6 || p.sendKobo < 1}
            onClick={release}
          >
            {`Release ${naira(p.sendKobo)}`}
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
