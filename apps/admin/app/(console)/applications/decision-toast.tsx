'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/toast';

/** The confirmation toast on return to the queue after a decision, shown once. */
export function DecisionToast({ msg }: { msg: string }) {
  const [toast, show] = useToast();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    // Drop the query without a server round trip, so a reload does not show the toast again.
    const url = new URL(window.location.href);
    for (const k of ['asked', 'approved', 'rejected', 'again']) url.searchParams.delete(k);
    window.history.replaceState(null, '', url);
    show(msg);
  }, [msg, show]);
  return toast;
}
