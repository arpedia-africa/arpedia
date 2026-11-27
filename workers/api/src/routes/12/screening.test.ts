import type { WorkChapter } from '@arpedia/convert';
import { describe, expect, it } from 'vitest';
import { chunks, MODERATION_MODEL, screenBook } from './screening';

const chapter = (texts: string[], front: WorkChapter['front'] = null): WorkChapter =>
  ({
    title: 'Chapter',
    titled: true,
    kind: 'chapter',
    parentOrd: null,
    front,
    blocks: texts.map((text) => ({ text })),
    words: 0,
    wordsBefore: 0,
    imagePages: 0,
    pages: 0,
  }) as unknown as WorkChapter;

const book = [
  chapter(['Copyright 2026'], 'copyright'),
  chapter(['It was raining.']),
  chapter(['The end came.']),
];
const key = { MODERATION_API_KEY: 'test-key' };

interface Result {
  flagged: boolean;
  categories?: Record<string, boolean>;
  category_scores?: Record<string, number>;
}

/** A fetch that answers one moderation result per input, from `per`. */
function moderation(per: (text: string) => Result) {
  const calls: { url: string; body: { model: string; input: string[] }; auth: string | null }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { model: string; input: string[] };
    calls.push({ url, body, auth: new Headers(init.headers).get('authorization') });
    return Response.json({ results: body.input.map(per) });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe('screening (12-3)', () => {
  it('skips both checks without a provider, and never calls out', async () => {
    let called = false;
    const r = await screenBook({}, book, {
      fetcher: (async () => ((called = true), new Response())) as unknown as typeof fetch,
    });
    expect(called).toBe(false);
    expect(r).toEqual({
      flags: [],
      checks: {
        plagiarism: { status: 'skipped', reason: 'not_configured' },
        policy: { status: 'skipped', reason: 'not_configured' },
      },
    });
  });

  it('sends the book text (no front matter) to the moderation model and passes a clean book', async () => {
    const m = moderation(() => ({ flagged: false, categories: {} }));
    const r = await screenBook(key, book, { fetcher: m.fetcher });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.url).toBe('https://api.openai.com/v1/moderations');
    expect(m.calls[0]!.auth).toBe('Bearer test-key');
    expect(m.calls[0]!.body).toEqual({
      model: MODERATION_MODEL,
      input: ['It was raining.', 'The end came.'],
    });
    expect(r.flags).toEqual([]);
    expect(r.checks.policy).toEqual({ status: 'ok' });
  });

  it('a serious category is a blocking hit; others are one borderline flag', async () => {
    const m = moderation((t): Result =>
      t.startsWith('It')
        ? {
            flagged: true,
            categories: { 'sexual/minors': true, violence: true },
            category_scores: { 'sexual/minors': 0.8, violence: 0.7 },
          }
        : { flagged: true, categories: { violence: true }, category_scores: { violence: 0.6 } },
    );
    const r = await screenBook(key, book, { fetcher: m.fetcher });
    expect(r.flags.map((f) => f.check_key)).toEqual(['policy_hit', 'policy_borderline']);
    expect(r.flags[0]).toMatchObject({ location: { chapter_ord: 1 } });
    expect(r.flags[0]!.message).toContain('sexual content involving minors in one chapter');
    expect(r.flags[1]!.message).toBe(
      'The content check found possible violence in 2 chapters. Check that the content notes say so.',
    );
  });

  it('a serious category under its threshold is only borderline', async () => {
    const m = moderation(() => ({
      flagged: true,
      categories: { 'illicit/violent': true },
      category_scores: { 'illicit/violent': 0.4 },
    }));
    const r = await screenBook(key, book, { fetcher: m.fetcher });
    expect(r.flags.map((f) => f.check_key)).toEqual(['policy_borderline']);
  });

  it('a provider error or a bad answer is skipped, not a failure', async () => {
    const down = (async () => new Response('busy', { status: 503 })) as unknown as typeof fetch;
    expect((await screenBook(key, book, { fetcher: down })).checks.policy).toEqual({
      status: 'skipped',
      reason: 'provider_error',
    });
    const odd = (async () => Response.json({ results: [] })) as unknown as typeof fetch;
    expect((await screenBook(key, book, { fetcher: odd })).checks.policy).toEqual({
      status: 'skipped',
      reason: 'provider_error',
    });
    const broken = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect((await screenBook(key, book, { fetcher: broken })).flags).toEqual([]);
  });

  it('a provider slower than the timeout is skipped as a timeout', async () => {
    const slow = ((_: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
      )) as unknown as typeof fetch;
    const r = await screenBook(key, book, { fetcher: slow, timeoutMs: 20 });
    expect(r.checks.policy).toEqual({ status: 'skipped', reason: 'timeout' });
  });

  it('splits long chapters and spreads at most 32 pieces over the book', () => {
    const long = chapter(['x'.repeat(14_000)]);
    expect(chunks([long]).map((c) => c.text.length)).toEqual([6000, 6000, 2000]);
    const many = Array.from({ length: 100 }, () => chapter(['y'.repeat(5_000)]));
    const picked = chunks(many);
    expect(picked).toHaveLength(32);
    expect(picked[0]!.ord).toBe(0);
    expect(picked[31]!.ord).toBeGreaterThan(90);
  });
});
