'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { netPerCreditKobo } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { savePlan } from '../actions';
import { dayLabel, nairaDec, num, parseDay, type Plan } from '../format';
import { Otp } from '../otp';

/**
 * s-plan-edit (rule 23): name, badge, web price, credits and effective date. The in-app price is
 * read-only (it lives in the stores). Saving needs a fresh 2-step code and runs the plan check.
 */
export function PlanEditModal({
  plan,
  subscribers,
  authorRateKobo,
  storeFeePct,
  canEdit,
  closeHref,
}: {
  plan: Plan;
  subscribers: number;
  authorRateKobo: number;
  storeFeePct: number;
  canEdit: boolean;
  closeHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(plan.name);
  const [badge, setBadge] = useState(plan.badge ?? '');
  const [price, setPrice] = useState(String(plan.price_web_kobo / 100));
  const [credits, setCredits] = useState(String(plan.credits));
  const [date, setDate] = useState(dayLabel(new Date()));
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price.replace(/,/g, ''));
  const creditsNum = Number(credits.replace(/,/g, ''));
  const total = creditsNum + plan.bonus_credits;
  const when = parseDay(date);
  const valid =
    canEdit && name.trim() !== '' && Number.isInteger(priceNum) && priceNum > 0 && Number.isInteger(creditsNum) && creditsNum > 0 && when !== null;

  const net = total > 0 ? netPerCreditKobo(plan.price_play_kobo, total, storeFeePct) : 0;
  const subs = num(subscribers);

  const save = () =>
    start(async () => {
      setError(null);
      const r = await savePlan({
        code: plan.code,
        name,
        badge,
        priceNaira: priceNum,
        credits: creditsNum,
        bonus: plan.bonus_credits,
        effectiveFrom: when,
        otp,
      });
      if (!r.ok) {
        setError(r.error);
        if (r.needCode) setOtp('');
        return;
      }
      const msg = r.pending
        ? `${name.trim()} price change sent to a Super admin to confirm. Nothing changes until they do.`
        : `${name.trim()} plan saved. ${subs} subscriber${subscribers === 1 ? ' keeps' : 's keep'} their price until they renew.`;
      router.push(`/pricing?flash=${encodeURIComponent(msg)}`);
    });

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal wide" role="dialog" aria-label={`Edit ${plan.name} plan`}>
        <div className="modal__h">
          <div className="grow">
            <h2>{`Edit ${plan.name} plan`}</h2>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="form">
            <div className="fgrid">
              <div className="f">
                <label htmlFor="pe-n">Display name</label>
                <div className="inp">
                  <input id="pe-n" value={name} maxLength={40} readOnly={!canEdit} onChange={e => setName(e.target.value)} />
                </div>
              </div>
              <div className="f">
                <label htmlFor="pe-b">Badge</label>
                <div className="inp">
                  <input id="pe-b" value={badge} readOnly={!canEdit} onChange={e => setBadge(e.target.value)} />
                </div>
              </div>
              <div className="f">
                <label htmlFor="pe-p">Web price</label>
                <div className="inp">
                  <span className="pre">₦</span>
                  <input
                    id="pe-p"
                    inputMode="numeric"
                    value={price}
                    readOnly={!canEdit}
                    onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ''))}
                  />
                </div>
                <span className="hint">{`Today ${nairaDec(plan.price_web_kobo, false)}. Readers pay Flutterwave's 1.4%.`}</span>
              </div>
              <div className="f">
                <label htmlFor="pe-c">Credits per period</label>
                <div className="inp">
                  <input
                    id="pe-c"
                    inputMode="numeric"
                    value={credits}
                    readOnly={!canEdit}
                    onChange={e => setCredits(e.target.value.replace(/[^\d]/g, ''))}
                  />
                  <span className="suf">credits</span>
                </div>
                <span className="hint">
                  {total > 0
                    ? `${nairaDec(plan.price_play_kobo / total)} a credit in the app. Nets ${nairaDec(net)} after Google, ${nairaDec(net - authorRateKobo)} above the author rate.${plan.bonus_credits ? ` Plus ${num(plan.bonus_credits)} bonus credits.` : ''}`
                    : 'Enter the credits a reader gets each period.'}
                </span>
              </div>
              <div className="f">
                <label htmlFor="pe-d">Effective date</label>
                <div className="inp">
                  <input id="pe-d" value={date} readOnly={!canEdit} aria-invalid={when === null} onChange={e => setDate(e.target.value)} />
                  <Icon name="cal" />
                </div>
                {when === null && <span className="hint">Use a date like 1 Dec 2026.</span>}
              </div>
              <div className="f">
                <span className="lbl">In-app price (set in the stores)</span>
                <div className="inp ro">{`${nairaDec(plan.price_play_kobo, false)} · ${plan.play_product_id}`}</div>
              </div>
            </div>
            <div className="setrow">
              <span className="setrow__b">
                <b>Existing subscribers keep the old price until renewal</b>
                <small>{`${subs} ${plan.name} subscriber${subscribers === 1 ? '' : 's'}`}</small>
              </span>
              <span className="switch on" role="switch" aria-checked="true" aria-disabled="true" aria-label="Keep old price until renewal"></span>
            </div>
            <div className="f">
              <span className="lbl">2-step code</span>
              <Otp value={otp} onChange={setOtp} invalid={!!error} />
              <span className="hint">
                {error ??
                  (canEdit
                    ? 'A new price or credits waits for a second Super admin to confirm.'
                    : 'Only Super admins and Finance can change prices.')}
              </span>
            </div>
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button className="btn btn-p" type="button" disabled={pending || !valid || otp.length !== 6} onClick={save}>
            {pending ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </div>
    </section>
  );
}
