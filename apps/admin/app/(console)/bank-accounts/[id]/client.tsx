'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { reviewBankAccount } from '../actions';

const REASONS = [
  'Account name does not match',
  'Account belongs to someone else',
  'Bank could not confirm the account',
  'Document does not match the account',
];

/**
 * s-bank-account: the two panels come from the server as children; this holds the reject reason
 * (picked in the ID document panel) and the review bar (`.decide`: Account N of M, Ask for
 * document, Reject, Verify, Skip with J).
 */
export function BankReview({
  id,
  name,
  position,
  total,
  nextId,
  decided,
  left,
  idDocument,
  flash,
}: {
  id: string;
  name: string;
  position: number;
  total: number;
  nextId: string | null;
  decided: boolean;
  left: ReactNode;
  idDocument: ReactNode;
  flash?: string;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState(REASONS[0]!);

  useEffect(() => {
    if (!flash) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('done');
    window.history.replaceState(null, '', url);
    show(flash);
  }, [flash, show]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'j' || e.metaKey || e.ctrlKey) return;
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      if (nextId) router.push(`/bank-accounts/${nextId}`);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nextId, router]);

  const decide = (d: 'verify' | 'ask_document' | 'reject') =>
    start(async () => {
      const r = await reviewBankAccount(
        id,
        d,
        d === 'ask_document' ? 'Send an ID document that shows the name on the account' : reason,
        name,
      );
      if (!r.ok) return show(r.error);
      const done = encodeURIComponent(r.message);
      router.push(nextId ? `/bank-accounts/${nextId}?done=${done}` : `/bank-accounts?done=${done}`);
    });

  return (
    <>
      <div className="page">
        <div className="split">
          <div className="stack s20">{left}</div>
          <div className="stack s20">
            <div className="panel">
              <div className="panel__head">
                <h2>ID document</h2>
              </div>
              <div className="panel__body">
                {idDocument}
                {!decided && (
                  <div className="f">
                    <label htmlFor="ba-r">Reason if rejecting</label>
                    <div className="inp sel" style={{ position: 'relative' }}>
                      <span>{reason}</span>
                      <Icon name="chevd" />
                      <select
                        id="ba-r"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                      >
                        {REASONS.map(r => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="decide">
        <div className="decide__q">
          {position > 0 && (
            <>
              Account <b>{`${position} of ${total}`}</b>
              {' · '}
            </>
          )}
          <Link className="link" href="/bank-accounts">
            Back to queue
          </Link>
        </div>
        <span className="grow"></span>
        {!decided && (
          <>
            <button className="btn btn-g" type="button" disabled={pending} onClick={() => decide('ask_document')}>
              Ask for document
            </button>
            <button className="btn btn-d" type="button" disabled={pending} onClick={() => decide('reject')}>
              Reject
            </button>
            <button className="btn btn-p" type="button" disabled={pending} onClick={() => decide('verify')}>
              Verify
            </button>
          </>
        )}
        {nextId && (
          <Link className="btn btn-q sm" href={`/bank-accounts/${nextId}`}>
            Skip <span className="kbd">J</span>
          </Link>
        )}
      </div>
      {toast}
    </>
  );
}

