'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { prepareCycle, recheckCycle } from '../actions';

export interface CsvLine {
  name: string;
  author_id: string;
  book_credits: number;
  tip_message_credits: number;
  amount_kobo: number;
  carry_in_kobo: number;
  adjustment_kobo: number;
  payable_kobo: number;
  status: string;
}

function downloadCsv(file: string, lines: CsvLine[]) {
  const q = (v: string | number) => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`);
  const head = ['Author', 'Author id', 'Book credits', 'Tips and messages', 'Earnings (₦)', 'Carried in (₦)', 'Adjustment (₦)', 'Payable (₦)', 'Status'];
  const rows = lines.map(l =>
    [l.name, l.author_id, l.book_credits, l.tip_message_credits, l.amount_kobo / 100, l.carry_in_kobo / 100, l.adjustment_kobo / 100, l.payable_kobo / 100, l.status]
      .map(q)
      .join(','),
  );
  const blob = new Blob([[head.map(q).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * s-royalty-cycle header actions: the main button (Prepare for Finance on a closed month, Review and
 * release for a Super admin on a prepared one) and the ⋯ menu (Recheck against ledger, Export CSV).
 */
export function CycleActions({
  id,
  month,
  file,
  status,
  canPrepare,
  canRelease,
  left = 0,
  lines,
}: {
  id: string;
  month: string;
  file: string;
  status: string;
  canPrepare: boolean;
  canRelease: boolean;
  /** Authors approved, not sent after a partial release (13-12). */
  left?: number;
  lines: CsvLine[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
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

  const recheck = () => {
    setOpen(false);
    start(async () => {
      const r = await recheckCycle(id, month);
      show(r.ok ? r.message : r.error);
    });
  };
  const prepare = () =>
    start(async () => {
      const r = await prepareCycle(id, month);
      show(r.ok ? r.message : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="ph__acts">
      {status === 'closed' && (
        <button className="btn btn-p" type="button" disabled={!canPrepare || pending} onClick={prepare}>
          {`Prepare ${month}`}
        </button>
      )}
      {(status === 'prepared' || status === 'approved') &&
        (canRelease ? (
          <Link className="btn btn-p" href={`/royalties/${id}/release`}>
            Review and release
          </Link>
        ) : (
          <button className="btn btn-p" type="button" disabled>
            Review and release
          </button>
        ))}
      {status === 'releasing' &&
        left > 0 &&
        (canRelease ? (
          <Link className="btn btn-p" href={`/royalties/${id}/release`}>
            Send the rest
          </Link>
        ) : (
          <button className="btn btn-p" type="button" disabled>
            Send the rest
          </button>
        ))}
      <div className="mwrap" ref={ref}>
        <button className="ib" type="button" aria-expanded={open} aria-label="More actions" onClick={() => setOpen(o => !o)}>
          <Icon name="more" />
        </button>
        {open && (
          <div className="menu">
            <a role="button" tabIndex={0} onClick={recheck}>
              Recheck against ledger
            </a>
            <a
              role="button"
              tabIndex={0}
              onClick={() => {
                setOpen(false);
                downloadCsv(file, lines);
                show(`${month} author earnings exported as CSV`);
              }}
            >
              Export CSV
            </a>
          </div>
        )}
      </div>
      {toast}
    </div>
  );
}
