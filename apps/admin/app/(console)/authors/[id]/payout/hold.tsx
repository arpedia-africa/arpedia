'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { requestYtdStatement, setPayoutHold, type PauseReason } from './actions';

export const PAUSE_REASONS: Record<PauseReason, string> = {
  account_dispute: 'Account dispute',
  suspected_fraud: 'Suspected fraud',
  author_request: 'Author request',
  other: 'Other',
};

/**
 * Header actions: Download statement (the latest cycle statement PDF, made after each released month),
 * and the ⋯ menu with Message, Year-to-date statement (made now, rule 27) and Pause payouts.
 */
export function PayoutHeadActions({
  author,
  name,
  statement,
}: {
  author: string;
  name: string;
  statement: { id: string; label: string } | null;
}) {
  const [toast, show] = useToast();
  const [making, start] = useTransition();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const first = name.split(' ')[0] || name;
  const failed = useSearchParams().get('statement') === 'failed';
  useEffect(() => {
    if (failed) show("The statement didn't download. Try again.");
  }, [failed, show]);
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
    <div className="ph__acts">
      {statement ? (
        <a className="btn btn-p" href={`/authors/${author}/payout/statements/${statement.id}`} title={`${statement.label} statement PDF`}>
          Download statement
        </a>
      ) : (
        <button className="btn btn-p" type="button" onClick={() => show(`No statement yet. One is made for ${first} after each released month.`)}>
          Download statement
        </button>
      )}
      <div className="mwrap" ref={ref}>
        <button className="ib" type="button" aria-expanded={open} aria-label="More actions" onClick={() => setOpen(o => !o)}>
          <Icon name="more" />
        </button>
        {open && (
          <div className="menu">
            <a role="button" tabIndex={0} onClick={() => router.push(`/authors/${author}`)}>
              {`Message ${first}`}
            </a>
            <a
              role="button"
              tabIndex={0}
              aria-disabled={making}
              onClick={() => {
                setOpen(false);
                start(async () => {
                  const r = await requestYtdStatement(author);
                  if (!r.ok) return show(r.error);
                  window.location.assign(`/authors/${author}/payout/statements/${r.id}`);
                });
              }}
            >
              Year-to-date statement
            </a>
            <a
              role="button"
              tabIndex={0}
              onClick={() => {
                // Pausing needs a reason, so this takes Finance to the Hold panel's reason.
                setOpen(false);
                const el = document.getElementById('ap-r') ?? document.getElementById('ap-switch');
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el?.focus({ preventScroll: true });
              }}
            >
              Pause payouts
            </a>
          </div>
        )}
      </div>
      {toast}
    </div>
  );
}

/**
 * The Hold panel of s-author-payout: the switch and the reason it needs (rule 12). Turning it on
 * needs a reason; turning it off lifts the pause. Finance and Super admin only; others see it read-only.
 */
export function HoldPanel({
  author,
  name,
  paused,
  reason,
  setBy,
  note,
  canEdit,
}: {
  author: string;
  name: string;
  paused: boolean;
  reason: PauseReason | null;
  setBy: string | null;
  note: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<PauseReason | ''>(reason ?? '');
  const [why, setWhy] = useState('');

  const toggle = () => {
    if (!canEdit) return show('Only Finance and Super admins can pause payouts.');
    if (!paused && !pick) return show('Choose a reason to pause.');
    if (!paused && pick === 'other' && why.trim().length < 3) return show('Say why in a few words.');
    start(async () => {
      const r = await setPayoutHold(author, !paused, paused ? null : (pick as PauseReason), name, pick === 'other' ? why : '');
      show(r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="panel">
      <div className="panel__head">
        <h2>Hold</h2>
      </div>
      <div className="panel__body">
        <div className="setrow">
          <div className="setrow__b">
            <b>Pause payouts for this author</b>
            <small>Keeps their earnings until you turn it off</small>
          </div>
          <button
            className={`switch${paused ? ' on' : ''}`}
            type="button"
            role="switch"
            aria-checked={paused}
            aria-label="Pause payouts"
            id="ap-switch"
            disabled={pending}
            onClick={toggle}
          ></button>
        </div>
        <div className="f">
          <label htmlFor="ap-r">Reason (required to pause)</label>
          {paused ? (
            <span className="muted">{`${reason ? PAUSE_REASONS[reason] : 'No reason recorded'}${reason === 'other' && note ? `: ${note}` : ''}${setBy ? ` · paused by ${setBy}` : ''}`}</span>
          ) : (
            <>
              <div className="inp sel" style={{ position: 'relative' }}>
                <span>{pick ? PAUSE_REASONS[pick] : 'Choose a reason…'}</span>
                <Icon name="chevd" />
                <select
                  id="ap-r"
                  value={pick}
                  disabled={!canEdit}
                  onChange={e => setPick(e.target.value as PauseReason)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                >
                  <option value="" disabled>
                    Choose a reason…
                  </option>
                  {(Object.keys(PAUSE_REASONS) as PauseReason[]).map(k => (
                    <option key={k} value={k}>
                      {PAUSE_REASONS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <span className="hint">Account dispute, Suspected fraud, Author request, Other</span>
            </>
          )}
        </div>
        {!paused && pick === 'other' && (
          <div className="f">
            <label htmlFor="ap-why">Why (logged, not shown to the author)</label>
            <div className="inp">
              <input
                id="ap-why"
                value={why}
                maxLength={200}
                disabled={!canEdit}
                onChange={e => setWhy(e.target.value)}
                placeholder="A few words for the audit log"
              />
            </div>
          </div>
        )}
      </div>
      {toast}
    </div>
  );
}
