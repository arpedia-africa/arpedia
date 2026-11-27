import { describe, expect, it, vi } from 'vitest';

// Spec check 13-2: Flutterwave has one webhook URL, and flow 09's route must hand transfer events
// to flow 13 instead of dropping them.
const handleTransferWebhook = vi.fn(async () => ({
  status: 200 as const,
  body: { ok: true, applied: true },
}));
vi.mock('../13/earnings', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  handleTransferWebhook,
}));
const rpc = vi.fn();
// Table reads: each `from(table)` chain resolves to tables[table] (maybeSingle: its first row).
const tables: Record<string, unknown[]> = {};
const filters: { table: string; method: string; args: unknown[] }[] = [];
const from = (table: string) => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      filters.push({ table, method: m, args });
      return chain;
    };
  }
  chain.maybeSingle = async () => ({ data: tables[table]?.[0] ?? null, error: null });
  chain.then = (ok: (v: unknown) => unknown) => ok({ data: tables[table] ?? [], error: null });
  return chain;
};
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc, from }) }));

const { default: payments } = await import('./payments');

const env = { FLUTTERWAVE_WEBHOOK_HASH: 'h', FLUTTERWAVE_SECRET_KEY: 'k' };
const post = (body: unknown, hash = 'h') =>
  payments.request(
    '/flutterwave',
    {
      method: 'POST',
      headers: { 'verif-hash': hash, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );

describe('Flutterwave webhook', () => {
  it('hands transfer events to flow 13', async () => {
    const body = { event: 'transfer.completed', data: { id: 77, reference: 'ARP-PO-1' } };
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, applied: true });
    expect(handleTransferWebhook).toHaveBeenCalledWith(env, body);
  });

  it('also when only event.type says Transfer', async () => {
    handleTransferWebhook.mockClear();
    await post({ 'event.type': 'Transfer', data: { id: 78 } });
    expect(handleTransferWebhook).toHaveBeenCalledTimes(1);
  });

  it('stores a failed charge as unpaid, never as a purchase (spec check 09-14)', async () => {
    const user = '11111111-2222-4333-8444-555555555555';
    const verified = {
      id: 9001,
      tx_ref: `arp:topup:topup_200:${user}:n1`,
      amount: 600,
      currency: 'NGN',
      status: 'failed',
      created_at: '2026-11-24T10:00:00.000Z',
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ status: 'success', data: verified })));
    rpc.mockReset().mockResolvedValue({ data: { id: 5, outcome: 'charge failed' }, error: null });
    const res = await post({ event: 'charge.completed', data: { id: 9001 } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, outcome: 'charge failed' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe('ingest_payment_event');
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_event_id: 'charge:9001:failed',
      p_normalized: { type: 'unpaid', status: 'failed', kind: 'topup', topup_code: 'topup_200' },
    });
    fetchMock.mockRestore();
  });

  describe('a refund made in the Flutterwave dashboard (spec check 09-13)', () => {
    const user = '11111111-2222-4333-8444-555555555555';
    const refund = {
      id: 551,
      tx_id: 9001,
      amount_refunded: 450,
      status: 'completed',
      created_at: '2026-11-25T09:00:00Z',
    };
    const flwAnswer = (data: unknown) =>
      vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ status: 'success', data })));

    it('is re-queried and applied as a web refund for the transaction’s reader', async () => {
      const fetchMock = flwAnswer(refund);
      tables.transactions = [{ id: 'tx-1', user_id: user }];
      tables.refund_requests = [];
      rpc.mockReset().mockResolvedValue({ data: { id: 6, outcome: '{"removed":150}' }, error: null });
      const res = await post({
        event: 'refund.completed',
        data: { id: 551, tx_id: 1, amount_refunded: 99999 },
      });
      expect(res.status).toBe(200);
      expect(fetchMock.mock.calls[0]![0]).toBe('https://api.flutterwave.com/v3/refunds/551');
      expect(rpc.mock.calls[0]![1]).toMatchObject({
        p_event_id: 'refund:551',
        // Amount and transaction come from Flutterwave's own answer, never the webhook body.
        p_normalized: { type: 'refund', user_id: user, store: 'web', txn_id: '9001', refund_kobo: 45000 },
      });
      fetchMock.mockRestore();
    });

    it('skips a refund Finance started in admin (the queue drain completes that one)', async () => {
      const fetchMock = flwAnswer(refund);
      tables.transactions = [{ id: 'tx-1', user_id: user }];
      tables.refund_requests = [{ id: 'rr-1' }];
      filters.length = 0;
      rpc.mockReset();
      const res = await post({ event: 'refund.completed', data: { id: 551 } });
      expect(await res.json()).toEqual({ ok: true, ignored: 'refund started in admin' });
      expect(filters).toContainEqual({
        table: 'refund_requests',
        method: 'or',
        args: ['status.eq.refunding,flutterwave_refund_id.eq.551'],
      });
      expect(rpc).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    });

    it('ignores a refund for a payment we never recorded', async () => {
      const fetchMock = flwAnswer(refund);
      tables.transactions = [];
      rpc.mockReset();
      const res = await post({ event: 'refund.completed', data: { id: 551 } });
      expect(await res.json()).toEqual({ ok: true, ignored: 'unknown transaction' });
      expect(rpc).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    });

    it('waits for a refund that is still pending', async () => {
      const fetchMock = flwAnswer({ ...refund, status: 'pending' });
      tables.transactions = [{ id: 'tx-1', user_id: user }];
      tables.refund_requests = [];
      rpc.mockReset();
      const res = await post({ event: 'refund.completed', data: { id: 551 } });
      expect(await res.json()).toEqual({ ok: true, ignored: 'refund pending' });
      expect(rpc).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    });
  });

  it('still checks the signature first', async () => {
    handleTransferWebhook.mockClear();
    expect((await post({ event: 'transfer.completed', data: { id: 1 } }, 'wrong')).status).toBe(401);
    expect(handleTransferWebhook).not.toHaveBeenCalled();
  });
});
