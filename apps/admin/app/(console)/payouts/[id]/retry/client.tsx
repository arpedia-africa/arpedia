'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { retryPayout } from '../../actions';

type Mode = 'same_account_confirmed' | 'new_account_when_verified';

/**
 * s-payout-retry: why it failed, the account on file, the bank's name, the legal name and any newer
 * account; pick where the money goes. Using the new account is the default when one exists.
 */
export function RetryModal(p: {
  id: string;
  name: string;
  amount: string;
  amountKobo: number;
  sub: string;
  why: string;
  onFile: string;
  bankName: string | null;
  legalName: string | null;
  newer: { label: string; status: string; href: string; resume: string | null } | null;
  sameAllowed: boolean;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>(p.newer || !p.sameAllowed ? 'new_account_when_verified' : 'same_account_confirmed');
  const first = p.name.split(' ')[0]!;

  const queue = () =>
    start(async () => {
      const r = await retryPayout(p.id, mode, p.amountKobo, p.name);
      if (!r.ok) return show(r.error);
      router.push(`/payouts?done=${encodeURIComponent(r.message)}`);
    });

  const radio = (m: Mode, title: string, small: string, disabled = false) => (
    <span
      className={`radio${mode === m ? ' is-selected' : ''}`}
      role="radio"
      aria-checked={mode === m}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && setMode(m)}
      onKeyDown={e => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) setMode(m);
      }}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <span>
        <b>{title}</b>
        <small>{small}</small>
      </span>
    </span>
  );

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href="/payouts" aria-label="Close"></Link>
      <div className="modal" role="dialog" aria-label={`Retry payout to ${p.name}`}>
        <div className="modal__h">
          <div className="grow">
            <h2>{`Retry ${p.amount} to ${p.name}`}</h2>
            <p>{p.sub}</p>
          </div>
          <Link className="ib" href="/payouts" aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <dl className="kv">
            <dt>Why it failed</dt>
            <dd>{p.why}</dd>
            <dt>Account on file</dt>
            <dd>{p.onFile}</dd>
            {p.bankName && (
              <>
                <dt>Name from the bank</dt>
                <dd>{p.bankName}</dd>
              </>
            )}
            {p.legalName && (
              <>
                <dt>Author&apos;s legal name</dt>
                <dd>{p.legalName}</dd>
              </>
            )}
            <dt>New account submitted</dt>
            <dd>
              {p.newer ? (
                <>
                  {`${p.newer.label} · `}
                  <Link className="link" href={p.newer.href}>
                    {p.newer.status}
                  </Link>
                </>
              ) : (
                'None yet'
              )}
            </dd>
          </dl>
          <div className="radios" role="radiogroup">
            {radio(
              'same_account_confirmed',
              'Retry the same account',
              p.sameAllowed ? `Only if ${first} says the account was fixed.` : `${first} has no verified account to send to.`,
              !p.sameAllowed,
            )}
            {radio(
              'new_account_when_verified',
              p.newer ? `Use the new ${p.newer.label.split(' ••••')[0]} account once verified` : 'Wait for a new account',
              p.newer
                ? `Sends as soon as verification passes.${p.newer.resume ? ` Paused until ${p.newer.resume}.` : ''}`
                : `Sends once ${first} adds an account and it is verified.`,
            )}
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href="/payouts">
            Cancel
          </Link>
          <button className="btn btn-p" type="button" disabled={pending} onClick={queue}>
            Queue the retry
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
