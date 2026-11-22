'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useToast } from '@/components/toast';
import { extendSubscription } from './actions';

const DAYS = [7, 14, 30];

/** Grant free days (s-subscription, rule 33): Extend by 7, 14 or 30 days. The reader is sent a push. */
export function ExtendPanel({ id, name, canExtend }: { id: string; name: string; canExtend: boolean }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [days, setDays] = useState(7);

  const submit = () =>
    start(async () => {
      const r = await extendSubscription(id, days, name);
      show(r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="panel">
      <div className="panel__head">
        <h2>Grant free days</h2>
      </div>
      <div className="panel__body">
        <div className="radios h" role="radiogroup" aria-label="Free days">
          {DAYS.map(d => (
            <div
              key={d}
              className={`radio${days === d ? ' is-selected' : ''}`}
              role="radio"
              aria-checked={days === d}
              tabIndex={0}
              onClick={() => setDays(d)}
              onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setDays(d))}
            >
              <span>
                <b>{`${d} days`}</b>
              </span>
            </div>
          ))}
        </div>
        <button className="btn btn-p block" type="button" disabled={pending || !canExtend} onClick={submit}>
          {`Extend by ${days} days`}
        </button>
        {!canExtend && <span className="hint">Finance and Super admins can extend a subscription.</span>}
      </div>
      {toast}
    </div>
  );
}
