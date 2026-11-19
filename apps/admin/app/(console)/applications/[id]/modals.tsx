'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { decide } from '../actions';

function Shell({
  title,
  sub,
  closeHref,
  danger,
  children,
  footer,
  toast,
}: {
  title: string;
  sub: string;
  closeHref: string;
  danger?: boolean;
  children: React.ReactNode;
  footer: React.ReactNode;
  toast: React.ReactNode;
}) {
  return (
    <section className="screen overlay enter">
      <Link className="backdrop" href={closeHref} aria-label="Close"></Link>
      <div className={`modal${danger ? ' danger' : ''}`} role="dialog" aria-label={title}>
        <div className="modal__h">
          <div className="grow">
            <h2>{title}</h2>
            <p>{sub}</p>
          </div>
          <Link className="ib" href={closeHref} aria-label="Close">
            <Icon name="x" />
          </Link>
        </div>
        <div className="modal__b">{children}</div>
        <div className="modal__f">{footer}</div>
      </div>
      {toast}
    </section>
  );
}

const first = (name: string) => name.split(' ')[0] || name;

/** Ask applicant for info (s-application-info): tick what is missing, edit the message, send. */
export function AskInfoModal({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const closeHref = `/applications/${id}`;
  const ASKS = [
    { key: 'sample', label: 'A longer writing sample', text: 'a longer writing sample, about 3,000 words from one story', step: 3 },
    { key: 'bio', label: 'A fuller bio', text: 'a fuller bio', step: 2 },
    { key: 'id', label: 'A photo of their ID', text: 'a photo of your ID', step: 1 },
  ];
  const build = (keys: string[]) => {
    const wants = ASKS.filter(a => keys.includes(a.key)).map(a => a.text);
    const list = wants.length > 1 ? `${wants.slice(0, -1).join(', ')} and ${wants[wants.length - 1]}` : (wants[0] ?? '');
    return `Hi ${first(name)}, thank you for applying. Could you send ${list || 'a little more information'}? Reply in the app and we will look at it straight away.`;
  };
  const [keys, setKeys] = useState<string[]>(['sample']);
  const [msg, setMsg] = useState(build(['sample']));
  const toggle = (k: string) => {
    const next = keys.includes(k) ? keys.filter(x => x !== k) : [...keys, k];
    setKeys(next);
    setMsg(build(next));
  };
  const step = Math.min(...ASKS.filter(a => keys.includes(a.key)).map(a => a.step), 3);
  return (
    <Shell
      title={`Ask ${first(name)} for more info`}
      sub="Tick what is missing."
      closeHref={closeHref}
      toast={toast}
      footer={
        <>
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button
            className="btn btn-p"
            type="button"
            disabled={pending || !msg.trim()}
            onClick={() =>
              start(async () => {
                const r = await decide(id, { decision: 'ask_info', request: msg.trim(), step });
                if (!r.ok) return show(r.error);
                router.push(`/applications?asked=${id}`);
              })
            }
          >
            Send message
          </button>
        </>
      }
    >
      <div className="stack s8">
        {ASKS.map(a => (
          <span
            key={a.key}
            className="checkrow"
            onClick={() => toggle(a.key)}
            onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), toggle(a.key))}
          >
            <span className={`cb${keys.includes(a.key) ? ' on' : ''}`} role="checkbox" aria-checked={keys.includes(a.key)} tabIndex={0}></span>
            {a.label}
          </span>
        ))}
      </div>
      <div className="f">
        <label htmlFor="pp-im">{`Message to ${first(name)}`}</label>
        <textarea id="pp-im" className="inp ta" value={msg} maxLength={1000} onChange={e => setMsg(e.target.value)} />
        <span className="hint">They get a push and an email. Nothing is rejected.</span>
      </div>
    </Shell>
  );
}

