'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { Menu } from '../../menu';
import { approveUpdate, auditFastLane, revert } from './actions';
import type { Passage, Seg } from './diff';

function Runs({ segs }: { segs: Seg[] }) {
  return (
    <p>
      {segs.map((s, k) => {
        const gap = k > 0 && !(segs[k - 1]!.t === 'del' && s.t === 'ins') ? ' ' : '';
        return (
          <Fragment key={k}>
            {gap}
            {s.t === 'del' ? <del>{s.s}</del> : s.t === 'ins' ? <ins>{s.s}</ins> : s.s}
          </Fragment>
        );
      })}
    </p>
  );
}

/** "What changed in chapter 14": one changed passage at a time, Next change steps through them. */
export function Changes({ passages, size }: { passages: Passage[]; size: string }) {
  const [at, setAt] = useState(0);
  const p = passages[at]!;
  return (
    <div className="panel">
      <div className="panel__head">
        <h2>{`What changed in ${p.where}`}</h2>
      </div>
      <div className="panel__body">
        <div className="diff stack s8">
          {p.paras.map((segs, k) => (
            <Runs key={k} segs={segs} />
          ))}
        </div>
        <div className="row">
          <span className="muted">{`${size} · ${at + 1} of ${passages.length} changed passage${passages.length === 1 ? '' : 's'}`}</span>
          {passages.length > 1 && (
            <button className="btn btn-g sm" type="button" onClick={() => setAt(i => (i + 1) % passages.length)}>
              Next change
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Approve update publishes now and returns to the queue with the confirmation toast. */
export function ApproveUpdate({ revisionId, revisionNo }: { revisionId: string; revisionNo: number }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        className="btn btn-p"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await approveUpdate(revisionId);
            if (!r.ok) return show(r.error);
            router.push(`/books?published=${revisionId}&update=${revisionNo}`);
          })
        }
      >
        <Icon name="check" size="s" />
        Approve update
      </button>
      {toast}
    </>
  );
}

/** A reason modal in the prototype's markup, for Report a problem and Revert. */
function ReasonModal({
  title,
  intro,
  label,
  action,
  onClose,
  onSubmit,
}: {
  title: string;
  intro: string;
  label: string;
  action: string;
  onClose: () => void;
  onSubmit: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="screen overlay enter">
      <a className="backdrop" role="button" aria-label="Close" onClick={onClose}></a>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal__h">
          <div className="grow">
            <h2>{title}</h2>
            <p>{intro}</p>
          </div>
          <button className="ib" type="button" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__b">
          <div className="f full">
            <label htmlFor="reason">{label}</label>
            <textarea
              id="reason"
              className="inp ta"
              rows={3}
              value={text}
              maxLength={1000}
              onChange={e => setText(e.target.value)}
            ></textarea>
          </div>
          {error && (
            <span role="alert" style={{ color: 'var(--err)', fontSize: 13 }}>
              {error}
            </span>
          )}
        </div>
        <div className="modal__f">
          <button className="btn btn-g" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-p"
            type="button"
            disabled={pending || !text.trim()}
            onClick={() =>
              start(async () => {
                const e = await onSubmit(text);
                if (e) setError(e);
                else onClose();
              })
            }
          >
            {action}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Spot audit cell: "Due this week" opens Looks fine / Report a problem (rule 44). */
export function AuditCell({ revisionId, title, revisionNo }: { revisionId: string; title: string; revisionNo: number }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [problem, setProblem] = useState(false);
  return (
    <>
      <Menu link trigger="Due this week">
        <a
          role="button"
          onClick={async () => {
            const r = await auditFastLane(revisionId, false, null);
            if (!r.ok) return show(r.error);
            show(`${title} r${revisionNo} checked. Nothing to fix.`);
            router.refresh();
          }}
        >
          Looks fine
        </a>
        <a role="button" onClick={() => setProblem(true)}>
          Report a problem
        </a>
      </Menu>
      {problem && (
        <ReasonModal
          title="Report a problem"
          intro={`${title} r${revisionNo} went live through the fast lane. Publishers are told, and can revert it or write to the author.`}
          label="What is wrong"
          action="Report problem"
          onClose={() => setProblem(false)}
          onSubmit={async text => {
            const r = await auditFastLane(revisionId, true, text.trim());
            if (!r.ok) return r.error;
            router.refresh();
            return null;
          }}
        />
      )}
      {toast}
    </>
  );
}

/** Revert to the previous live revision, with a reason (rule 44). */
export function Revert({ revisionId, revisionNo, title }: { revisionId: string; revisionNo: number; title: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-g" type="button" onClick={() => setOpen(true)}>
        {`Revert to r${revisionNo}`}
      </button>
      {open && (
        <ReasonModal
          title={`Revert to r${revisionNo}`}
          intro={`Readers of ${title} move back to r${revisionNo} within a minute. Highlights stay on their paragraphs.`}
          label="Why you are reverting"
          action={`Revert to r${revisionNo}`}
          onClose={() => setOpen(false)}
          onSubmit={async text => {
            const r = await revert(revisionId, text);
            if (!r.ok) return r.error;
            show(`${title} is back on r${revisionNo}.`);
            router.refresh();
            return null;
          }}
        />
      )}
      {toast}
    </>
  );
}
