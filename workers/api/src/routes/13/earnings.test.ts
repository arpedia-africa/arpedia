import { transferStatusApplies, type TransferStatus } from '@arpedia/core';
import { describe, expect, it } from 'vitest';
import { applyTransfer, decryptAccount, encryptAccount, isTransferEvent, sendPayout } from './earnings';
import { fakePayoutClient, type FlwTransfer, type PayoutClient } from './flutterwave';

// Webhook replay (flow 13 Done when): the Worker re-queries each transfer and hands the status to
// payout_apply_event. This stand-in keeps that RPC's contract (event id idempotency, status rank,
// one automatic retry for a transient failure); pgTAP 13_earnings covers the SQL itself.
function fakeDb() {
  const payouts = new Map<string, { status: TransferStatus; transferId?: string; errors: number }>();
  const events = new Set<string>();
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const retries: string[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    switch (fn) {
      case 'payout_apply_event': {
        const id = args.p_event_id as string;
        if (events.has(id)) return { data: { applied: false, replayed: true }, error: null };
        events.add(id);
        const p = payouts.get(args.p_reference as string);
        if (!p) return { data: { applied: false, reason: 'unknown_reference' }, error: null };
        const next = args.p_status as TransferStatus;
        const applied = transferStatusApplies(p.status, next);
        if (applied) p.status = next;
        const retry = applied && next === 'failed' && args.p_transient ? `${args.p_reference}-retry` : null;
        if (retry) retries.push(retry);
        return { data: { applied, retry_id: retry }, error: null };
      }
      case 'payout_for_transfer':
        return { data: sendable, error: null };
      case 'payout_transfer_created': {
        const p = payouts.get(sendable!.reference);
        if (p && p.status === 'queued')
          Object.assign(p, { status: 'pending', transferId: args.p_transfer_id });
        return { data: null, error: null };
      }
      case 'payout_transfer_error': {
        payouts.get(sendable!.reference)!.errors++;
        return { data: 3600, error: null };
      }
      default:
        throw new Error(`unexpected rpc ${fn}`);
    }
  };
  let sendable: { reference: string; [k: string]: unknown } | null = null;
  return {
    db: { rpc } as never,
    payouts,
    calls,
    retries,
    setSendable: (s: typeof sendable) => (sendable = s),
  };
}

/** A Flutterwave that answers re-queries from a table we control. */
function flwWith(transfers: Record<number, FlwTransfer>): PayoutClient {
  return {
    ...fakePayoutClient(),
    getTransfer: async (id) => transfers[Number(id)]!,
  };
}

/** `\x…` hex as written to bytea → base64 as payout_for_transfer reads it back. */
const hexToB64 = (hex: string) =>
  btoa(
    String.fromCharCode(
      ...hex
        .slice(2)
        .match(/../g)!
        .map((h) => parseInt(h, 16)),
    ),
  );

const REF = 'ARP-PO-202610-a1b2c3d4e5f60718293a4b5c6d7e8f90-1';

