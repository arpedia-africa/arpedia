import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';

const rpc = vi.fn();
const signInWithPassword = vi.fn();
const serviceDb = vi.fn(() => ({ rpc, auth: { signInWithPassword } }));
vi.mock('../../db', () => ({ serviceDb }));

const { default: signIn } = await import('./staff-sign-in');

const env = { SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } as Env;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  signIn.request(
    '/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
    env,
  );

beforeEach(() => {
  rpc.mockReset();
  signInWithPassword.mockReset();
  serviceDb.mockClear();
});

describe('password sign-in with the per-email lockout (spec check 01-3)', () => {
  it('a locked email is refused before the password is tried', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    const res = await post({ email: ' Ngozi@Example.com ', password: 'pw' });
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: 'locked' });
    expect(rpc).toHaveBeenCalledWith('staff_signin_locked', { p_email: 'ngozi@example.com' });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('a wrong password is counted and refused', async () => {
    rpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { status: 400 } });
    const res = await post({ email: 'ngozi@example.com', password: 'nope' });
    expect(res.status).toBe(401);
    expect(rpc).toHaveBeenLastCalledWith('note_staff_signin_failure', { p_email: 'ngozi@example.com' });
  });

  it("Supabase's own limit is passed on and not counted", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { status: 429 } });
    const res = await post({ email: 'ngozi@example.com', password: 'pw' });
    expect(res.status).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a good password returns the session and forwards the caller IP', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'a', refresh_token: 'r' } },
      error: null,
    });
    const res = await post(
      { email: 'ngozi@example.com', password: 'pw' },
      { 'CF-Connecting-IP': '102.89.1.2' },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'a', refresh_token: 'r' });
    expect(serviceDb).toHaveBeenCalledWith(env, { 'Sb-Forwarded-For': '102.89.1.2' });
  });

  it('an Auth outage is not counted as a wrong password', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { status: 503, message: 'down' },
    });
    await expect(post({ email: 'ngozi@example.com', password: 'pw' })).resolves.toHaveProperty('status', 500);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('missing fields are refused without a lookup', async () => {
    const res = await post({ email: '', password: 'pw' });
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
