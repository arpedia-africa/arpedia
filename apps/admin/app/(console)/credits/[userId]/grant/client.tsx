'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import type { StaffRole } from '@arpedia/core';
import { BIG, approverOf, canRemove, grantMessage, grantTier } from '@/lib/grant-rules';
import { grantCredits, removeCredits } from '../../actions';

const QUICK = [45, 90, 135, 180];
const REASONS = ['Failed unlock', 'Goodwill', 'Contest prize', 'Correction', 'Other'];
const n0 = (n: number) => n.toLocaleString('en-NG');

/**
 * Grant or remove credits (s-user-grant), flow 14 rule 38. Support adds up to 200 at once,
 * Operations and Super admins up to 500; above that the button asks a second person and nothing is
 * added (and the reader isn't told) until they approve. Removing is Finance's and Super admins',
 * up to 500 at once, never below zero. "Tell the reader" sends the preview once the credits are in.
 */
export function GrantModal({
  userId,
  name,
  firstName,
  balance,
  role,
}: {
  userId: string;
  name: string;
  firstName: string;
  balance: number;
  role: StaffRole;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const tier = grantTier(role);
  const mayRemove = canRemove(role);
  const [mode, setMode] = useState<'add' | 'remove'>(tier > 0 || !mayRemove ? 'add' : 'remove');
  const [amount, setAmount] = useState('90');
  const [reason, setReason] = useState(REASONS[0]!);
  const [note, setNote] = useState('');
  const [tell, setTell] = useState(true);
  const closeHref = `/credits/${userId}`;
  const credits = Number(amount) || 0;
  const adding = mode === 'add';
  const limit = adding ? tier : BIG;
  const needsApproval = credits > limit;
  const tooMany = !adding && credits > balance;
  const message = grantMessage(firstName, credits, reason);
  const allowed = adding ? tier > 0 : mayRemove;

  const submit = () =>
    start(async () => {
      const why = note.trim() ? `${reason}: ${note.trim()}` : reason;
      const r = adding
        ? await grantCredits(userId, credits, why, tell, message)
        : await removeCredits(userId, credits, why);
      if (!r.ok) return show(r.error);
      router.push(`${closeHref}?done=${encodeURIComponent(r.message)}`);
    });

  const hint = !allowed
    ? adding
      ? 'Your role can’t add credits.'
      : 'Only Finance and Super admins can remove credits.'
    : tooMany
      ? `${firstName || 'This reader'} has ${n0(balance)} credits. A balance never goes below zero.`
      : `New balance ${n0(adding ? balance + credits : balance - credits)}. Up to ${limit} applies straight away.`;

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal" role="dialog" aria-label="Grant or remove credits">
        <div className="modal__h">
          <div className="grow">
            <h2>Grant or remove credits</h2>
            <p>{`${name} · balance ${n0(balance)}`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="seg">
            <button type="button" className={adding ? 'is-selected' : undefined} aria-pressed={adding} onClick={() => setMode('add')}>
              Add credits
            </button>
            <button
              type="button"
              className={adding ? undefined : 'is-selected'}
              aria-pressed={!adding}
              onClick={() => setMode('remove')}
            >
              Remove credits
            </button>
          </div>
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
            <span className="hint">{hint}</span>
          </div>
          {allowed && needsApproval && !tooMany && (
            <div className="note warn">
              <div className="grow">
                <b>{`More than ${limit} needs a second approver`}</b>
                {adding
                  ? `${approverOf('add', credits)[0]!.toUpperCase()}${approverOf('add', credits).slice(1)} has to approve. Nothing is added until then, and ${firstName || 'the reader'} is not told yet.`
                  : 'A second Finance or Super admin has to approve. Nothing is removed until then.'}
              </div>
            </div>
          )}
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
          {adding && (
            <>
              <div className="setrow">
                <div className="setrow__b">
                  <b>Tell the reader</b>
                  <small>Sends a push and an in-app message</small>
                </div>
                <button
                  type="button"
                  className={`switch${tell ? ' on' : ''}`}
                  role="switch"
                  aria-checked={tell}
                  aria-label="Notify reader"
                  onClick={() => setTell(t => !t)}
                ></button>
              </div>
              {tell && (
                <div className="pp-prev">
                  <small>Preview</small>
                  {message}
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button
            className="btn btn-p"
            type="button"
            disabled={pending || credits < 1 || !allowed || tooMany}
            onClick={submit}
          >
            {needsApproval ? 'Ask for approval' : `${adding ? 'Add' : 'Remove'} ${n0(credits)} credits`}
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
