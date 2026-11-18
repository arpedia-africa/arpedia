'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/** A table row that opens its book, like the prototype's `tr[data-go]`; links inside keep working. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      data-go
      onClick={e => {
        if (!(e.target as HTMLElement).closest('a,button')) router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
