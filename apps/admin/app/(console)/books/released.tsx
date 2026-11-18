'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useToast } from '@/components/toast';
import { undoRelease } from './actions';

/** After Mark fixed and send to review: the confirmation toast with Undo, shown once on return to the queue. */
export function Released({ id, title, firstName }: { id: string; title: string; firstName: string }) {
  const [toast, show] = useToast();
  const router = useRouter();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    // Drop ?released= without a server round trip, so a reload doesn't show the toast again.
    const url = new URL(window.location.href);
    url.searchParams.delete('released');
    window.history.replaceState(null, '', url);
    show(`${title} is ready for review. ${firstName} is told when it goes live.`, async () => {
      const r = await undoRelease(id);
      if (!r.ok) show(r.error!);
      else router.push(`/books/${id}/fix`);
    });
  }, [id, title, firstName, router, show]);
  return toast;
}
