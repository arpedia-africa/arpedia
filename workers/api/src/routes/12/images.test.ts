import { imageSize, type VerifyOk } from '@arpedia/convert';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import { coverSizeKey, coverSizes, shrinkImage, tooLarge, writeCoverSizes } from './images';

const REV = '0a1b2c3d-0000-4000-d000-000000000001';

/** A JPEG with a SOF0 header of the given size (imageSize reads it), padded to `bytes`. */
function jpeg(width: number, height: number, bytes = 64) {
  const b = new Uint8Array(Math.max(bytes, 16));
  b.set([0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, height >> 8, height & 255, width >> 8, width & 255]);
  return b;
}
/** A PNG header with the given size (imageSize reads the IHDR chunk). */
function png(width: number, height: number, bytes = 33) {
  const b = new Uint8Array(Math.max(bytes, 33));
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

/**
 * A stand-in for the Images binding: reads the input's size from its header and "resizes" by
 * writing a header of the new size in the asked format. Records every transform and output.
 */
function fakeImages(opts: { fail?: boolean; wrongFormat?: boolean } = {}) {
  const calls: { transform: Record<string, unknown>; output: Record<string, unknown> }[] = [];
  const binding = {
    input(stream: ReadableStream<Uint8Array>) {
      const t: Record<string, unknown> = {};
      const h = {
        transform(x: Record<string, unknown>) {
          Object.assign(t, x);
          return h;
        },
        async output(o: { format: string }) {
          if (opts.fail) throw new Error('images unavailable');
          calls.push({ transform: { ...t }, output: o });
          const src = new Uint8Array(await new Response(stream).arrayBuffer());
          const size = imageSize(src)!;
          const scale = Math.min(
            1,
            typeof t.width === 'number' ? t.width / size.width : 1,
            typeof t.height === 'number' ? t.height / size.height : 1,
          );
          const w = Math.round(size.width * scale);
          const hh = Math.round(size.height * scale);
          const out = o.format === 'image/png' && !opts.wrongFormat ? png(w, hh, 200) : jpeg(w, hh, 100);
          return { image: () => new Blob([out]).stream(), contentType: () => o.format };
        },
      };
      return h;
    },
  };
  return { binding: binding as unknown as ImagesBinding, calls };
}

function bucket() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    BOOKS: {
      get: async (k: string) => {
        const b = objects.get(k);
        return b ? { arrayBuffer: async () => b.slice().buffer } : null;
      },
      head: async (k: string) => (objects.has(k) ? {} : null),
      put: vi.fn(async (k: string, b: Uint8Array) => void objects.set(k, b)),
    },
  };
}

describe('tooLarge', () => {
  it('is the 2 MB / 1,600 px rule', () => {
    expect(tooLarge({ width: 1600, height: 1200, bytes: 2 * 1024 * 1024 })).toBe(false);
    expect(tooLarge({ width: 1200, height: 1601, bytes: 10 })).toBe(true);
    expect(tooLarge({ width: 100, height: 100, bytes: 2 * 1024 * 1024 + 1 })).toBe(true);
  });
});

describe('shrinkImage', () => {
  it('caps the long side at 1,600 px in the same format', async () => {
    const { binding, calls } = fakeImages();
    const out = await shrinkImage({ IMAGES: binding } as Env, jpeg(2400, 3600));
    expect(out).toMatchObject({ width: 1067, height: 1600 });
    expect(calls[0]).toEqual({
      transform: { height: 1600, fit: 'scale-down' },
      output: { format: 'image/jpeg', quality: 85 },
    });
    const wide = await shrinkImage({ IMAGES: binding } as Env, png(4000, 1000));
    expect(wide).toMatchObject({ width: 1600, height: 400 });
    expect(calls[1]).toEqual({
      transform: { width: 1600, fit: 'scale-down' },
      output: { format: 'image/png' },
    });
  });

  it('re-encodes a small but heavy JPEG without resizing it', async () => {
    const { binding, calls } = fakeImages();
    expect(await shrinkImage({ IMAGES: binding } as Env, jpeg(1200, 800, 3_000_000))).toMatchObject({
      width: 1200,
      height: 800,
    });
    expect(calls[0]!.transform).toEqual({});
  });

  it('is null with no binding, for a GIF or junk, when the binding fails or changes the format', async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x06, 0x40, 0x06]);
    expect(await shrinkImage({} as Env, jpeg(2400, 3600))).toBeNull();
    expect(await shrinkImage({ IMAGES: fakeImages().binding } as Env, gif)).toBeNull();
    expect(await shrinkImage({ IMAGES: fakeImages().binding } as Env, new Uint8Array(40))).toBeNull();
    expect(
      await shrinkImage({ IMAGES: fakeImages({ fail: true }).binding } as Env, jpeg(2400, 3600)),
    ).toBeNull();
    expect(
      await shrinkImage({ IMAGES: fakeImages({ wrongFormat: true }).binding } as Env, png(4000, 1000)),
    ).toBeNull();
  });
});

