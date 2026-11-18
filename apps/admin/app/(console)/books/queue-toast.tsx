'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useToast } from '@/components/toast';
import { undoRelease } from './actions';

/**
 * The confirmation toast on return to the queue, shown once: after Mark fixed and send to review
 * (with Undo, `undoId`), or after Send back.
 */
export function QueueToast({ msg, undoId }: { msg: string; undoId?: string }) {
  const [toast, show] = useToast();
  const router = useRouter();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    // Drop ?released= / ?sent= without a server round trip, so a reload doesn't show the toast again.
    const url = new URL(window.location.href);
    for (const k of ['released', 'sent', 'n', 'published', 'scheduled', 'quiet']) url.searchParams.delete(k);
    window.history.replaceState(null, '', url);
    show(
      msg,
      undoId
        ? async () => {
            const r = await undoRelease(undoId);
            if (!r.ok) show(r.error!);
            else router.push(`/books/${undoId}/fix`);
          }
        : undefined,
    );
  }, [msg, undoId, router, show]);
  return toast;
}
