'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { isPromoCode, naira } from '@arpedia/core';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { dayLabel, num, parseDay, type Plan } from '../../pricing/format';
import { createPromo, type NewPromo } from '../actions';

type Kind = NewPromo['kind'];

const KINDS: { key: Kind; title: string; sub: string; suffix: string }[] = [
  { key: 'bonus_credits', title: 'Bonus credits', sub: 'Extra credits when they redeem or pay', suffix: 'credits' },
  { key: 'plan_discount', title: 'Web plan discount', sub: 'Percent off a plan at web checkout', suffix: '% off' },
  { key: 'trial_days', title: 'Free trial days', sub: 'Reading days added before the first charge', suffix: 'days' },
];

function Check({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <label className="checkrow">
      <span
        className={on ? 'cb on' : 'cb'}
        role="checkbox"
        aria-checked={on}
        tabIndex={0}
        onClick={e => {
          e.preventDefault();
          onToggle();
        }}
        onKeyDown={e => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            onToggle();
          }
        }}
      />
      <span
        onClick={e => {
          e.preventDefault();
          onToggle();
        }}
      >
        {children}
      </span>
    </label>
  );
}

/** s-promo-new (rule 34): nothing goes live until Create promo code. The preview shows what a reader sees at checkout. */
export function NewPromoForm({
  plan,
  creditValueKobo,
  authorRateKobo,
}: {
  plan: Plan | null;
  creditValueKobo: number;
  authorRateKobo: number;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<Kind>('bonus_credits');
  const [amount, setAmount] = useState('100');
  const [uses, setUses] = useState('1,000');
  const [ends, setEnds] = useState('');
  const [newOnly, setNewOnly] = useState(true);
  const [webOnly, setWebOnly] = useState(true);
  const [starts, setStarts] = useState('');
  const [perReader, setPerReader] = useState('1');
  const [tag, setTag] = useState('');

  const digits = (s: string) => Number(s.replace(/,/g, ''));
  const amt = digits(amount);
  const max = uses.trim() === '' ? null : digits(uses);
  const startsAt = starts.trim() === '' ? null : parseDay(starts);
  const endsAt = ends.trim() === '' ? null : parseDay(ends);
  const k = KINDS.find(x => x.key === kind)!;
  const shownCode = code.trim().toUpperCase() || 'YOURCODE';

  const create = () => {
    if (!isPromoCode(code)) return show('Use 4 to 16 letters or numbers for the code.');
    if (!Number.isInteger(amt) || amt < 1) return show('Enter the amount as a whole number, 1 or more.');
    if (kind === 'plan_discount' && amt > 90) return show('A discount can be 1% to 90%.');
    if (max !== null && (!Number.isInteger(max) || max < 1)) return show('Total uses must be 1 or more. Leave it empty for no limit.');
    if (starts.trim() !== '' && !startsAt) return show('Write the start date like 1 Dec 2026.');
    if (ends.trim() !== '' && !endsAt) return show('Write the end date like 31 Dec 2026.');
    start(async () => {
      const r = await createPromo({
        code,
        kind,
        amount: amt,
        maxUses: max,
        usesPerReader: digits(perReader),
        newReadersOnly: newOnly,
        webOnly,
        startsAt,
        endsAt,
        campaignTag: tag,
      });
      if (!r.ok) return show(r.error);
      const live = startsAt && new Date(startsAt) > new Date() ? `It goes live on ${dayLabel(startsAt)}` : 'It is live now';
      router.push(`/promos?flash=${encodeURIComponent(`${shownCode} created. ${live}${newOnly ? ' for new readers' : ''}.`)}`);
    });
  };

  // Reader preview at web checkout, and the worst case if every use is redeemed.
  const price = plan?.price_web_kobo ?? 0;
  const off = kind === 'plan_discount' ? Math.round((price * amt) / 100) : 0;
  const today = kind === 'trial_days' ? 0 : price - off;
  const total = max ?? 0;
  const worst =
    kind === 'bonus_credits'
      ? `If all ${num(total)} uses are redeemed: ${num(amt * total)} credits, worth ${naira(amt * total * creditValueKobo)} at ${naira(creditValueKobo)}. Authors earn up to ${naira(amt * total * authorRateKobo)} as they are spent.`
      : kind === 'plan_discount'
        ? `If all ${num(total)} uses are redeemed: ${naira(off * total)} less in plan sales.`
        : `If all ${num(total)} uses are redeemed: ${num(amt * total)} free reading days given.`;

  return (
    <section className="screen enter">
      <div className="ph">
        <div className="crumbs">
          <Link href="/promos">Promo codes</Link>
          <Icon name="chev" size="s" />
          <span>New code</span>
        </div>
        <div className="ph__row">
          <div className="ph__title">
            <h1>New promo code</h1>
          </div>
          <div className="ph__acts">
            <Link className="btn btn-g" href="/promos">
              Cancel
            </Link>
            <button className="btn btn-p" type="button" disabled={pending} onClick={create}>
              {pending ? 'Creating…' : 'Create promo code'}
            </button>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="split">
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>What it gives</h2>
              </div>
              <div className="panel__body form">
                <div className="f">
                  <label htmlFor="pn-c">Code</label>
                  <div className="inp">
                    <input
                      id="pn-c"
                      className="mono"
                      value={code}
                      maxLength={16}
                      autoComplete="off"
                      autoCapitalize="characters"
                      placeholder="DECEMBER100"
                      onChange={e => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                    />
                  </div>
                  <span className="hint">Letters and numbers, 4 to 16 characters. Easy to say aloud.</span>
                </div>
                <div className="f">
                  <span className="lbl">What readers get</span>
                  <div className="radios" role="radiogroup" aria-label="What readers get">
                    {KINDS.map(o => (
                      <div
                        key={o.key}
                        className={`radio${kind === o.key ? ' is-selected' : ''}`}
                        role="radio"
                        aria-checked={kind === o.key}
                        tabIndex={0}
                        onClick={() => setKind(o.key)}
                        onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setKind(o.key))}
                      >
                        <span>
                          <b>{o.title}</b>
                          <small>{o.sub}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="fgrid">
                  <div className="f">
                    <label htmlFor="pn-v">Amount</label>
                    <div className="inp">
                      <input id="pn-v" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d,]/g, ''))} />
                      <span className="suf">{k.suffix}</span>
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="pn-l">Total uses</label>
                    <div className="inp">
                      <input id="pn-l" inputMode="numeric" value={uses} placeholder="No limit" onChange={e => setUses(e.target.value.replace(/[^\d,]/g, ''))} />
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="pn-e">Ends</label>
                    <div className="inp">
                      <input id="pn-e" value={ends} placeholder="31 Dec 2026" aria-invalid={ends.trim() !== '' && !endsAt} onChange={e => setEnds(e.target.value)} />
                      <Icon name="cal" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <details className="fold">
              <summary>
                More options <small>who can use it, start date, campaign tag</small>
              </summary>
              <div className="fold__b form">
                <Check on={newOnly} onToggle={() => setNewOnly(v => !v)}>
                  New readers only (never had a subscription)
                </Check>
                <Check on={webOnly} onToggle={() => setWebOnly(v => !v)}>
                  Web checkout only
                </Check>
                <div className="fgrid">
                  <div className="f">
                    <label htmlFor="pn-s">Starts</label>
                    <div className="inp">
                      <input id="pn-s" value={starts} placeholder="Now" aria-invalid={starts.trim() !== '' && !startsAt} onChange={e => setStarts(e.target.value)} />
                      <Icon name="cal" />
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="pn-p">Uses per reader</label>
                    <div className="inp">
                      <input id="pn-p" inputMode="numeric" value={perReader} onChange={e => setPerReader(e.target.value.replace(/[^\d]/g, ''))} />
                    </div>
                  </div>
                  <div className="f">
                    <label htmlFor="pn-t">
                      Campaign tag <span className="opt">optional</span>
                    </label>
                    <div className="inp">
                      <input id="pn-t" value={tag} placeholder="december-2026" onChange={e => setTag(e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>Reader preview</h2>
                <span className="sub">At web checkout</span>
              </div>
              <div className="panel__body">
                {plan ? (
                  <div className="mn-preview">
                    <div className="row between">
                      <span>{plan.name}</span>
                      <b>{naira(price)}</b>
                    </div>
                    <div className="mn-codebox">
                      <span>{shownCode}</span>
                      <span>Applied</span>
                    </div>
                    <div className="muted">
                      {kind === 'bonus_credits'
                        ? `+${num(amt || 0)} bonus credits added after payment`
                        : kind === 'plan_discount'
                          ? `${amt || 0}% off, ${naira(off)} less`
                          : `${num(amt || 0)} free reading days before the first charge`}
                    </div>
                    <div className="row between">
                      <span>Total today</span>
                      <b>{naira(today)}</b>
                    </div>
                    {max !== null && max > 0 && <div className="muted">{worst}</div>}
                  </div>
                ) : (
                  <div className="empty" style={{ padding: '24px' }}>
                    <b>No plan to preview</b>
                    <span>The preview shows here once plans are set up.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {toast}
    </section>
  );
}
