'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { setPayoutHold, type PauseReason } from './actions';

export const PAUSE_REASONS: Record<PauseReason, string> = {
  account_dispute: 'Account dispute',
  suspected_fraud: 'Suspected fraud',
  author_request: 'Author request',
  other: 'Other',
};

/**
 * Header actions: Download statement, and the ⋯ menu with Message and Pause payouts. Statement PDFs
 * are rendered after release (statements_after_release, not built yet), so until one exists it says so.
 */
export function PayoutHeadActions({ name, statement }: { name: string; statement: string | null }) {
  const [toast, show] = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const first = name.split(' ')[0] || name;
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
  const pick = (msg: string) => () => {
    setOpen(false);
    show(msg);
  };
  return (
    <div className="ph__acts">
      <button
        className="btn btn-p"
        type="button"
        onClick={() =>
          show(statement ? `The ${statement} statement PDF is being prepared. It downloads from here once ready.` : `No statement yet. One is made for ${first} after each released month.`)
        }
      >
        Download statement
      </button>
      <div className="mwrap" ref={ref}>
        <button className="ib" type="button" aria-expanded={open} aria-label="More actions" onClick={() => setOpen(o => !o)}>
          <Icon name="more" />
        </button>
        {open && (
          <div className="menu">
            <a role="button" tabIndex={0} onClick={pick('Messages to authors arrive with reader messages (flow 08).')}>
              {`Message ${first}`}
            </a>
            <a role="button" tabIndex={0} onClick={pick('Choose a reason under Hold, then turn on Pause payouts.')}>
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
  canEdit,
}: {
  author: string;
  name: string;
  paused: boolean;
  reason: PauseReason | null;
  setBy: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState<PauseReason | ''>(reason ?? '');

  const toggle = () => {
    if (!canEdit) return show('Only Finance and Super admins can pause payouts.');
    if (!paused && !pick) return show('Choose a reason to pause.');
    start(async () => {
      const r = await setPayoutHold(author, !paused, paused ? null : (pick as PauseReason), name);
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
            disabled={pending}
            onClick={toggle}
          ></button>
        </div>
        <div className="f">
          <label htmlFor="ap-r">Reason (required to pause)</label>
          {paused ? (
            <span className="muted">{`${reason ? PAUSE_REASONS[reason] : 'No reason recorded'}${setBy ? ` · paused by ${setBy}` : ''}`}</span>
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
      </div>
      {toast}
    </div>
  );
}
