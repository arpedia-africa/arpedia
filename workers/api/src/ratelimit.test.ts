import { describe, expect, it, vi } from 'vitest';
import { keysLimitKey, overLimit, type RateLimiter } from './ratelimit';

const limiter = (success: boolean): RateLimiter & { limit: ReturnType<typeof vi.fn> } => ({
  limit: vi.fn(async () => ({ success })),
});

describe('overLimit', () => {
  it('lets a request through while the bucket has room', async () => {
    const l = limiter(true);
    expect(await overLimit(l, 'k')).toBe(false);
    expect(l.limit).toHaveBeenCalledWith({ key: 'k' });
  });
  it('stops a request once the bucket is full', async () => {
    expect(await overLimit(limiter(false), 'k')).toBe(true);
  });
  it('allows when no limiter is bound', async () => {
    expect(await overLimit(undefined, 'k')).toBe(false);
  });
  it('allows when the limiter errors (never locks readers out of their books)', async () => {
    const l: RateLimiter = { limit: async () => Promise.reject(new Error('down')) };
    expect(await overLimit(l, 'k')).toBe(false);
  });
});

describe('keysLimitKey', () => {
  it('is per reader and device', () => {
    expect(keysLimitKey('u1', 'd1')).toBe('keys:u1:d1');
    expect(keysLimitKey('u1', 'd2')).not.toBe(keysLimitKey('u1', 'd1'));
    expect(keysLimitKey('u2', 'd1')).not.toBe(keysLimitKey('u1', 'd1'));
  });
});
