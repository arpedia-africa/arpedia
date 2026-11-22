'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useToast } from '@/components/toast';

/** Shows a toast that was sent through the URL after a save, then clears the URL so a refresh doesn't repeat it. */
export function FlashToast({ message, clearHref }: { message: string | null; clearHref: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  useEffect(() => {
    if (!message) return;
    show(message);
    router.replace(clearHref, { scroll: false });
  }, [message, clearHref, router, show]);
  return <>{toast}</>;
}
