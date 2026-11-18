'use client';

import { useTransition } from 'react';
import { useToast } from '@/components/toast';
import { remindAuthor } from './actions';

/**
 * The Remind button and its toast. Once the author was reminded in the last day it shows `reminded`
 * instead; it stays mounted so the toast outlives the refresh.
 */
export function Remind({ revisionId, firstName, reminded }: { revisionId: string; firstName: string; reminded?: string }) {
  const [pending, start] = useTransition();
  const [toast, show] = useToast();
  return (
    <>
      {reminded ? (
        <span className="faint" style={{ fontSize: 12.5 }}>
          {reminded}
        </span>
      ) : (
        <button
          className="btn btn-g sm"
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await remindAuthor(revisionId);
              show(r.ok ? `Reminder sent to ${firstName} by push and email` : r.error!);
            })
          }
        >
          Remind
        </button>
      )}
      {toast}
    </>
  );
}
