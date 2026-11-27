'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useToast } from '@/components/toast';
import { retryJob } from '../actions';

/** Retry a stuck job (12-14): sends its current step again; Operations admin and Super admin only. */
export function RetryJob({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        className="btn btn-g sm"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await retryJob(id);
            show(r.ok ? `${title} is being tried again.` : r.error!);
            if (r.ok) router.refresh();
          })
        }
      >
        Retry
      </button>
      {toast}
    </>
  );
}
