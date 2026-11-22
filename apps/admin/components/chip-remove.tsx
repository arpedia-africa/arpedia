'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';

/** The prototype's `.achip` ✕ button: drops one filter by going to the URL without it. */
export function ChipRemove({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button type="button" aria-label="Remove filter" onClick={() => router.push(href)}>
      <Icon name="x" />
    </button>
  );
}
