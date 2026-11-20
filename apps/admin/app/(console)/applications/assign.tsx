'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/toast';
import { assignToMe } from './actions';

/** Assign to me: a link in the Assigned cell (the table row keeps its own click). */
export function AssignMe({ id, name, button }: { id: string; name: string; button?: boolean }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className={button ? 'btn btn-g sm' : 'link'}
        style={button ? undefined : { background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await assignToMe(id);
            if (!r.ok) return show(r.error);
            show(`${name} is yours to review.`);
            router.refresh();
          })
        }
      >
        Assign to me
      </button>
      {toast}
    </>
  );
}
