// Flow 13 · what Finance is told, as notices for the flow 15 dispatcher (kind `payout_alert`: an
// email to every Finance user and Super admin). Spec check 13-10, 13-11, 13-19.
import { ledgerDay, naira } from '@arpedia/core';

// A type alias (not an interface) so it fits the dispatcher's open-ended Notice.
export type PayoutAlert = {
  kind: 'payout_alert';
  alert: 'payout_reminder' | 'transfer_stuck' | 'payout_failed' | 'payout_retrying';
  subject: string;
  message: string;
};

export interface ReminderDue {
  cycle_id: string;
  month: string;
  payout_date: string;
  payable_kobo: number;
  payable_authors: number;
  unverified_authors: number;
  unverified_kobo: number;
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** payout_reminder (3 days before payout day): unverified accounts and whether the balance covers it. */
export function reminderAlert(r: ReminderDue, balanceKobo: number | null): PayoutAlert {
  const month = MONTH.format(new Date(`${r.month.slice(0, 10)}T00:00:00Z`));
  const short = balanceKobo != null && balanceKobo < r.payable_kobo;
  const lines = [
    `Payout day for ${month} is ${ledgerDay(`${r.payout_date.slice(0, 10)}T12:00:00Z`)}: ` +
      `${naira(r.payable_kobo)} to ${plural(r.payable_authors, 'author')}.`,
    r.unverified_authors
      ? `${plural(r.unverified_authors, 'author')} (${naira(r.unverified_kobo)}) ` +
        `${r.unverified_authors === 1 ? 'has' : 'have'} no verified bank account and will be held. ` +
        'Check Bank accounts for any waiting review.'
      : 'Every author due has a verified bank account.',
    balanceKobo == null
      ? 'The Flutterwave balance could not be read. Check it before payout day.'
      : short
        ? `The Flutterwave balance is ${naira(balanceKobo)}, ${naira(r.payable_kobo - balanceKobo)} short. ` +
          'Top it up before payout day.'
        : `The Flutterwave balance (${naira(balanceKobo)}) covers it.`,
  ];
  return {
    kind: 'payout_alert',
    alert: 'payout_reminder',
    subject: short
      ? `Payout day in 3 days: top up Flutterwave`
      : r.unverified_authors
        ? `Payout day in 3 days: ${plural(r.unverified_authors, 'author')} not verified`
        : 'Payout day in 3 days',
    message: lines.join('\n'),
  };
}

/** Rule 19: transfers still pending at Flutterwave after 48 hours, raised once each. */
export function stuckAlert(rows: { reference: string; amount_kobo: number }[]): PayoutAlert {
  const total = rows.reduce((s, r) => s + r.amount_kobo, 0);
  return {
    kind: 'payout_alert',
    alert: 'transfer_stuck',
    subject: `${plural(rows.length, 'payout')} pending at Flutterwave for over 48 hours`,
    message:
      `${naira(total)} has not settled: ${rows.map((r) => r.reference).join(', ')}. ` +
      'They are not retried until Flutterwave says they failed. Check them with Flutterwave support.',
  };
}

/** Rule 20: the third failed attempt to create a transfer marks the payout failed. */
export function failedAlert(reference: string, amountKobo: number, reason: string): PayoutAlert {
  return {
    kind: 'payout_alert',
    alert: 'payout_failed',
    subject: `A payout failed: ${reference}`,
    message:
      `${naira(amountKobo)} could not be sent after 3 tries (${reason.slice(0, 200)}). ` +
      'Open the payout run to retry it.',
  };
}

/** Spec check 13-11: Flutterwave would not take a transfer; payouts pause and retry by themselves. */
export function retryAlert(reference: string, reason: string, delaySeconds: number): PayoutAlert {
  const wait =
    delaySeconds >= 3600
      ? plural(Math.round(delaySeconds / 3600), 'hour')
      : plural(Math.ceil(delaySeconds / 60), 'minute');
  return {
    kind: 'payout_alert',
    alert: 'payout_retrying',
    subject: 'Payouts paused: Flutterwave did not take a transfer',
    message:
      `Flutterwave did not take ${reference} (${reason.slice(0, 200)}). No money moved. ` +
      `Payouts in this run try again by themselves in ${wait}; a transfer that fails 3 times is marked failed ` +
      'and you will be told. Check the Flutterwave dashboard and balance.',
  };
}
