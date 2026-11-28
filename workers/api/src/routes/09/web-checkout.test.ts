import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec check 09-3: the web account page starts a Flutterwave hosted checkout. The database picks
// the price and writes the tx_ref (pgTAP 09_web_checkout_test.sql); the Worker only creates the
// payment plan once per price and the hosted page. Every Flutterwave call is mocked.
const USER = '11111111-2222-4333-8444-555555555555';
const rpc = vi.fn();
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));
vi.mock('@arpedia/core/jwt', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  verifySupabaseJwt: vi.fn(async (token: string) => {
    if (token !== 'reader-token')
      throw new (await orig<{ AuthError: new (m: string) => Error }>()).AuthError('bad');
    return { sub: USER };
  }),
}));

const { default: payments, safeReturnPath } = await import('./payments');

const env = { APP_ENV: 'production', SUPABASE_URL: 'http://db', FLUTTERWAVE_SECRET_KEY: 'FLWSECK-live' };
const start = (body: unknown, e: Record<string, unknown> = env, token = 'reader-token') =>
  payments.request(
    '/web-checkout',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    e,
  );

const checkout = (over: Record<string, unknown> = {}) => ({
  tx_ref: `arp:plan:monthly:${USER}:abc`,
  kind: 'plan',
  code: 'monthly',
  amount_kobo: 80000,
  credits: 300,
  months: 1,
  title: 'Arpedia Monthly',
  email: 'ngozi@example.com',
  name: 'Ngozi',
  flutterwave_plan_id: null,
  ...over,
});

const ok = (data: unknown) => new Response(JSON.stringify({ status: 'success', data }));
let fetchMock: ReturnType<typeof vi.spyOn>;
const bodyOf = (i: number) => JSON.parse(String((fetchMock.mock.calls[i]![1] as RequestInit).body));

beforeEach(() => {
  rpc.mockReset();
  fetchMock?.mockRestore();
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

describe('POST /web-checkout', () => {
  it('needs a signed-in reader', async () => {
    expect((await start({ kind: 'plan', code: 'monthly' }, env, 'nope')).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('answers 503 without the Flutterwave key', async () => {
    const res = await start({ kind: 'plan', code: 'monthly' }, { ...env, FLUTTERWAVE_SECRET_KEY: undefined });
    expect(res.status).toBe(503);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a bad kind before asking the database', async () => {
    const res = await start({ kind: 'gift', code: 'monthly' });
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('first plan checkout at a price creates the payment plan, saves it, then the hosted page', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'start_web_checkout') return { data: checkout(), error: null };
      if (fn === 'set_web_payment_plan') return { data: '4242', error: null };
      throw new Error(fn);
    });
    fetchMock
      .mockResolvedValueOnce(ok({ id: 4242 }))
      .mockResolvedValueOnce(ok({ link: 'https://checkout.flutterwave.com/v3/hosted/pay/x' }));
    const res = await start({ kind: 'plan', code: 'Monthly ', return_path: '/account?tab=plan' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      link: 'https://checkout.flutterwave.com/v3/hosted/pay/x',
      tx_ref: `arp:plan:monthly:${USER}:abc`,
      amount_kobo: 80000,
      credits: 300,
    });
    // The reader comes from the token, never the body; the code is normalised.
    expect(rpc).toHaveBeenNthCalledWith(1, 'start_web_checkout', {
      p_user: USER,
      p_kind: 'plan',
      p_code: 'monthly',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_web_payment_plan', {
      p_tx_ref: `arp:plan:monthly:${USER}:abc`,
      p_flutterwave_plan_id: '4242',
    });
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.flutterwave.com/v3/payment-plans');
    expect(bodyOf(0)).toMatchObject({ amount: 800, interval: 'monthly' });
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.flutterwave.com/v3/payments');
    expect(bodyOf(1)).toEqual({
      tx_ref: `arp:plan:monthly:${USER}:abc`,
      amount: 800,
      currency: 'NGN',
      redirect_url: 'https://arpedia.africa/account?tab=plan',
      payment_plan: 4242,
      customer: { email: 'ngozi@example.com', name: 'Ngozi' },
      customizations: { title: 'Arpedia Monthly' },
      meta: { kind: 'plan', code: 'monthly', credits: 300 },
    });
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer FLWSECK-live',
    });
  });

  it('reuses the saved payment plan for that price', async () => {
    rpc.mockResolvedValue({
      data: checkout({ code: 'yearly', months: 12, flutterwave_plan_id: '99' }),
      error: null,
    });
    fetchMock.mockResolvedValueOnce(ok({ link: 'https://pay/y' }));
    const res = await start({ kind: 'plan', code: 'yearly' });
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(0)).toMatchObject({ payment_plan: 99, redirect_url: 'https://arpedia.africa/account' });
  });

  it('a top-up is a one-off charge with no payment plan', async () => {
    rpc.mockResolvedValue({
      data: checkout({
        tx_ref: `arp:topup:topup_200:${USER}:n`,
        kind: 'topup',
        code: 'topup_200',
        amount_kobo: 60000,
        credits: 200,
        months: null,
        title: 'Arpedia 200 credits',
        name: null,
      }),
      error: null,
    });
    fetchMock.mockResolvedValueOnce(ok({ link: 'https://pay/t' }));
    const res = await start(
      { kind: 'topup', code: 'topup_200' },
      { ...env, WEB_URL: 'https://staging.arpedia.africa/' },
    );
    expect(res.status).toBe(200);
    const sent = bodyOf(0);
    expect(sent.payment_plan).toBeUndefined();
    expect(sent).toMatchObject({
      amount: 600,
      customer: { email: 'ngozi@example.com' },
      redirect_url: 'https://staging.arpedia.africa/account',
    });
    expect(sent.customer.name).toBeUndefined();
  });

  it.each([
    ['already_subscribed', 409],
    ['unknown_product', 404],
    ['no_email', 400],
    ['account_unavailable', 403],
    ['rate_limited', 429],
  ])('turns %s into a plain answer (%i) and calls no provider', async (code, status) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } });
    const res = await start({ kind: 'plan', code: 'monthly' });
    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error: code, message: expect.any(String) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a Flutterwave refusal is a 502, never a link', async () => {
    rpc.mockResolvedValue({ data: checkout({ flutterwave_plan_id: '1' }), error: null });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'error', message: 'nope' }), { status: 400 }),
    );
    const res = await start({ kind: 'plan', code: 'monthly' });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: 'provider_unavailable' });
  });
});

describe('safeReturnPath', () => {
  it.each([
    ['/account', '/account'],
    ['/account?checkout=1', '/account?checkout=1'],
    ['//evil.example', '/account'],
    ['https://evil.example', '/account'],
    ['/\\evil', '/account'],
    ['account', '/account'],
    [42, '/account'],
    [undefined, '/account'],
  ])('%s → %s', (input, out) => expect(safeReturnPath(input)).toBe(out));
});
