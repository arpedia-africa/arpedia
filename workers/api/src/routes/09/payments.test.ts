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
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc: vi.fn() }) }));

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

  it('still checks the signature first', async () => {
    handleTransferWebhook.mockClear();
    expect((await post({ event: 'transfer.completed', data: { id: 1 } }, 'wrong')).status).toBe(401);
    expect(handleTransferWebhook).not.toHaveBeenCalled();
  });
});