describe('cover sizes', () => {
  it('makes 120, 240, 480 and 960 px wide JPEGs, never wider than the upload', async () => {
    const { binding, calls } = fakeImages();
    const sizes = await coverSizes({ IMAGES: binding } as Env, png(800, 1200));
    expect(Object.keys(sizes!)).toEqual(['120', '240', '480', '960']);
    expect(calls.map((c) => c.transform)).toEqual(
      [120, 240, 480, 960].map((width) => ({ width, fit: 'scale-down' })),
    );
    expect(calls.every((c) => c.output.format === 'image/jpeg')).toBe(true);
  });

  it('writes them under the revision that uploaded the cover, once', async () => {
    const { binding } = fakeImages();
    const b = bucket();
    const env = { IMAGES: binding, BOOKS: b.BOOKS } as unknown as Env;
    b.objects.set(`src/${REV}/cover`, jpeg(1600, 2400));
    expect(await writeCoverSizes(env, `src/${REV}/cover`)).toBe(true);
    expect([...b.objects.keys()].filter((k) => k.startsWith('cover/')).sort()).toEqual(
      [120, 240, 480, 960].map((w) => `cover/${REV}/${w}.jpg`).sort(),
    );
    expect(b.BOOKS.put.mock.calls.at(-1)![0]).toBe(coverSizeKey(REV, 960)); // the 960 marks it done
    b.BOOKS.put.mockClear();
    expect(await writeCoverSizes(env, `src/${REV}/cover`)).toBe(true);
    expect(b.BOOKS.put).not.toHaveBeenCalled();
  });

  it('writes nothing with no binding, no cover, an odd key or a failing binding', async () => {
    const b = bucket();
    b.objects.set(`src/${REV}/cover`, jpeg(1600, 2400));
    const env = (images?: ImagesBinding) => ({ IMAGES: images, BOOKS: b.BOOKS }) as unknown as Env;
    expect(await writeCoverSizes(env(), `src/${REV}/cover`)).toBe(false);
    expect(await writeCoverSizes(env(fakeImages().binding), null)).toBe(false);
    expect(await writeCoverSizes(env(fakeImages().binding), `work/${REV}/v1/img/1.jpg`)).toBe(false);
    expect(await writeCoverSizes(env(fakeImages({ fail: true }).binding), `src/${REV}/cover`)).toBe(false);
    expect(b.BOOKS.put).not.toHaveBeenCalled();
  });
});

describe('capImages (verify, rule 6)', () => {
  const ok = (): VerifyOk => {
    const big = { path: 'img/1.jpg', width: 2400, height: 3600, bytes: 64, alone: true };
    const gif = { path: 'img/2.gif', width: 1700, height: 100, bytes: 10, alone: false };
    const small = { path: 'img/3.png', width: 400, height: 300, bytes: 33, alone: false };
    const flag = (image: string) => ({
      check_key: 'image_too_large',
      message: 'An image is larger than it needs to be.',
      location: { chapter_ord: 0, block: 0, image },
    });
    return {
      ok: true,
      chapters: [
        {
          title: 'One',
          titled: true,
          kind: 'chapter',
          parentOrd: null,
          front: null,
          wordsBefore: 0,
          priceCredits: 1,
          words: 0,
          imagePages: 1,
          pages: 1,
          blocks: [{ html: '', text: '', words: 0, images: [big, gif, small] }],
        },
      ],
      images: {
        'img/1.jpg': jpeg(2400, 3600),
        'img/2.gif': new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0xa4, 0x06, 0x64, 0]),
        'img/3.png': png(400, 300),
      },
      words: 0,
      pages: 1,
      price: 1,
      preview: { chapter_ord: 0, para_index: 0, percent: 10 } as unknown as VerifyOk['preview'],
      flags: [flag('img/1.jpg'), flag('img/2.gif'), { check_key: 'too_short', message: 'Short.' }],
      untitledBook: false,
      tocChapters: null,
    };
  };

  it('shrinks oversized images before the copy is saved and drops their flags', async () => {
    const { capImages } = await import('./pipeline');
    const v = ok();
    await capImages({ IMAGES: fakeImages().binding } as Env, v);
    expect(imageSize(v.images['img/1.jpg']!)).toEqual({ width: 1067, height: 1600 });
    expect(v.chapters[0]!.blocks[0]!.images![0]).toMatchObject({ width: 1067, height: 1600, bytes: 100 });
    expect(v.chapters[0]!.blocks[0]!.images![2]).toMatchObject({ width: 400, height: 300 });
    // a GIF can't be shrunk here, so its flag stays for staff
    expect(v.flags.map((f) => f.location?.image ?? f.check_key)).toEqual(['img/2.gif', 'too_short']);
  });

  it('changes nothing without the binding', async () => {
    const { capImages } = await import('./pipeline');
    const v = ok();
    await capImages({} as Env, v);
    expect(v).toEqual(ok());
  });
});
