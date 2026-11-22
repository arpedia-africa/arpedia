'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { Menu } from '../books/menu';
import {
  addNote,
  cancelDeletion,
  revealContact,
  sendPasswordReset,
  setRole,
  signOutAll,
  signOutDevice,
  startDeletion,
} from './actions';

// Flow 10 · client pieces of the reader pages: the header actions and ⋯ menu, the delete modal,
// the phone reveal, staff notes and per-device Sign out.

const first = (name: string) => name.split(' ')[0] || 'The reader';

export function ReaderActions({
  id,
  name,
  isAuthor,
  canAct,
  canChangeRole,
  canDelete,
  deleted,
  devices,
}: {
  id: string;
  name: string;
  isAuthor: boolean;
  canAct: boolean;
  canChangeRole: boolean;
  canDelete: boolean;
  deleted: boolean;
  devices: number;
}) {
  const [toast, show] = useToast();
  const [, start] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const run = (p: Promise<{ ok?: boolean; error?: string; value?: string }>, ok: (v?: string) => string) =>
    start(async () => {
      const r = await p;
      show(r.ok ? ok(r.value) : r.error ?? "That didn't save. Try again.");
    });
  return (
    <>
      <button className="btn btn-p" type="button" onClick={() => show('Grant credits arrives with Credits and plans.')}>
        Grant credits
      </button>
      <button className="btn btn-g" type="button" onClick={() => show('Suspend arrives with Trust and safety.')}>
        Suspend
      </button>
      <Menu trigger={<Icon name="more" />}>
        {canAct && !deleted && (
          <a role="button" onClick={() => run(sendPasswordReset(id), v => `Password reset email sent to ${v ?? first(name)}`)}>
            Send password reset
          </a>
        )}
        {canAct && (
          <a
            role="button"
            onClick={() =>
              run(signOutAll(id), v => `${first(name)} was signed out on ${v === '1' ? '1 device' : `all ${v ?? devices} devices`}`)
            }
          >
            Sign out all devices
          </a>
        )}
        <Link href="/data-requests">Export data</Link>
        {canChangeRole && (
          <a
            role="button"
            onClick={() =>
              run(
                setRole(id, isAuthor ? 'reader' : 'author'),
                () => `Role changed to ${isAuthor ? 'Reader' : 'Reader and author'}. ${first(name)} was not notified.`,
              )
            }
          >
            Change role
          </a>
        )}
        {canDelete && !deleted && (
          <>
            <hr />
            <a role="button" className="danger" onClick={() => setDeleting(true)}>
              Delete account…
            </a>
          </>
        )}
      </Menu>
      {deleting && <DeleteModal id={id} name={name} onClose={() => setDeleting(false)} onDone={show} />}
      {toast}
    </>
  );
}

