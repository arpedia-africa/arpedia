'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { grantCredits } from '../../actions';

const QUICK = [45, 90, 135, 180];
const REASONS = ['Failed unlock', 'Goodwill', 'Contest prize', 'Correction', 'Other'];
const LIMIT = 500;
const n0 = (n: number) => n.toLocaleString('en-NG');

/**
 * Grant credits (s-user-grant). Up to 500 credits apply at once; over 500 the button asks a second
 * approver (Finance or Super admin) and nothing is added until they say yes (rule 28).
 */
export function GrantModal({ userId, name, balance }: { userId: string; name: string; balance: number }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState('90');
  const [reason, setReason] = useState(REASONS[0]!);
  const [note, setNote] = useState('');
  const closeHref = `/credits/${userId}`;
  const credits = Number(amount) || 0;
  const needsApproval = credits > LIMIT;

  const submit = () =>
    start(async () => {
      const r = await grantCredits(userId, credits, note.trim() ? `${reason}: ${note.trim()}` : reason);
      if (!r.ok) return show(r.error);
      router.push(`${closeHref}?done=${encodeURIComponent(r.message)}`);
    });

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal" role="dialog" aria-label="Grant credits">
        <div className="modal__h">
          <div className="grow">
            <h2>Grant credits</h2>
            <p>{`${name} · balance ${n0(balance)}`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="f">
            <span className="lbl">Amount</span>
            <div className="pp-amt">
              <div className="pp-quick">
                {QUICK.map(q => (
                  <button
                    key={q}
                    type="button"
                    className={`fchip${credits === q ? ' is-selected' : ''}`}
                    onClick={() => setAmount(String(q))}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <span className="muted">or</span>
              <div className="inp">
                <input
                  inputMode="numeric"
                  value={amount}
                  aria-label="Custom amount"
                  onChange={e => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                />
                <span className="suf">credits</span>
              </div>
            </div>
            <span className="hint">
              {needsApproval
                ? `Over ${LIMIT} needs a second approver. Nothing is added until they approve.`
                : `New balance ${n0(balance + credits)}. Up to ${LIMIT} applies straight away.`}
            </span>
          </div>
          <div className="f">
            <label htmlFor="gr-reason">Reason</label>
            <div className="inp">
              <select id="gr-reason" value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <span className="hint">Goes in the ledger and the audit log.</span>
          </div>
          <div className="f">
            <label htmlFor="gr-note">
              Note <span className="opt">(staff only)</span>
            </label>
            <textarea
              id="gr-note"
              className="inp ta"
              value={note}
              maxLength={300}
              onChange={e => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button className="btn btn-p" type="button" disabled={pending || credits < 1} onClick={submit}>
            {needsApproval ? 'Ask for approval' : `Add ${n0(credits)} credits`}
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
