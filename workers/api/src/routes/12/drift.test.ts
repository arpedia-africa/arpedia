import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { logDrift, phoneCountsKey } from './pipeline';

// Spec check 12-15 (flow 12 rule 11): the phone's word count is compared with the Worker's at
// verify, and a gap over 3% is logged as convert_drift.
const REV = '0a1b2c3d-0000-4000-a000-0000000000d1';
const USER = '0a1b2c3d-0000-4000-a000-000000000002';

function setup(phone?: unknown) {
  const insert = vi.fn(async () => ({ error: null }));
  const db = { from: vi.fn(() => ({ insert })) };
  const env = {
    BOOKS: {
      get: async (key: string) =>
        key === phoneCountsKey(REV) && phone !== undefined ? { json: async () => phone } : null,
    },
  } as unknown as Env;
  return { insert, db, env };
}

describe('logDrift', () => {
  it('logs convert_drift with the gap when the phone is more than 3% off', async () => {
    const { insert, db, env } = setup({ words: 10_400, user: USER });
    await logDrift(env, db as never, REV, 10_000);
    expect(db.from).toHaveBeenCalledWith('analytics_outbox');
    expect(insert).toHaveBeenCalledWith({
      event: 'convert_drift',
      distinct_id: USER,
      props: { source: 'server', pct: 4, phone_words: 10_400, worker_words: 10_000 },
    });
  });

  it('logs nothing at 3% or less, with no phone count, or a bad one', async () => {
    for (const phone of [{ words: 10_300, user: USER }, { words: 9_700 }, undefined, { words: 'many' }]) {
      const { insert, db, env } = setup(phone);
      await logDrift(env, db as never, REV, 10_000);
      expect(insert).not.toHaveBeenCalled();
    }
  });

  it('never throws, even when the database refuses the event', async () => {
    const { db, env } = setup({ words: 1 });
    db.from.mockReturnValue({ insert: vi.fn(async () => ({ error: { message: 'down' } })) } as never);
    await expect(logDrift(env, db as never, REV, 10_000)).resolves.toBeUndefined();
  });
});