/** Approve application (s-application-approve): what happens, and an editable welcome message. */
export function ApproveModal({ id, name, club }: { id: string; name: string; club: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const closeHref = `/applications/${id}`;
  const [msg, setMsg] = useState(
    `Hi ${first(name)}, congratulations. You are now an Arpedia author. Open Author Studio to upload your first book, add your payout account, and say hello in your new community channel. We are glad to have you.`,
  );
  return (
    <Shell
      title={`Approve ${name}`}
      sub="Here is what happens when you approve."
      closeHref={closeHref}
      toast={toast}
      footer={
        <>
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button
            className="btn btn-ok"
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await decide(id, { decision: 'approve', message: msg });
                if (!r.ok) return show(r.error);
                router.push(`/applications?approved=${id}`);
              })
            }
          >
            Approve author
          </button>
        </>
      }
    >
      <div className="list">
        <div className="li">
          <span className="li__body">
            <b>Author Studio is unlocked</b>
            <small>They can upload books and add a payout account</small>
          </span>
        </div>
        <div className="li">
          <span className="li__body">
            <b>Community channel created</b>
            <small>{`“${club}”`}</small>
          </span>
        </div>
        <div className="li">
          <span className="li__body">
            <b>Push and email sent</b>
            <small>Welcome message below</small>
          </span>
        </div>
        <div className="li">
          <span className="li__body">
            <b>Verified badge stays off</b>
            <small>Turns on after their first book is published</small>
          </span>
        </div>
      </div>
      <div className="f">
        <label htmlFor="pp-wm">Welcome message</label>
        <textarea id="pp-wm" className="inp ta" value={msg} maxLength={1000} onChange={e => setMsg(e.target.value)} />
      </div>
    </Shell>
  );
}

const REASONS = [
  {
    label: 'Sample not ready',
    text: 'the writing sample is not yet ready for our readers. We would love to see you apply again with a polished sample.',
  },
  { label: 'Incomplete details', text: 'some of the details on your application were missing or unclear.' },
  { label: 'Duplicate application', text: 'we already have an application or an account for you.' },
  { label: 'Against our content policy', text: 'your sample does not fit our content policy.' },
];

/** Reject application (s-application-reject): a reason, the message the applicant sees, reapply after 30 days. */
export function RejectModal({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const closeHref = `/applications/${id}`;
  const build = (i: number) =>
    `Hi ${first(name)}, thank you for applying. We are not able to accept your application this time because ${REASONS[i]!.text}`;
  const [reason, setReason] = useState(0);
  const [msg, setMsg] = useState(build(0));
  const [again, setAgain] = useState(true);
  return (
    <Shell
      title={`Reject ${name}'s application`}
      sub="They will be told why, kindly."
      closeHref={closeHref}
      danger
      toast={toast}
      footer={
        <>
          <Link className="btn btn-g" href={closeHref}>
            Cancel
          </Link>
          <button
            className="btn btn-dd"
            type="button"
            disabled={pending || !msg.trim()}
            onClick={() =>
              start(async () => {
                const r = await decide(id, { decision: 'reject', reason: msg.trim(), allowReapply: again });
                if (!r.ok) return show(r.error);
                router.push(`/applications?rejected=${id}${again ? '&again=1' : ''}`);
              })
            }
          >
            Reject application
          </button>
        </>
      }
    >
      <div className="f">
        <label htmlFor="pp-rr">Reason</label>
        <div className="inp sel">
          <select
            id="pp-rr"
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
      </div>
      <div className="f">
        <label htmlFor="pp-rm">Message to the applicant</label>
        <textarea id="pp-rm" className="inp ta" value={msg} maxLength={1000} onChange={e => setMsg(e.target.value)} />
      </div>
      <div className="setrow">
        <div className="setrow__b">
          <b>Allow them to apply again after 30 days</b>
          <small>They see the date in the app</small>
        </div>
        <button
          className={`switch${again ? ' on' : ''}`}
          role="switch"
          aria-checked={again}
          aria-label="Allow reapply"
          onClick={() => setAgain(v => !v)}
        ></button>
      </div>
    </Shell>
  );
}