/** s-user-delete: what is deleted and kept, the store warning, grace or now, typed DELETE. */
function DeleteModal({
  id,
  name,
  onClose,
  onDone,
}: {
  id: string;
  name: string;
  onClose: () => void;
  onDone: (msg: string, undo?: () => void) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'after_30_days' | 'now'>('after_30_days');
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();
  const ready = confirm.trim().toUpperCase() === 'DELETE' && reason.trim().length >= 3;
  const go = () =>
    start(async () => {
      const r = await startDeletion(id, mode, reason, confirm);
      if (!r.ok) return setError(r.error);
      onClose();
      const on = r.value ? new Date(r.value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }) : '';
      onDone(
        mode === 'now'
          ? `${first(name)}'s account is deleted. Personal data is erased within the hour.`
          : `${first(name)}'s account is hidden and will be deleted on ${on}. ${first(name)} can restore it by signing in.`,
        mode === 'now' ? undefined : () => void cancelDeletion(id).then(() => router.refresh()),
      );
      router.refresh();
    });
  return (
    <section className="screen overlay enter">
      <a className="backdrop" onClick={onClose} aria-label="Close"></a>
      <div className="modal danger wide" role="dialog" aria-label="Delete reader account">
        <div className="modal__h">
          <div className="grow">
            <h2>{`Delete ${name}'s account`}</h2>
            <p>This follows the Nigeria Data Protection Act (NDPA) 2023.</p>
          </div>
          <a className="ib" role="button" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </a>
        </div>
        <div className="modal__b">
          <div className="note warn">
            <div className="grow">
              <b>Store subscriptions</b>
              Deleting the account does not cancel a Google Play or App Store plan. Ask the reader to cancel it there first, or they keep being charged.
            </div>
          </div>
          <div className="fgrid">
            <div className="f">
              <span className="lbl">Deleted</span>
              <div className="stack s4 muted">
                <span>Name, email, phone and date of birth</span>
                <span>Profile photo and interests</span>
                <span>Reading history, highlights and notes</span>
                <span>Library, saved books and unlocked books</span>
                <span>Direct messages and support tickets</span>
                <span>Remaining credits (no refund)</span>
              </div>
            </div>
            <div className="f">
              <span className="lbl">Kept</span>
              <div className="stack s4 muted">
                <span>Payment and tax records for 6 years</span>
                <span>Reviews and discussion comments, anonymised as &quot;Former reader&quot;</span>
                <span>Reports they made, with their name removed</span>
                <span>An audit log entry of this deletion</span>
              </div>
            </div>
          </div>
          <div className="radios" role="radiogroup">
            <div
              className={`radio${mode === 'after_30_days' ? ' is-selected' : ''}`}
              role="radio"
              aria-checked={mode === 'after_30_days'}
              tabIndex={0}
              onClick={() => setMode('after_30_days')}
            >
              <span>
                <b>Delete after 30 days</b>
                <small>Account is hidden and signed out now. They can restore it by signing in within 30 days.</small>
              </span>
            </div>
            <div className={`radio${mode === 'now' ? ' is-selected' : ''}`} role="radio" aria-checked={mode === 'now'} tabIndex={0} onClick={() => setMode('now')}>
              <span>
                <b>Delete now</b>
                <small>Permanent. Only when the reader has asked in writing and confirmed.</small>
              </span>
            </div>
          </div>
          <div className="f">
            <label htmlFor="pp-reason">Reason</label>
            <div className="inp">
              <input id="pp-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Ticket number or what the reader asked" />
            </div>
          </div>
          <div className="f">
            <label htmlFor="pp-del">Type DELETE to confirm</label>
            <div className="inp">
              <input id="pp-del" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="DELETE" autoComplete="off" />
            </div>
            {error && <span className="err-t">{error}</span>}
          </div>
        </div>
        <div className="modal__f">
          <a className="btn btn-g" role="button" onClick={onClose}>
            Cancel
          </a>
          <button className={`btn btn-dd${ready && !busy ? '' : ' dis'}`} type="button" disabled={!ready || busy} onClick={go}>
            Delete account
          </button>
        </div>
      </div>
    </section>
  );
}

/** Masked phone with a Show button (Super admin and Support), audited with a reason. */
export function PhoneReveal({ id, masked, canReveal }: { id: string; masked: string | null; canReveal: boolean }) {
  const [shown, setShown] = useState<string | null>(null);
  const [toast, show] = useToast();
  const [busy, start] = useTransition();
  if (!masked) return <>No phone</>;
  if (shown) return <>{shown}</>;
  return (
    <>
      {masked}
      {canReveal && (
        <>
          {' '}
          <a
            className="link"
            role="button"
            aria-disabled={busy}
            onClick={() => {
              const reason = window.prompt('Why do you need the full number? This is written to the audit log.');
              if (!reason?.trim()) return;
              start(async () => {
                const r = await revealContact(id, reason);
                if (r.ok) setShown(r.value ?? '');
                else show(r.error ?? "That didn't work.");
              });
            }}
          >
            Show
          </a>
        </>
      )}
      {toast}
    </>
  );
}

export function NoteForm({ id }: { id: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [toast, show] = useToast();
  const [busy, start] = useTransition();
  return (
    <>
      <div className="f">
        <label htmlFor="pp-n1">Add a note</label>
        <textarea id="pp-n1" className="inp ta" placeholder="What should the next person know?" value={body} onChange={e => setBody(e.target.value)} />
      </div>
      <div>
        <button
          className={`btn btn-g sm${busy || !body.trim() ? ' dis' : ''}`}
          type="button"
          disabled={busy || !body.trim()}
          onClick={() =>
            start(async () => {
              const r = await addNote(id, body);
              if (r.ok) {
                setBody('');
                show('Note saved. Only staff can see it.');
                router.refresh();
              } else show(r.error ?? "That didn't save.");
            })
          }
        >
          Save note
        </button>
      </div>
      {toast}
    </>
  );
}

export function SignOutDevice({ id, device, model, firstName }: { id: string; device: string; model: string; firstName: string }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [busy, start] = useTransition();
  return (
    <>
      <button
        className={`btn btn-g sm${busy ? ' dis' : ''}`}
        type="button"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await signOutDevice(id, device);
            show(r.ok ? `${model} signed out. Downloaded books stop opening until ${firstName} signs in.` : r.error ?? "That didn't work.");
            if (r.ok) router.refresh();
          })
        }
      >
        Sign out
      </button>
      {toast}
    </>
  );
}
