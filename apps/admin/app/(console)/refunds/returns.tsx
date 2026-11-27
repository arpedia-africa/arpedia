'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/toast';
import { decideReturn } from './actions';

/** Turn down / Approve for one chapter return waiting for Finance. */
export function ReturnDecision({ id, canDecide }: { id: string; canDecide: boolean }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideReturn(id, approve);
      show(r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    });
  return (
    <div
      className="row"
      style={{ justifyContent: 'flex-end' }}
      title={canDecide ? undefined : 'Only Finance and Super admins can decide a return.'}
    >
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
