import { imageSize } from '@arpedia/convert';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv, Env } from '../../env';

// Spec check 12-5: Accept suggestion on an `image_too_large` flag shrinks the image through the
// Images binding and writes a working-copy version that holds every image.
const STAFF = '0a1b2c3d-0000-4000-a000-000000000002';
const REV = '0a1b2c3d-0000-4000-a000-0000000000d1';
const FLAG = '0a1b2c3d-0000-4000-a000-0000000000e1';
const UID = '0a1b2c3d-0000-4000-f000-000000000001';

const rpc = vi.fn();
const rev = { id: REV, book_id: 'b', status: 'needs_fixes', work_version: 2 };
const flag = { fix_op: { op: 'shrink_image', image: 'img/1.jpg' }, status: 'open' };
function query(table: string) {
  const q = {
    select: () => q,
    eq: () => q,
    in: () => q,
    single: async () => ({ data: table === 'book_flags' ? flag : rev, error: null }),
    then: (ok: (v: unknown) => void) => ok({ data: [{ role: 'publisher' }], error: null }),
  };
  return q;
}
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc, from: query }) }));
const { default: staff } = await import('./staff');

function jpeg(width: number, height: number, bytes = 64) {
  const b = new Uint8Array(bytes);
  b.set([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255]);
  return b;
}
/** Halves until the long side fits the asked box (enough for the route; images.test covers sizes). */
const IMAGES = {
  input: (s: ReadableStream<Uint8Array>) => {
    let box = Infinity;
    const h = {
      transform: (t: { width?: number; height?: number }) => ((box = t.width ?? t.height ?? box), h),
      output: async () => {
        const src = imageSize(new Uint8Array(await new Response(s).arrayBuffer()))!;
        const k = Math.min(1, box / Math.max(src.width, src.height));
        const out = jpeg(Math.round(src.width * k), Math.round(src.height * k), 40);
        return { image: () => new Blob([out]).stream(), contentType: () => 'image/jpeg' };
      },
    };
    return h;
  },
} as unknown as ImagesBinding;

const img = { path: 'img/1.jpg', width: 2400, height: 3600, bytes: 3_000_000, alone: true };
const work = {
  v: 1,
  chapters: [
    {
      title: 'One',
      titled: true,
      kind: 'chapter',
      words: 300,
      imagePages: 1,
      pages: 2.2,
      blocks: [
        { html: '<p>Words</p>', text: 'Words', words: 300 },
        { html: '<img src="img/1.jpg"/>', text: '', words: 0, images: [img] },
        { html: '<img src="img/2.png"/>', text: '', words: 0, images: [{ ...img, path: 'img/2.png' }] },
      ],
    },
  ],
  anchors: { uids: [UID], ids: [['p_a', 'p_b', 'p_c']], fps: [['a', 'b', 'c']] },
  words: 300,
  pages: 3,
  price: 2,
  imagesFrom: 1,
};

const objects = new Map<string, Uint8Array>();
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
const BOOKS = {
  get: async (key: string) => {
    const b = objects.get(key);
    return b
      ? {
          arrayBuffer: async () => b.slice().buffer,
          json: async () => JSON.parse(new TextDecoder().decode(b)),
        }
      : null;
  },
  put: async (key: string, body: Uint8Array | string) =>
    void objects.set(key, typeof body === 'string' ? new TextEncoder().encode(body) : body),
};

const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  c.set('user', { sub: STAFF } as AppEnv['Variables']['user']);
  await next();
});
app.route('/', staff);
const fix = async (env: Partial<Env>) => {
  const res = await app.request(
    '/fix',
    {
      method: 'POST',
      body: JSON.stringify({ revision_id: REV, flag_id: FLAG, expected_version: 2 }),
      headers: { 'Content-Type': 'application/json' },
    },
    { BOOKS, ...env } as unknown as Env,
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: { fix_id: 'f', work_version: 3, readiness: 92, blocking: false },
    error: null,
  });
  objects.clear();
  objects.set(`work/${REV}/v2/book.json`, enc(work));
  objects.set(`work/${REV}/v1/img/1.jpg`, jpeg(2400, 3600, 3000));
  objects.set(`work/${REV}/v1/img/2.png`, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]));
});

describe('POST /fix shrink_image', () => {
  it('shrinks the image to 1,600 px and writes the next version with every image', async () => {
    const res = await fix({ IMAGES });
    expect(res).toEqual({
      status: 200,
      json: { fix_id: 'f', work_version: 3, readiness: 92, blocking: false },
    });
    const next = JSON.parse(new TextDecoder().decode(objects.get(`work/${REV}/v3/book.json`)!));
    expect(next.imagesFrom).toBeUndefined();
    expect(next.chapters[0].blocks[1].images[0]).toEqual({ ...img, width: 1067, height: 1600, bytes: 40 });
    expect(imageSize(objects.get(`work/${REV}/v3/img/1.jpg`)!)).toEqual({ width: 1067, height: 1600 });
    expect(objects.get(`work/${REV}/v3/img/2.png`)).toEqual(objects.get(`work/${REV}/v1/img/2.png`));
    // the old version still has the original, for Undo
    expect(imageSize(objects.get(`work/${REV}/v1/img/1.jpg`)!)).toEqual({ width: 2400, height: 3600 });
    expect(rpc).toHaveBeenCalledWith(
      'record_fix',
      expect.objectContaining({
        p_flag: FLAG,
        p_op: { op: 'shrink_image', image: 'img/1.jpg', size: { width: 1067, height: 1600, bytes: 40 } },
        p_inverse: { restore_version: 2 },
      }),
    );
  });

  it('keeps the flag open with plain advice when Images is not available', async () => {
    const res = await fix({});
    expect(res.status).toBe(409);
    expect(res.json.error).toBe(
      'This image could not be shrunk. Dismiss the flag or send the book to the desk.',
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(objects.has(`work/${REV}/v3/book.json`)).toBe(false);
  });

  it('says so when the image is gone from the working copy', async () => {
    objects.delete(`work/${REV}/v1/img/1.jpg`);
    const res = await fix({ IMAGES });
    expect(res).toEqual({ status: 409, json: { error: 'That image is no longer in the book.' } });
    expect(rpc).not.toHaveBeenCalled();
  });
});
