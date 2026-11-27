import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { FlwError, isTestKey, payoutClient } from './flutterwave';

// The live Flutterwave client with every HTTP call mocked: nothing here reaches Flutterwave or moves
// money. Checks the live base URL, the bearer key, the request bodies and how failures surface.
const LIVE = 'FLWSECK-abc123-X';
const TEST = 'FLWSECK_TEST-abc123-X';

const env = (over: Partial<Env>) => ({ APP_ENV: 'production', ...over }) as Env;

type Call = { url: string; init: RequestInit };
function mockFetch(answer: (url: string) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const a = answer(url);
      return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('payoutClient', () => {
  it('is off on staging and production without a key, and never falls back to the stand-in', () => {
    expect(payoutClient(env({ APP_ENV: 'production' }))).toBeNull();
    expect(payoutClient(env({ APP_ENV: 'staging' }))).toBeNull();
    expect(payoutClient(env({ APP_ENV: 'local' }))).not.toBeNull();
  });

  it('refuses a test-mode key on production', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(isTestKey(TEST)).toBe(true);
    expect(isTestKey(LIVE)).toBe(false);
    expect(payoutClient(env({ FLUTTERWAVE_SECRET_KEY: TEST }))).toBeNull();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/test-mode key/));
    err.mockRestore();
  });

  it('uses a live key on production', () => {
    expect(payoutClient(env({ FLUTTERWAVE_SECRET_KEY: LIVE }))).not.toBeNull();
  });
});

describe('live client (mocked HTTP)', () => {
  const client = () => payoutClient(env({ FLUTTERWAVE_SECRET_KEY: ` ${LIVE} ` }))!;

  it('creates a transfer on the live API in naira with the payout reference', async () => {
    const calls = mockFetch(() => ({ body: { status: 'success', data: { id: 77, status: 'NEW' } } }));
    const out = await client().createTransfer({
      reference: 'arp-po-1',
      amountKobo: 1_234_50,
      bankCode: '058',
      accountNumber: '0123456789',
      narration: 'Arpedia author earnings',
    });
    expect(out).toEqual({ id: 77, status: 'NEW' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.flutterwave.com/v3/transfers');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${LIVE}`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      account_bank: '058',
      account_number: '0123456789',
      amount: 1234.5,
      currency: 'NGN',
      debit_currency: 'NGN',
      reference: 'arp-po-1',
      narration: 'Arpedia author earnings',
    });
  });

  it('resolves an account name and lists Nigerian banks', async () => {
    const calls = mockFetch((url) =>
      url.endsWith('/banks/NG')
        ? { body: { status: 'success', data: [{ id: 1, code: '058', name: 'GTBank' }] } }
        : { body: { status: 'success', data: { account_name: 'NGOZI OKAFOR' } } },
    );
    expect(await client().banks()).toEqual([{ code: '058', name: 'GTBank' }]);
    expect(await client().resolveAccount('058', '0123456789')).toBe('NGOZI OKAFOR');
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({
      account_bank: '058',
      account_number: '0123456789',
    });
  });

  it('reads a transfer by id and the NGN balance in kobo', async () => {
    const calls = mockFetch((url) =>
      url.includes('/balances/')
        ? { body: { status: 'success', data: { available_balance: 2500.75 } } }
        : { body: { status: 'success', data: { id: 9, reference: 'r', status: 'SUCCESSFUL', amount: 10 } } },
    );
    expect((await client().getTransfer(9)).status).toBe('SUCCESSFUL');
    expect(await client().balanceKobo()).toBe(250_075);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.flutterwave.com/v3/transfers/9',
      'https://api.flutterwave.com/v3/balances/NGN',
    ]);
  });

  it('throws FlwError with the HTTP status on a refusal', async () => {
    mockFetch(() => ({ status: 400, body: { status: 'error', message: 'Insufficient balance' } }));
    const e = await client()
      .balanceKobo()
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FlwError);
    expect((e as FlwError).status).toBe(400);
    expect((e as FlwError).message).toMatch(/Insufficient balance/);
  });

  it('treats a 200 that is not a success as a failure', async () => {
    mockFetch(() => ({ body: { status: 'error', message: 'Transfers are not enabled' } }));
    await expect(
      client().createTransfer({
        reference: 'x',
        amountKobo: 100,
        bankCode: '058',
        accountNumber: '0123456789',
        narration: 'n',
      }),
    ).rejects.toBeInstanceOf(FlwError);
  });

  it('throws FlwError on a 5xx with a body that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad gateway', { status: 502 })),
    );
    const e = await client()
      .banks()
      .catch((x: unknown) => x);
    expect((e as FlwError).status).toBe(502);
  });
});
