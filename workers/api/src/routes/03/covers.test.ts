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

  it('serves a made JPEG size with ?w=, else the uploaded cover; refuses other widths', async () => {
    rpc.mockResolvedValue({ data: `src/${REV}/cover`, error: null });
    const SMALL = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    objects.set(`src/${REV}/cover`, PNG);
    objects.set(`cover/${REV}/240.jpg`, SMALL);
    const sized = await get(`/${REV}?w=240`);
    expect(sized.status).toBe(200);
    expect(sized.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await sized.arrayBuffer())).toEqual(SMALL);
    const fallback = await get(`/${REV}?w=480`);
    expect(fallback.headers.get('Content-Type')).toBe('image/png');
    expect((await get(`/${REV}?w=500`)).status).toBe(400);
    expect((await get(`/${REV}?w=`)).status).toBe(400);
  });

  it('never serves a size when the database does not release the cover', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    objects.set(`cover/${REV}/240.jpg`, JPEG);
    expect((await get(`/${REV}?w=240`)).status).toBe(404);
  });

  it('reports a database failure as a 500', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await get(`/${REV}`)).status).toBe(500);
  });
});
