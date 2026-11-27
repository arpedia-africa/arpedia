import { describe, expect, it, vi } from 'vitest';
import { refreshUserEverywhere } from './trust';

// Spec check 14-28: a sanction reaches every conversation the person is in, not only the
// reported one.
const USER = '11111111-1111-4111-8111-111111111111';
const groups = (n: number) =>
  Array.from({ length: n }, (_, i) => `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`);

function fakes(ids: string[], status = 200) {
  const calls: { gid: string; url: string; body: unknown; headers: Headers }[] = [];
  const ns = {
    idFromName: (name: string) => name,
    get: (gid: string) => ({
      fetch: vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ gid, url, body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
        return new Response('{}', { status });
      }),
    }),
  };
  const eq = vi.fn(() => ({
    limit: async () => ({ data: ids.map((group_id) => ({ group_id })), error: null }),
  }));
  const db = { from: vi.fn(() => ({ select: () => ({ eq }) })) };
  return { env: { CONVERSATION: ns as never }, db: db as never, calls, eq };
}

describe('refreshUserEverywhere', () => {
  it('asks each of the person’s conversations to re-read only their access', async () => {
    const f = fakes(groups(3));
    expect(await refreshUserEverywhere(f.env, f.db, USER)).toBe(3);
    expect(f.eq).toHaveBeenCalledWith('user_id', USER);
    expect(f.calls.map((c) => c.url)).toEqual(groups(3).map((g) => `https://do/c/${g}/refresh`));
    expect(f.calls.every((c) => (c.body as { user_id: string }).user_id === USER)).toBe(true);
    // No requester: the conversation refreshes just this person, never everyone.
    expect(f.calls.every((c) => c.headers.get('X-User-Id') === null)).toBe(true);
    expect(f.calls[0]!.headers.get('X-Group-Id')).toBe(groups(3)[0]);
  });

  it('works through many conversations in batches', async () => {
    const f = fakes(groups(45));
    expect(await refreshUserEverywhere(f.env, f.db, USER)).toBe(45);
    expect(f.calls).toHaveLength(45);
  });

  it('a failing conversation fails the item so the outbox retries it', async () => {
    const f = fakes(groups(2), 500);
    await expect(refreshUserEverywhere(f.env, f.db, USER)).rejects.toThrow(/refresh/);
  });

  it('does nothing without the binding or with a bad id', async () => {
    const f = fakes(groups(2));
    expect(await refreshUserEverywhere({}, f.db, USER)).toBe(0);
    expect(await refreshUserEverywhere(f.env, f.db, 'nope')).toBe(0);
    expect(f.calls).toHaveLength(0);
  });
});
