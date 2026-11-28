import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec check 14-14: the same text in many channels. Only the chat Worker (internal key) may ask,
// because the answer says what a sender wrote elsewhere; pgTAP 14_cross_channel_spam_test.sql
// covers the SQL.
const rpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) => {
  if (fn === 'get_moderation_rules') return { data: { words: [], settings: {} }, error: null };
  if (fn === 'cross_channel_spam') return { data: spam, error: null };
  throw new Error(`unexpected rpc ${fn}`);
});
let spam = false;
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));
vi.mock('@arpedia/core/jwt', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  verifySupabaseJwt: vi.fn(async (token: string) => {
    if (token !== 'reader-token')
      throw new (await orig<{ AuthError: new (m: string) => Error }>()).AuthError('bad');
    return { sub: 'reader' };
  }),
}));

const { default: trust } = await import('./trust');

const env = { SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_URL: 'http://db', APP_ENV: 'local' };
const SENDER = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';
const moderate = (body: unknown, headers: Record<string, string>) =>
  trust.request(
    '/moderate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    env,
  );
const internal = { 'X-Internal-Key': 'svc' };
const spamCalls = () => rpc.mock.calls.filter(([fn]) => fn === 'cross_channel_spam');

beforeEach(() => {
  rpc.mockClear();
  spam = false;
});

describe('POST /moderate: same text in many channels', () => {
  it('hides a message the database calls spam, for the chat Worker', async () => {
    spam = true;
    const res = await moderate(
      { text: 'buy cheap credits', surface: 'chat', sender_id: SENDER, group_id: GROUP },
      internal,
    );
    expect(await res.json()).toMatchObject({ action: 'hide', reason: 'spam' });
    expect(spamCalls()[0]![1]).toEqual({ p_user: SENDER, p_group: GROUP, p_text: 'buy cheap credits' });
  });

  it('allows it when the database says no', async () => {
    const res = await moderate(
      { text: 'hello all', surface: 'dm', sender_id: SENDER, group_id: GROUP },
      internal,
    );
    expect(await res.json()).toMatchObject({ action: 'allow' });
    expect(spamCalls()).toHaveLength(1);
  });

  it('never asks for a reader calling with their own token, or without a sender and group', async () => {
    spam = true;
    const asReader = await moderate(
      { text: 'buy cheap credits', surface: 'chat', sender_id: SENDER, group_id: GROUP },
      { Authorization: 'Bearer reader-token' },
    );
    expect(asReader.status).toBe(200);
    expect(await asReader.json()).toMatchObject({ action: 'allow' });
    await moderate({ text: 'buy cheap credits', surface: 'chat' }, internal);
    await moderate({ text: 'buy', surface: 'review', sender_id: SENDER, group_id: GROUP }, internal);
    await moderate({ text: 'buy', surface: 'chat', sender_id: 'not-a-uuid', group_id: GROUP }, internal);
    expect(spamCalls()).toHaveLength(0);
  });

  it('refuses callers without a key or token', async () => {
    expect((await moderate({ text: 'x' }, {})).status).toBe(401);
    expect((await moderate({ text: 'x' }, { 'X-Internal-Key': 'wrong' })).status).toBe(401);
  });
});
