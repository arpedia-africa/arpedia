import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';

const rpc = vi.fn();
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));

const { default: covers } = await import('./covers');

const REV = '0a1b2c3d-0000-4000-a000-000000000001';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');

const objects = new Map<string, Uint8Array>();
const env = {
  SUPABASE_URL: 'http://x',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
  BOOKS: {
    get: async (key: string) => {
      const b = objects.get(key);
      return b ? { arrayBuffer: async () => b.slice().buffer, etag: 'e1' } : null;
    },
  },
} as unknown as Env;
const get = (path: string) => covers.request(path, {}, env);

beforeEach(() => {
  rpc.mockReset();
  objects.clear();
});

describe('GET /v1/covers/:rev', () => {
  it('serves a released cover as an image, cached for a day', async () => {
    rpc.mockResolvedValue({ data: `src/${REV}/cover`, error: null });
    objects.set(`src/${REV}/cover`, JPEG);
    const res = await get(`/${REV}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
    expect(rpc).toHaveBeenCalledWith('public_cover_key', { p_rev: REV });
  });

  it('is not found when the database does not release the cover', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    objects.set(`src/${REV}/cover`, JPEG);
    expect((await get(`/${REV}`)).status).toBe(404);
  });

  it('never serves bytes that are not a JPEG, PNG or WebP image', async () => {
    rpc.mockResolvedValue({ data: `src/${REV}/cover`, error: null });
    objects.set(`src/${REV}/cover`, HTML);
    expect((await get(`/${REV}`)).status).toBe(404);
  });

  it('is not found for a missing object or a malformed id (no database call)', async () => {
    rpc.mockResolvedValue({ data: `src/${REV}/cover`, error: null });
    expect((await get(`/${REV}`)).status).toBe(404);
    rpc.mockClear();
    expect((await get('/not-a-uuid')).status).toBe(404);
    expect((await get('/..%2Fsrc')).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports a database failure as a 500', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await get(`/${REV}`)).status).toBe(500);
  });
});
