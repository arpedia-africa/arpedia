'use client';

import { useRouter } from 'next/navigation';

/** Filter chips: buttons as in the prototype (`.fchip` has no link styles), each one opening a URL. */
export function FChips({ items }: { items: { href: string; label: string; count?: string; on: boolean }[] }) {
  const router = useRouter();
  return (
    <div className="row">
      {items.map(i => (
        <button key={i.label} type="button" className={`fchip${i.on ? ' is-selected' : ''}`} aria-pressed={i.on} onClick={() => router.push(i.href)}>
          {i.label}
          {i.count !== undefined && <> <span className="c">{i.count}</span></>}
        </button>
      ))}
    </div>
  );
}