describe('flutterwave transfer webhook replay', () => {
  it('a duplicated webhook applies once', async () => {
    const { db, payouts } = fakeDb();
    payouts.set(REF, { status: 'pending', errors: 0 });
    const flw = flwWith({ 7: { id: 7, reference: REF, status: 'SUCCESSFUL', amount: 1500 } });
    expect(await applyTransfer(db, flw, 7)).toMatchObject({ applied: true });
    expect(await applyTransfer(db, flw, 7)).toMatchObject({ applied: false, replayed: true });
    expect(payouts.get(REF)!.status).toBe('successful');
  });

  it('out of order: a late pending never overwrites successful', async () => {
    const { db, payouts } = fakeDb();
    payouts.set(REF, { status: 'pending', errors: 0 });
    const table: Record<number, FlwTransfer> = {
      7: { id: 7, reference: REF, status: 'SUCCESSFUL', amount: 1500 },
    };
    const flw = flwWith(table);
    await applyTransfer(db, flw, 7);
    table[7] = { ...table[7]!, status: 'PENDING' };
    expect(await applyTransfer(db, flw, 7)).toMatchObject({ applied: false });
    expect(payouts.get(REF)!.status).toBe('successful');
  });

  it('reversed after successful is applied, and a failure reason is passed on', async () => {
    const { db, payouts, calls } = fakeDb();
    payouts.set(REF, { status: 'pending', errors: 0 });
    const table: Record<number, FlwTransfer> = {
      7: { id: 7, reference: REF, status: 'SUCCESSFUL', amount: 1500 },
    };
    const flw = flwWith(table);
    await applyTransfer(db, flw, 7);
    table[7] = { ...table[7]!, status: 'REVERSED', complete_message: 'Reversed by bank' };
    expect(await applyTransfer(db, flw, 7)).toMatchObject({ applied: true });
    expect(payouts.get(REF)!.status).toBe('reversed');
    expect(calls.at(-1)!.args).toMatchObject({ p_status: 'reversed', p_reason: 'Reversed by bank' });
  });

  it('trusts the re-query, not the webhook body, and ignores transfers that are not payouts', async () => {
    const { db, payouts } = fakeDb();
    payouts.set(REF, { status: 'pending', errors: 0 });
    const flw = flwWith({
      7: { id: 7, reference: REF, status: 'PENDING', amount: 1500 },
      8: { id: 8, reference: 'SOMETHING-ELSE', status: 'SUCCESSFUL', amount: 1 },
    });
    expect(await applyTransfer(db, flw, 7)).toMatchObject({ applied: false });
    expect(await applyTransfer(db, flw, 8)).toEqual({ ignored: 'not a payout' });
    expect(isTransferEvent({ event: 'transfer.completed' })).toBe(true);
    expect(isTransferEvent({ event: 'charge.completed' })).toBe(false);
  });

  it('a name mismatch failure never retries itself; a bank outage does', async () => {
    const { db, payouts, retries } = fakeDb();
    const other = REF.replace(/-1$/, '-2');
    payouts.set(REF, { status: 'pending', errors: 0 });
    payouts.set(other, { status: 'pending', errors: 0 });
    const flw = flwWith({
      7: {
        id: 7,
        reference: REF,
        status: 'FAILED',
        amount: 1500,
        complete_message: 'Account name does not match',
      },
      9: { id: 9, reference: other, status: 'FAILED', amount: 1500, complete_message: 'Service unavailable' },
    });
    await applyTransfer(db, flw, 7);
    await applyTransfer(db, flw, 9);
    expect(retries).toEqual([`${other}-retry`]);
  });
});

describe('payout transfer consumer', () => {
  const key = new Uint8Array(32).fill(3);
  const author = 'a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90';

  it('encrypts the account number bound to its author', async () => {
    const hex = await encryptAccount(key, author, '0123456789');
    expect(hex.startsWith('\\x')).toBe(true);
    const b64 = hexToB64(hex);
    expect(await decryptAccount(key, author, b64)).toBe('0123456789');
    await expect(decryptAccount(key, 'someone-else', b64)).rejects.toThrow();
  });

  it('sends once with the payout reference, records the transfer, then settles it', async () => {
    const { db, payouts, setSendable } = fakeDb();
    payouts.set(REF, { status: 'queued', errors: 0 });
    const enc = hexToB64(await encryptAccount(key, author, '0123456789'));
    setSendable({
      send: true,
      payout_id: 'p1',
      author_id: author,
      reference: REF,
      amount_kobo: 150_000,
      bank_code: '058',
      account_number_enc: enc,
    });
    const flw = fakePayoutClient();
    const sent: string[] = [];
    const spy: PayoutClient = {
      ...flw,
      createTransfer: (t) => (
        sent.push(`${t.reference}:${t.accountNumber}:${t.amountKobo}`),
        flw.createTransfer(t)
      ),
    };
    expect(await sendPayout(db, spy, key, 'p1')).toBe(true);
    expect(sent).toEqual([`${REF}:0123456789:150000`]);
    expect(payouts.get(REF)!.status).toBe('successful');
  });

  it('an API error leaves the payout queued for the same reference later', async () => {
    const { db, payouts, setSendable } = fakeDb();
    payouts.set(REF, { status: 'queued', errors: 0 });
    const enc = hexToB64(await encryptAccount(key, author, '0123456789'));
    setSendable({
      send: true,
      payout_id: 'p1',
      author_id: author,
      reference: REF,
      amount_kobo: 1,
      bank_code: '058',
      account_number_enc: enc,
    });
    const down: PayoutClient = {
      ...fakePayoutClient(),
      createTransfer: () => Promise.reject(new Error('network')),
    };
    expect(await sendPayout(db, down, key, 'p1')).toBe(false);
    expect(payouts.get(REF)).toMatchObject({ status: 'queued', errors: 1 });
  });

  it('a payout that must wait is left on the queue; one that cannot go is finished', async () => {
    const { db, setSendable } = fakeDb();
    const flw = fakePayoutClient();
    setSendable({ send: false, reason: 'not_yet', retry_in_s: 100, reference: REF });
    expect(await sendPayout(db, flw, key, 'p1')).toBe(false);
    setSendable({ send: false, reason: 'successful', reference: REF });
    expect(await sendPayout(db, flw, key, 'p1')).toBe(true);
  });
});
