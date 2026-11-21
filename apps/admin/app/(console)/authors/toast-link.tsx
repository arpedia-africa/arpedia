'use client';

import type { ReactNode } from 'react';
import { useToast } from '@/components/toast';

/**
 * An inline link or button that says which later flow brings the feature (the prototype's
 * `data-toast`), for actions whose data or server side belongs to another flow.
 */
export function ToastLink({
  msg,
  children,
  className = 'link',
}: {
  msg: string;
  children: ReactNode;
  className?: string;
}) {
  const [toast, show] = useToast();
  return (
    <>
      <a
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
        className={className}
        onClick={() => show(msg)}
        onKeyDown={e => e.key === 'Enter' && show(msg)}
      >
        {children}
      </a>
      {toast}
    </>
  );
}
