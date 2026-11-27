'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { decidePriceChange } from '../actions';
import type { PriceChange } from '../data';
import { dayLabel, num, type Plan } from '../format';
import { Otp } from '../otp';

/**
 * Rule 17: a Super admin confirms or rejects a plan price change someone else proposed. The same
 * modal, key-value list and 2-step code row as s-plan-edit; confirming writes the new price version.
 */
export function ConfirmChangeModal({
  plan,
  change,
  subscribers,
  canDecide,
  closeHref,
}: {
  plan: Plan;
  change: PriceChange;
  subscribers: number;
  canDecide: boolean;
  closeHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const subs = num(subscribers);

  const decide = (approve: boolean) =>
    start(async () => {
      setError(null);
      const r = await decidePriceChange({ id: change.id, approve, otp });
      if (!r.ok) {
        setError(r.error);
        if (r.needCode) setOtp('');
        return;
      }
      const msg = approve
        ? `${change.name} price confirmed from ${dayLabel(change.effective_from)}. ${subs} subscriber${subscribers === 1 ? ' keeps' : 's keep'} their price until they renew.`
        : `${change.name} price change rejected. Nothing changed.`;
      router.push(`/pricing?flash=${encodeURIComponent(msg)}`);
    });

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal" role="dialog" aria-label={`Confirm ${plan.name} price change`}>
        <div className="modal__h">
          <div className="grow">
            <h2>{`Confirm ${plan.name} price change`}</h2>
            <p>{`Proposed by ${change.by ?? 'a staff member'} on ${dayLabel(change.created_at)}`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <dl className="kv">
            <dt>Web price</dt>
            <dd>
              {plan.price_web_kobo === change.price_web_kobo
                ? naira(change.price_web_kobo)
                : `${naira(plan.price_web_kobo)} → ${naira(change.price_web_kobo)}`}
            </dd>
            <dt>Credits per period</dt>
            <dd>{plan.credits === change.credits ? num(change.credits) : `${num(plan.credits)} → ${num(change.credits)}`}</dd>
            {plan.bonus_credits !== change.bonus_credits && (
              <>
                <dt>Bonus credits</dt>
                <dd>{`${num(plan.bonus_credits)} → ${num(change.bonus_credits)}`}</dd>
              </>
            )}
            {plan.name !== change.name && (
              <>
                <dt>Display name</dt>
                <dd>{`${plan.name} → ${change.name}`}</dd>
              </>
            )}
            <dt>Effective</dt>
            <dd>{dayLabel(change.effective_from)}</dd>
            <dt>Subscribers</dt>
            <dd>{`${subs} ${subscribers === 1 ? 'keeps' : 'keep'} their price until they renew`}</dd>
          </dl>
          <div className="f">
            <span className="lbl">2-step code</span>
            <Otp value={otp} onChange={setOtp} invalid={!!error} />
            <span className="hint">
              {error ??
                (canDecide
                  ? 'The plan check runs again when you confirm.'
                  : 'Another Super admin must confirm a change you proposed.')}
            </span>
          </div>
        </div>
        <div className="modal__f">
          <button className="btn btn-g" type="button" disabled={pending || !canDecide} onClick={() => decide(false)}>
            Reject
          </button>
          <button
            className="btn btn-p"
            type="button"
            disabled={pending || !canDecide || otp.length !== 6}
            onClick={() => decide(true)}
          >
            {pending ? 'Saving…' : 'Confirm price'}
          </button>
        </div>
      </div>
    </section>
  );
}
