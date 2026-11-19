'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/toast';

/** The confirmation toast after a money action, shown once; ?done= is dropped so a reload doesn't repeat it. */
export function Flash({ msg }: { msg: string }) {
  const [toast, show] = useToast();
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('done');
    window.history.replaceState(null, '', url);
    show(msg);
  }, [msg, show]);
  return toast;
}
