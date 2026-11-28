// Image work for the book pipeline through the Cloudflare Images binding (`IMAGES`, flow 12 Open
// question default: the Images binding, with the author-side flag when it is unavailable).
//   - rule 6 / 24: book images are capped at 1,600 px on the long side (verify shrinks them, and
//     staff "Accept suggestion" on an `image_too_large` flag shrinks one through `shrink_image`);
//   - rule 17 / 18: covers in 120, 240, 480 and 960 px wide JPEG under `cover/{rev}/`.
// Every function returns null when there is no binding or the binding fails, so a missing Images
// product never blocks a book: the flag stays open and the reader falls back to the uploaded cover.
import { IMAGE_MAX_BYTES, IMAGE_MAX_PX, imageSize, imageType } from '@arpedia/convert';
import { COVER_WIDTHS } from '@arpedia/core';
import type { Env } from '../../env';

export { COVER_WIDTHS };
export type CoverWidth = (typeof COVER_WIDTHS)[number];
export const coverPrefix = (rev: string) => `cover/${rev}/`;
export const coverSizeKey = (rev: string, width: CoverWidth) => `${coverPrefix(rev)}${width}.jpg`;

const FORMAT = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

const stream = (bytes: Uint8Array) => new Blob([bytes]).stream();
const read = async (s: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(s).arrayBuffer());

/** True when an image breaks the 2 MB / 1,600 px rule (the `image_too_large` check). */
export const tooLarge = (img: { width: number; height: number; bytes: number }) =>
  img.bytes > IMAGE_MAX_BYTES || Math.max(img.width, img.height) > IMAGE_MAX_PX;

export interface Shrunk {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/**
 * The image at most 1,600 px on its long side, in its own format (so its working-copy path and the
 * chapter HTML that points at it stay the same). JPEG and WebP are re-encoded at quality 85, which
 * also brings most oversized files under 2 MB. GIFs are left alone (animation). Null when the
 * binding is missing, fails, or returns something that is not the same kind of image.
 */
export async function shrinkImage(env: Env, bytes: Uint8Array): Promise<Shrunk | null> {
  const kind = imageType(bytes);
  if (!env.IMAGES || !kind || kind === 'gif') return null;
  const size = imageSize(bytes);
  const long = size ? Math.max(size.width, size.height) : IMAGE_MAX_PX;
  try {
    const out = await env.IMAGES.input(stream(bytes))
      .transform(
        long > IMAGE_MAX_PX
          ? size!.width >= size!.height
            ? { width: IMAGE_MAX_PX, fit: 'scale-down' }
            : { height: IMAGE_MAX_PX, fit: 'scale-down' }
          : {},
      )
      .output({ format: FORMAT[kind], ...(kind === 'png' ? {} : { quality: 85 }) });
    const result = await read(out.image());
    const got = imageType(result) === kind ? imageSize(result) : null;
    if (!got || Math.max(got.width, got.height) > IMAGE_MAX_PX) return null;
    return { bytes: result, ...got };
  } catch (e) {
    console.error('[images] shrink failed', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The four cover widths as JPEG (never wider than the upload). Null when they can't be made. */
export async function coverSizes(
  env: Env,
  bytes: Uint8Array,
): Promise<Record<CoverWidth, Uint8Array> | null> {
  const kind = imageType(bytes);
  if (!env.IMAGES || !kind || kind === 'gif') return null;
  try {
    const sizes = await Promise.all(
      COVER_WIDTHS.map(async (width) => {
        const out = await env
          .IMAGES!.input(stream(bytes))
          .transform({ width, fit: 'scale-down' })
          .output({ format: 'image/jpeg', quality: 85, background: '#ffffff' });
        const jpeg = await read(out.image());
        if (imageType(jpeg) !== 'jpeg') throw new Error('not a JPEG');
        return [width, jpeg] as const;
      }),
    );
    return Object.fromEntries(sizes) as Record<CoverWidth, Uint8Array>;
  } catch (e) {
    console.error('[images] cover sizes failed', e instanceof Error ? e.message : e);
    return null;
  }
}

const COVER_KEY = /^src\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/cover$/;

/**
 * Writes `cover/{rev}/{120,240,480,960}.jpg` from a revision's uploaded cover (`src/{rev}/cover`).
 * They go under the revision that uploaded the cover, the id in the public cover URL (`coverUrl`),
 * so an update that keeps the old cover reuses its sizes. A cover never changes, so sizes already
 * there are kept (a retried seal does no work twice).
 */
export async function writeCoverSizes(env: Env, coverKey: string | null): Promise<boolean> {
  const rev = COVER_KEY.exec(coverKey ?? '')?.[1];
  if (!coverKey || !rev || !env.IMAGES) return false;
  if (await env.BOOKS.head(coverSizeKey(rev, 960))) return true;
  const obj = await env.BOOKS.get(coverKey);
  if (!obj) return false;
  const sizes = await coverSizes(env, new Uint8Array(await obj.arrayBuffer()));
  if (!sizes) return false;
  // 960 last: it marks the set as complete for the check above
  await Promise.all(
    COVER_WIDTHS.filter((w) => w !== 960).map((w) =>
      env.BOOKS.put(coverSizeKey(rev, w), sizes[w], { httpMetadata: { contentType: 'image/jpeg' } }),
    ),
  );
  await env.BOOKS.put(coverSizeKey(rev, 960), sizes[960], { httpMetadata: { contentType: 'image/jpeg' } });
  return true;
}
