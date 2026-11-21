'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useTransition } from 'react';
import { useToast } from '@/components/toast';
import { sampleLink } from '../actions';

/** Open full sample: a 5-minute link to the file in R2, in a new tab. */
export function SampleButton({ id, name }: { id: string; name: string }) {
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-g sm"
        disabled={pending}
        onClick={() => {
          // Open the tab now (a click is needed to avoid the popup blocker), point it at the link after.
          const tab = window.open('', '_blank');
          start(async () => {
            const r = await sampleLink(id);
            if (!r.ok) {
              tab?.close();
              return show(r.error);
            }
            if (tab) tab.location.href = r.url;
            else show(`Allow pop-ups to open ${name}.`);
          });
        }}
      >
        {pending ? 'Opening…' : 'Open full sample'}
      </button>
      {toast}
    </>
  );
}

/** The decision bar (rule 8): Reject, Ask for info, Approve, and Skip to the next waiting application (J). */
export function DecideBar({
  id,
  position,
  total,
  skipHref,
  status,
}: {
  id: string;
  position: number;
  total: number;
  skipHref: string;
  status: string;
}) {
  const router = useRouter();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'j' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(input|textarea|select)$/i.test((e.target as HTMLElement).tagName)) return;
      router.push(skipHref);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [router, skipHref]);
  return (
    <div className="decide">
      <div className="decide__q">
        {total > 0 && position > 0 ? (
          <>
            Application{' '}
            <b>
              {position} of {total}
            </b>
          </>
        ) : status === 'approved' || status === 'rejected' ? (
          `Already ${status}`
        ) : (
          'Application'
        )}{' '}
        ·{' '}
        <Link className="link" href="/applications">
          Back to queue
        </Link>
        {status === 'needs_info' && ' · Waiting for the applicant to reply'}
      </div>
      <span className="grow"></span>
      {status === 'new' && (
        <>
          <Link className="btn btn-g" href={`/applications/${id}/reject`}>
            Reject
          </Link>
          <Link className="btn btn-g" href={`/applications/${id}/info`}>
            Ask for info
          </Link>
          <Link className="btn btn-p" href={`/applications/${id}/approve`}>
            Approve
          </Link>
        </>
      )}
      {total > 1 && (
        <Link className="btn btn-q sm" href={skipHref}>
          Skip <span className="kbd">J</span>
        </Link>
      )}
    </div>
  );
}
