'use client';

import { useTransition } from 'react';
import { useToast } from '@/components/toast';
import { resendReceipt } from './actions';

/** Resend receipt for a web payment: the drawer's button (s-transaction) or a menu item (s-subscription). */
export function ResendReceipt({
  transactionId,
  name,
  item,
  onDone,
}: {
  transactionId: string;
  name: string;
  /** Drawn as the menu's plain link instead of a button. */
  item?: boolean;
  onDone?: (message: string) => void;
}) {
  const [toast, show] = useToast();
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const r = await resendReceipt(transactionId, name);
      const message = r.ok ? r.message : r.error;
      if (onDone) onDone(message);
      else show(message);
    });
  return (
    <>
      {item ? (
        <a role="button" tabIndex={0} aria-disabled={pending} onClick={() => !pending && send()}>
          Resend receipt
        </a>
      ) : (
        <button className="btn btn-g" type="button" disabled={pending} onClick={send}>
          Resend receipt
        </button>
      )}
      {toast}
    </>
  );
}
