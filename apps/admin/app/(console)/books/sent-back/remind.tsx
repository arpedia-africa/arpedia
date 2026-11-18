'use client';

import { useEffect, useState, useTransition } from 'react';
import { remindAuthor } from './actions';

/**
 * The Remind button and its toast (the prototype's `data-toast`, shown for 4.5 s). Once the author was
 * reminded in the last day it shows `reminded` instead; it stays mounted so the toast outlives the refresh.
 */
export function Remind({ revisionId, firstName, reminded }: { revisionId: string; firstName: string; reminded?: string }) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <>
      {reminded ? (
        <span className="faint">{reminded}</span>
      ) : (
        <button
          className="btn btn-g sm"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await remindAuthor(revisionId);
              setToast(r.ok ? `Reminder sent to ${firstName} by push and email` : r.error!);
            })
          }
        >
          Remind
        </button>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}
