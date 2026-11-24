import { describe, expect, it } from 'vitest';
import { wranglerConfig } from './lib.mjs';
import { AUTHORS, BOOKS, chapterParagraphs, coverPng, fixedId, guard, main } from './staging-content.mjs';

const STAGING = wranglerConfig('api').env.staging.vars.SUPABASE_URL;
const PRODUCTION = wranglerConfig('api').env.production.vars.SUPABASE_URL;

describe('staging-content guard', () => {
  it('runs on the staging project with APP_ENV=staging', () => {
    expect(guard({ APP_ENV: 'staging', SUPABASE_URL: STAGING }, {})).toBe('staging');
  });

  it('refuses without APP_ENV=staging', () => {
    expect(() => guard({ SUPABASE_URL: STAGING }, {})).toThrow(/APP_ENV=staging/);
    expect(() => guard({ APP_ENV: 'production', SUPABASE_URL: STAGING }, {})).toThrow(/APP_ENV=staging/);
  });

  it('refuses production and any other host, even with APP_ENV=staging', () => {
    expect(() => guard({ APP_ENV: 'staging', SUPABASE_URL: PRODUCTION }, {})).toThrow(/staging project/);
    expect(() => guard({ APP_ENV: 'staging', SUPABASE_URL: 'https://evil.supabase.co' }, {})).toThrow(
      /staging project/,
    );
    expect(() => guard({ APP_ENV: 'staging', SUPABASE_URL: 'http://127.0.0.1:55321' }, {})).toThrow(
      /staging project/,
    );
  });

  it('refuses a missing or broken URL', () => {
    expect(() => guard({ APP_ENV: 'staging' }, {})).toThrow(/SUPABASE_URL/);
    expect(() => guard({ APP_ENV: 'staging', SUPABASE_URL: 'not a url' }, {})).toThrow(/SUPABASE_URL/);
  });

  it('--local only runs against a local stack', () => {
    expect(guard({ SUPABASE_URL: 'http://127.0.0.1:55621' }, { local: true })).toBe('local');
    expect(guard({ SUPABASE_URL: 'http://localhost:55321' }, { local: true })).toBe('local');
    expect(() => guard({ SUPABASE_URL: STAGING }, { local: true })).toThrow(/local SUPABASE_URL/);
    expect(() => guard({ SUPABASE_URL: PRODUCTION, APP_ENV: 'staging' }, { local: true })).toThrow(
      /local SUPABASE_URL/,
    );
  });

  it('main refuses before touching the network', async () => {
    const env = { APP_ENV: 'production', SUPABASE_URL: PRODUCTION, SUPABASE_SERVICE_ROLE_KEY: 'x' };
    await expect(main([], { env, log: () => {} })).rejects.toThrow(/APP_ENV=staging/);
  });

  it('main refuses a bad master key', async () => {
    const env = {
      APP_ENV: 'staging',
      SUPABASE_URL: STAGING,
      SUPABASE_SERVICE_ROLE_KEY: 'x',
      BOOK_MASTER_KEY: 'c2hvcnQ=',
    };
    await expect(main([], { env, log: () => {} })).rejects.toThrow(/32 bytes/);
  });
});

describe('staging-content data', () => {
  it('has 6 original books from 2 authors in launch genres, with chapters of different lengths', () => {
    const genres = [
      'Fiction',
      'Christian',
      'Christian romance',
      'Nigerian books',
      'African literature',
      'Faith',
      'Romance',
      'Drama',
      'Short reads',
      'Personal growth',
    ];
    expect(BOOKS).toHaveLength(6);
    expect(new Set(BOOKS.map((b) => b.author))).toEqual(new Set(AUTHORS.map((a) => a.key)));
    expect(new Set(BOOKS.flatMap((b) => b.genres)).size).toBeGreaterThanOrEqual(6);
    for (const b of BOOKS) {
      expect(b.genres.every((g) => genres.includes(g))).toBe(true);
      expect(new Set(b.chapters).size).toBeGreaterThan(1);
    }
  });

  it('authors use undeliverable seed addresses, never staff', () => {
    for (const a of AUTHORS) expect(a.email).toMatch(/@example\.com$/);
  });

  it('ids and text are the same on every run', () => {
    expect(fixedId('book:x')).toBe(fixedId('book:x'));
    expect(fixedId('book:x')).not.toBe(fixedId('book:y'));
    expect(fixedId('book:x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(chapterParagraphs('rain-keeper', 2, 900)).toEqual(chapterParagraphs('rain-keeper', 2, 900));
    const words = chapterParagraphs('rain-keeper', 2, 900).join(' ').split(/\s+/).length;
    expect(words).toBeGreaterThanOrEqual(900);
    expect(words).toBeLessThan(1100);
  });

  it('draws a valid PNG cover', () => {
    const png = coverPng(
      [
        [0, 0, 0],
        [255, 255, 255],
      ],
      4,
      6,
    );
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(4);
    expect(png.readUInt32BE(20)).toBe(6);
  });
});
