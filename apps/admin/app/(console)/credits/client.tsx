'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/toast';
import { decideGrant, freezeGiftLoop, setGiftingFrozen } from './actions';

/**
 * Freeze gifting in one tap, with Undo in the toast (rule 27). The freeze is app-wide, so every
 * Freeze gifting button does the same; once frozen the buttons turn into Unfreeze.
 */
export function FreezeGifting({ frozen }: { frozen: boolean }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();

  const set = (next: boolean) =>
    start(async () => {
      const r = await setGiftingFrozen(next);
      if (!r.ok) return show(r.error);
      show(r.message, next ? () => set(false) : undefined);
      router.refresh();
    });

  return (
    <>
      <button className="btn btn-g sm" type="button" disabled={pending} onClick={() => set(!frozen)}>
        {frozen ? 'Unfreeze gifting' : 'Freeze gifting'}
      </button>
      {toast}
    </>
  );
}

/**
 * Freeze gifting on a gift-loop row: also keeps the loop's credits out of author earnings and closes
 * the alert. Undo lifts the freeze only. When gifting is already frozen the button only does the
 * earnings part, so it says so.
 */
export function FreezeGiftLoop({ alertId, frozen }: { alertId: number; frozen: boolean }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await freezeGiftLoop(alertId, frozen);
      if (!r.ok) return show(r.error);
      show(
        r.message,
        r.froze
          ? () =>
              start(async () => {
                const u = await setGiftingFrozen(false);
                show(u.ok ? u.message : u.error);
                router.refresh();
              })
          : undefined,
      );
      router.refresh();
    });

  return (
    <>
      <button className="btn btn-g sm" type="button" disabled={pending} onClick={run}>
        {frozen ? 'Keep out of earnings' : 'Freeze gifting'}
      </button>
      {toast}
    </>
  );
}

/** Approve or turn down a grant over 500 credits. The person who asked cannot decide it. */
export function ApprovalButtons({ id, canDecide, why }: { id: string; canDecide: boolean; why: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();

  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideGrant(id, approve);
      show(r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="row" style={{ justifyContent: 'flex-end' }} title={canDecide ? undefined : why}>
      <button className="btn btn-g sm" type="button" disabled={pending || !canDecide} onClick={() => decide(false)}>
        Turn down
      </button>
      <button className="btn btn-p sm" type="button" disabled={pending || !canDecide} onClick={() => decide(true)}>
        Approve
      </button>
      {toast}
    </div>
  );
}
