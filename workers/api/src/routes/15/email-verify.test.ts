import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));

const { default: verify } = await import('./email-verify');

const T = 'ab'.repeat(24);
const env = {} as never;
const post = (t: string) => verify.request('/', { method: 'POST', body: new URLSearchParams({ t }) }, env);

beforeEach(() => rpc.mockReset());

describe('email verify link', () => {
  it('opening the link only shows a Confirm button (scanners never use the token)', async () => {
    const r = await verify.request(`/?t=${T}`, {}, env);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('Confirm my email');
    expect(html).toContain(`value="${T}"`);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a malformed token is refused without a database call', async () => {
    expect((await verify.request('/?t=<script>', {}, env)).status).toBe(400);
    expect((await post('nope')).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('confirming: verified, expired and invalid answers', async () => {
    rpc.mockResolvedValueOnce({ data: 'verified', error: null });
    const ok = await post(T);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('Your email is confirmed');
    expect(rpc).toHaveBeenCalledWith('confirm_email_verification', { p_token: T });

    rpc.mockResolvedValueOnce({ data: 'expired', error: null });
    expect((await post(T)).status).toBe(410);
    rpc.mockResolvedValueOnce({ data: 'invalid', error: null });
    expect((await post(T)).status).toBe(400);
  });
});
