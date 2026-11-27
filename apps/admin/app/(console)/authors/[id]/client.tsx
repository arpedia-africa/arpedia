'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { editAuthorProfile, messageAuthor, reinstateAuthor, suspendAuthor } from '../actions';

export interface MenuItem {
  label: string;
  /** Says which later flow brings it. */
  msg?: string;
  danger?: boolean;
  onSelect?: () => void;
}

const MSG = {
  message: 'Messages to authors arrive with reader messages (flow 08).',
  noMessage: 'Your role can look at authors but not message them.',
  noEdit: 'Your role can look at authors but not edit them.',
  statement: 'Statements arrive with payouts (flow 13).',
  pause: 'Pausing payouts arrives with payouts (flow 13).',
};

/** The prototype's ⋯ menu (`.mwrap` with `.ib` and `.menu`). */
function More({ items, show }: { items: MenuItem[]; show: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
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
  return (
    <div className="mwrap" ref={ref}>
      <button className="ib" type="button" aria-expanded={open} aria-label="More actions" onClick={() => setOpen(o => !o)}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu" onClick={() => setOpen(false)}>
          {items.map((it, i) => (
            <span key={it.label}>
              {it.danger && i > 0 && <hr />}
              <a
                role="menuitem"
                tabIndex={0}
                className={it.danger ? 'danger' : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => (it.onSelect ? it.onSelect() : show(it.msg!))}
                onKeyDown={e => e.key === 'Enter' && (it.onSelect ? it.onSelect() : show(it.msg!))}
              >
                {it.label}
              </a>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The author page actions: Message (primary) and the ⋯ menu. Message and Edit profile open a dialog
 * (Support, Operations admin, Super admin); Pause payouts opens the payout page's Hold, which needs a
 * reason; Download statement still says it comes with payouts; Suspend and Reinstate are real.
 */
export function AuthorActions({
  id,
  name,
  suspended,
  canSuspend,
  canEdit,
  profile,
}: {
  id: string;
  name: string;
  suspended: boolean;
  canSuspend: boolean;
  canEdit: boolean;
  profile: { penName: string; bio: string; location: string };
}) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState('');
  const [dialog, setDialog] = useState<'message' | 'edit' | null>(null);
  const [body, setBody] = useState('');
  const [form, setForm] = useState(profile);
  const [pending, start] = useTransition();
  const first = name.split(' ')[0] || name;
  const openDialog = (d: 'message' | 'edit') => {
    if (!canEdit) return show(d === 'message' ? MSG.noMessage : MSG.noEdit);
    if (d === 'edit') setForm(profile);
    setDialog(d);
  };
  const close = () => setDialog(null);

  const items: MenuItem[] = [
    { label: 'Edit profile', onSelect: () => openDialog('edit') },
    { label: 'Download statement', msg: MSG.statement },
    { label: 'Pause payouts', onSelect: () => router.push(`/authors/${id}/payout`) },
  ];
  if (canSuspend) {
    items.push(
      suspended
        ? {
            label: 'Reinstate author rights',
            danger: true,
            onSelect: () =>
              start(async () => {
                const r = await reinstateAuthor(id);
                if (!r.ok) return show(r.error);
                show(`${first} can submit books and receive tips again.`);
                router.refresh();
              }),
          }
        : { label: 'Suspend author rights…', danger: true, onSelect: () => setAsk(true) },
    );
  }

  return (
    <>
      <div className="ph__acts">
        <a role="button" tabIndex={0} className="btn btn-p" style={{ cursor: 'pointer' }} onClick={() => openDialog('message')}>
          Message
        </a>
        <More items={items} show={show} />
      </div>
      {dialog === 'message' && (
        <section className="screen overlay enter">
          <a className="backdrop" role="button" aria-label="Close" onClick={close}></a>
          <div className="modal" role="dialog" aria-label={`Message ${name}`}>
            <div className="modal__h">
              <div className="grow">
                <h2>{`Message ${name}`}</h2>
                <p>{`${first} gets it as a push and in their notifications, from Arpedia. It is kept in the audit log.`}</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <div className="f">
                <label htmlFor="au-msg">Message</label>
                <textarea
                  id="au-msg"
                  className="inp ta"
                  value={body}
                  maxLength={300}
                  placeholder="Plain and friendly. Up to 300 characters."
                  onChange={e => setBody(e.target.value)}
                />
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" onClick={close}>
                Cancel
              </button>
              <button
                className="btn btn-p"
                type="button"
                disabled={pending || !body.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await messageAuthor(id, body.trim());
                    if (!r.ok) return show(r.error);
                    close();
                    setBody('');
                    show(`Message to ${first} sent. They get a push.`);
                  })
                }
              >
                Send
              </button>
            </div>
          </div>
        </section>
      )}
      {dialog === 'edit' && (
        <section className="screen overlay enter">
          <a className="backdrop" role="button" aria-label="Close" onClick={close}></a>
          <div className="modal" role="dialog" aria-label={`Edit ${name}'s profile`}>
            <div className="modal__h">
              <div className="grow">
                <h2>Edit profile</h2>
                <p>Readers see these on the author page. Changes are kept in the audit log.</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={close}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <div className="f">
                <label htmlFor="au-pen">Pen name</label>
                <input
                  id="au-pen"
                  className="inp"
                  value={form.penName}
                  maxLength={60}
                  onChange={e => setForm({ ...form, penName: e.target.value })}
                />
              </div>
              <div className="f">
                <label htmlFor="au-bio">Bio</label>
                <textarea
                  id="au-bio"
                  className="inp ta"
                  value={form.bio}
                  maxLength={300}
                  onChange={e => setForm({ ...form, bio: e.target.value })}
                />
              </div>
              <div className="f">
                <label htmlFor="au-loc">Location</label>
                <input
                  id="au-loc"
                  className="inp"
                  value={form.location}
                  maxLength={60}
                  placeholder="City, Country"
                  onChange={e => setForm({ ...form, location: e.target.value })}
                />
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" onClick={close}>
                Cancel
              </button>
              <button
                className="btn btn-p"
                type="button"
                disabled={pending || !form.penName.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await editAuthorProfile(id, form);
                    if (!r.ok) return show(r.error);
                    close();
                    show(`Profile saved for ${first}.`);
                    router.refresh();
                  })
                }
              >
                Save
              </button>
            </div>
          </div>
        </section>
      )}
      {ask && (
        <section className="screen overlay enter">
          <a className="backdrop" role="button" aria-label="Close" onClick={() => setAsk(false)}></a>
          <div className="modal danger" role="dialog" aria-label={`Suspend author rights for ${name}?`}>
            <div className="modal__h">
              <div className="grow">
                <h2>{`Suspend author rights for ${name}?`}</h2>
                <p>Live books stay readable. New uploads and tips stop, and this month’s earnings are held.</p>
              </div>
              <button className="ib" type="button" aria-label="Close" onClick={() => setAsk(false)}>
                <Icon name="x" />
              </button>
            </div>
            <div className="modal__b">
              <div className="f">
                <label htmlFor="sus-reason">Reason</label>
                <textarea
                  id="sus-reason"
                  className="inp ta"
                  value={reason}
                  maxLength={500}
                  placeholder="Only staff see this. It goes in the audit log."
                  onChange={e => setReason(e.target.value)}
                />
              </div>
            </div>
            <div className="modal__f">
              <button className="btn btn-g" type="button" onClick={() => setAsk(false)}>
                Cancel
              </button>
              <button
                className="btn btn-dd"
                type="button"
                disabled={pending || !reason.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await suspendAuthor(id, reason.trim());
                    if (!r.ok) return show(r.error);
                    setAsk(false);
                    setReason('');
                    show(`Author rights suspended for ${first}. Live books stay readable and this month’s earnings are held.`);
                    router.refresh();
                  })
                }
              >
                Suspend author rights
              </button>
            </div>
          </div>
        </section>
      )}
      {toast}
    </>
  );
}

/** Payout page actions: Download statement (primary) and the ⋯ menu with Message and Pause payouts. */
export function PayoutActions({ name }: { name: string }) {
  const [toast, show] = useToast();
  const first = name.split(' ')[0] || name;
  return (
    <>
      <div className="ph__acts">
        <a role="button" tabIndex={0} className="btn btn-p" style={{ cursor: 'pointer' }} onClick={() => show(MSG.statement)}>
          Download statement
        </a>
        <More
          show={show}
          items={[
            { label: `Message ${first}`, msg: MSG.message },
            { label: 'Pause payouts', msg: MSG.pause },
          ]}
        />
      </div>
      {toast}
    </>
  );
}

/** The Hold switch: shows the real state; changing it arrives with payouts. */
export function HoldSwitch({ on }: { on: boolean }) {
  const [toast, show] = useToast();
  return (
    <>
      <button
        className={`switch${on ? ' on' : ''}`}
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Pause payouts"
        onClick={() => show(MSG.pause)}
      ></button>
      {toast}
    </>
  );
}
