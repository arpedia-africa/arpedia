'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { ResendReceipt } from '../../transactions/receipt';
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

/** The header's More actions menu (s-subscription): Resend receipt for a web plan's latest payment. */
export function SubscriptionActions({ transactionId, name }: { transactionId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [toast, show] = useToast();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div className="mwrap" ref={ref}>
      <button className="ib" type="button" aria-expanded={open} aria-label="More actions" onClick={() => setOpen(o => !o)}>
        <Icon name="more" />
      </button>
      {/* Kept mounted while the resend runs, so its answer can still show. */}
      <div className="menu" hidden={!open}>
        <ResendReceipt
          item
          transactionId={transactionId}
          name={name}
          onDone={message => {
            setOpen(false);
            show(message);
          }}
        />
      </div>
      {toast}
    </div>
  );
}
