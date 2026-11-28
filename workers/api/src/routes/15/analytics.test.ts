import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { flushAnalytics, posthogBatch, type OutboxRow } from './analytics';

const rpc = vi.fn();
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));

const ROWS: OutboxRow[] = [
  {
    id: 7,
    event: 'cycle_closed',
    distinct_id: 'staff-1',
    props: { month: '2026-10', authors: 3, kobo: 480000 },
    at: '2026-11-01T00:05:00Z',
  },
  {
    id: 8,
    event: 'payout_settled',
    distinct_id: 'author-1',
    props: { status: 'successful' },
    at: '2026-11-15T09:00:00Z',
  },
];
const env = (over: Partial<Env> = {}) => ({ APP_ENV: 'staging', POSTHOG_KEY: 'phc_test', ...over }) as Env;

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) =>
    fn === 'analytics_outbox_take' ? { data: ROWS, error: null } : { data: 2, error: null },
  );
});

describe('server analytics (flow 15, 15-26)', () => {
  it('shapes a PostHog batch with the time, environment and outbox id', () => {
    expect(posthogBatch('phc_x', ROWS, 'production').batch[0]).toEqual({
      event: 'cycle_closed',
      distinct_id: 'staff-1',
      timestamp: '2026-11-01T00:05:00Z',
      properties: {
        month: '2026-10',
        authors: 3,
        kobo: 480000,
        app_env: 'production',
        $lib: 'arpedia-api',
        outbox_id: 7,
      },
    });
  });

  it('sends the batch to the host and marks the rows sent', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    expect(await flushAnalytics(env({ POSTHOG_HOST: 'https://eu.i.posthog.com/' }), fetcher)).toBe(2);
    expect(fetcher).toHaveBeenCalledWith(
      'https://eu.i.posthog.com/batch/',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.api_key).toBe('phc_test');
    expect(body.batch).toHaveLength(2);
    expect(rpc).toHaveBeenCalledWith('analytics_outbox_done', { p_ids: [7, 8] });
  });

  it('without a key sends nothing (the outbox still purges old rows)', async () => {
    const fetcher = vi.fn();
    expect(await flushAnalytics(env({ POSTHOG_KEY: undefined }), fetcher)).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('analytics_outbox_take', { p_limit: 200 });
    expect(rpc).not.toHaveBeenCalledWith('analytics_outbox_done', expect.anything());
  });

  it('a PostHog error leaves the rows for the next minute', async () => {
    const fetcher = vi.fn(async () => new Response('no', { status: 503 }));
    await expect(flushAnalytics(env(), fetcher)).rejects.toThrow('posthog batch 503');
    expect(rpc).not.toHaveBeenCalledWith('analytics_outbox_done', expect.anything());
  });

  it('never sends to a plain-http host', async () => {
    const fetcher = vi.fn();
    expect(await flushAnalytics(env({ POSTHOG_HOST: 'http://example.com' }), fetcher)).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
