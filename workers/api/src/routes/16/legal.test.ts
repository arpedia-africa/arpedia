import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';

const rpc = vi.fn();
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));

const { default: legal, renderBody, resetLegalCache } = await import('./legal');

const env = { SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } as Env;
const get = (path: string) => legal.request(path, {}, env);

const POLICIES = [
  {
    slug: 'privacy',
    title: 'Privacy policy',
    subtitle: 'NDPA 2023',
    always_live: false,
    version: 3,
    published_at: '2026-11-20T09:00:00Z',
    body: '# Who we are\n\nWe are Arpedia. <script>alert(1)</script>',
  },
  {
    slug: 'delete-account',
    title: 'Delete-account page',
    subtitle: null,
    always_live: true,
    version: 1,
    published_at: '2026-01-01T00:00:00Z',
    body: 'Delete-account page',
  },
];

beforeEach(() => {
  resetLegalCache();
  rpc.mockReset();
});

describe('public legal pages', () => {
  it('shows the latest published version, escaped', async () => {
    rpc.mockResolvedValue({ data: POLICIES, error: null });
    const res = await get('/privacy');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<h1>Privacy policy</h1>');
    expect(html).toContain('Version 3 · 20 November 2026');
    expect(html).toContain('<h2>Who we are</h2>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(rpc).toHaveBeenCalledWith('get_public_policies', {});
  });

  it('lists every policy at /legal', async () => {
    rpc.mockResolvedValue({ data: POLICIES, error: null });
    const html = await (await get('/')).text();
    expect(html).toContain('href="/legal/privacy"');
    expect(html).toContain('href="/legal/delete-account"');
  });

  it('an unknown page is a 404', async () => {
    rpc.mockResolvedValue({ data: POLICIES, error: null });
    const res = await get('/nope');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('Page not found');
  });

  it('the Delete-account page always has the steps, even with placeholder text', async () => {
    rpc.mockResolvedValue({ data: POLICIES, error: null });
    const html = await (await get('/delete-account')).text();
    expect(html).toContain('How to delete your Arpedia account');
    expect(html).toContain('mailto:support@arpedia.africa?subject=Delete%20my%20account');
  });

  it('the Delete-account page stays live when the database is down; others say try again', async () => {
    rpc.mockRejectedValue(new Error('down'));
    const del = await get('/delete-account');
    expect(del.status).toBe(200);
    expect(await del.text()).toContain('How to delete your Arpedia account');
    expect((await get('/privacy')).status).toBe(503);
  });

  it('keeps serving the last copy when the database stops answering', async () => {
    rpc.mockResolvedValueOnce({ data: POLICIES, error: null });
    expect((await get('/privacy')).status).toBe(200);
    vi.useFakeTimers({ now: Date.now() + 10 * 60_000 });
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await get('/privacy')).status).toBe(200);
    expect((await get('/privacy')).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2); // the second miss waits a minute before asking again
    vi.useRealTimers();
  });
});

describe('renderBody', () => {
  it('paragraphs, headings, lists and links', () => {
    expect(
      renderBody(
        '## Your rights\n\nAsk us:\n- by email at help@arpedia.africa\n- at https://arpedia.africa/help',
      ),
    ).toBe(
      '<h3>Your rights</h3>\n<p>Ask us:</p>\n<ul><li>by email at <a href="mailto:help@arpedia.africa">help@arpedia.africa</a></li><li>at <a href="https://arpedia.africa/help">https://arpedia.africa/help</a></li></ul>',
    );
  });

  it('no nested links, quotes stay out of the link target', () => {
    expect(renderBody('See "https://arpedia.africa/@team.name".')).toBe(
      '<p>See &quot;<a href="https://arpedia.africa/@team.name">https://arpedia.africa/@team.name</a>&quot;.</p>',
    );
  });
});
