'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { actionLabel, AREAS, filterHref, RANGES, type AuditFilters } from './shared';

type Sub = 'actor' | 'area' | 'action' | 'days' | null;

const ACTION_TYPES = [
  'staff.',
  'policy.',
  'config.',
  'flag.',
  'copy.',
  'integration.',
  'pricing_rules.',
  'grant_credits',
  'return_chapter',
  'audit.export',
];
const typeLabel = (a: string) => (a.endsWith('.') ? `${a[0]!.toUpperCase()}${a.slice(1, -1).replace(/_/g, ' ')} changes` : actionLabel(a));

/**
 * s-audit toolbar: search, one Filters button (staff member, area, action type, date range) and the
 * active filters as removable chips. Every filter is in the URL.
 */
export function AuditToolbar({ filters: f, actors }: { filters: AuditFilters; actors: { id: string; name: string | null }[] }) {
  const router = useRouter();
  const [q, setQ] = useState(f.q);
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<Sub>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(f.q), [f.q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (q === f.q) return;
    const t = setTimeout(() => router.replace(filterHref(f, { q: q.trim() })), 350);
    return () => clearTimeout(t);
  }, [q, f, router]);

  const go = (change: Partial<AuditFilters>) => {
    setOpen(false);
    setSub(null);
    router.push(filterHref(f, change));
  };

  const actorName = actors.find(a => a.id === f.actor)?.name ?? 'One staff member';
  const chips: { label: string; clear: Partial<AuditFilters> }[] = [
    ...(f.actor ? [{ label: actorName, clear: { actor: '' } }] : []),
    ...(f.area ? [{ label: AREAS[f.area]!, clear: { area: '' } }] : []),
    ...(f.action ? [{ label: typeLabel(f.action), clear: { action: '' } }] : []),
  ];

  return (
    <div className="toolbar">
      <label className="search">
        <Icon name="search" />
        <input
          placeholder="Search action or object"
          aria-label="Search audit log"
          value={q}
          maxLength={80}
          onChange={e => setQ(e.target.value)}
        />
      </label>
      <div className="mwrap" ref={ref}>
        <button
          className="fbtn"
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(o => !o);
            setSub(null);
          }}
        >
          <Icon name="filter" />
          Filters
        </button>
        {open && (
          <div className="menu sy-menul">
            {sub === null && (
              <>
                <a role="button" onClick={() => setSub('actor')}>
                  Staff member
                </a>
                <a role="button" onClick={() => setSub('area')}>
                  Area
                </a>
                <a role="button" onClick={() => setSub('action')}>
                  Action type
                </a>
                <a role="button" onClick={() => setSub('days')}>
                  Date range
                </a>
              </>
            )}
            {sub === 'actor' &&
              (actors.length ? (
                actors.map(a => (
                  <a role="button" key={a.id} onClick={() => go({ actor: a.id })}>
                    {a.name ?? 'Unnamed staff'}
                  </a>
                ))
              ) : (
                <a aria-disabled>No staff actions in 90 days</a>
              ))}
            {sub === 'area' &&
              Object.entries(AREAS).map(([k, label]) => (
                <a role="button" key={k} onClick={() => go({ area: k })}>
                  {label}
                </a>
              ))}
            {sub === 'action' &&
              ACTION_TYPES.map(a => (
                <a role="button" key={a} onClick={() => go({ action: a })}>
                  {typeLabel(a)}
                </a>
              ))}
            {sub === 'days' &&
              Object.entries(RANGES).map(([d, label]) => (
                <a role="button" key={d} onClick={() => go({ days: Number(d) })}>
                  {label}
                </a>
              ))}
          </div>
        )}
      </div>
      <span className="achip">
        {RANGES[f.days]}
        {/* As in the prototype: removing the 7-day default widens to 30 days; any other range goes back to 7. */}
        <button type="button" aria-label="Remove filter" onClick={() => go({ days: f.days === 7 ? 30 : 7 })}>
          <Icon name="x" />
        </button>
      </span>
      {chips.map(c => (
        <span className="achip" key={c.label}>
          {c.label}
          <button type="button" aria-label="Remove filter" onClick={() => go(c.clear)}>
            <Icon name="x" />
          </button>
        </span>
      ))}
    </div>
  );
}
