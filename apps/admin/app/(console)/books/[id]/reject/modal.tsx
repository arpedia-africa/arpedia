'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { reject } from '../review/actions';

/** Rejection is for rights or policy, not formatting (rule 39); formatting goes through Send back. */
const REASONS = [
  { label: 'Not theirs to publish', text: 'you do not hold the rights to publish it on Arpedia.' },
  { label: 'Copied from another work', text: 'large parts of it are copied from another published work.' },
  { label: 'Against our content policy', text: 'it goes against our content policy.' },
];

/** Reject from Quick review: the same danger modal as Reject application, with a reason and a message. */
export function RejectModal({
  revisionId,
  title,
  author,
  closeHref,
}: {
  revisionId: string;
  title: string;
  author: string;
  closeHref: string;
}) {
  const first = author.split(' ')[0] || 'there';
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const build = (i: number) =>
    `Hi ${first}, thank you for sending us ${title}. We are not able to publish it because ${REASONS[i]!.text}`;
  const [reason, setReason] = useState(0);
  const [msg, setMsg] = useState(() => build(0));
  const label = `Reject ${title}`;

  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className="modal danger" role="dialog" aria-label={label}>
        <div className="modal__h">
          <div className="grow">
            <h2>{label}</h2>
            <p>{`${author || 'The author'} is told why by push and email. This can't be undone.`}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">
          <div className="f">
            <label htmlFor="bk-rr">Reason</label>
            <div className="inp sel">
              <select
                id="bk-rr"
                value={reason}
                style={{ appearance: 'none' }}
                onChange={e => {
                  setReason(Number(e.target.value));
                  setMsg(build(Number(e.target.value)));
                }}
              >
                {REASONS.map((r, i) => (
                  <option key={r.label} value={i}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Icon name="chevd" size="s" />
            </div>
            <span className="hint">Formatting problems are sent back, not rejected.</span>
          </div>
          <div className="f">
            <label htmlFor="bk-rm">Message to the author</label>
            <textarea id="bk-rm" className="inp ta" value={msg} maxLength={1000} onChange={e => setMsg(e.target.value)} />
          </div>
        </div>
        <div className="modal__f">
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button
            className="btn btn-dd"
            type="button"
            disabled={pending || !msg.trim()}
            onClick={() =>
              start(async () => {
                const r = await reject(revisionId, msg.trim());
                if (!r.ok) return show(r.error);
                router.push(`/books?rejected=${revisionId}`);
              })
            }
          >
            Reject book
          </button>
        </div>
      </div>
      {toast}
    </section>
  );
}
