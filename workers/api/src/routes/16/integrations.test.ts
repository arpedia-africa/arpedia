import { describe, expect, it, vi } from 'vitest';

// Spec check 16-7: "Check all now" runs the checks at once, only for staff with settings access.
vi.mock('../../auth', () => ({
  requireUser: async (_c: unknown, next: () => Promise<void>) => next(),
}));
const userRpc = vi.fn();
vi.mock('../12/http', () => ({ userDb: () => ({ rpc: userRpc }) }));
const serviceRpc = vi.fn(
  async (_name: string, _args?: unknown): Promise<{ data: unknown; error: { message: string } | null }> => ({
    data: {},
    error: null,
  }),
);
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc: serviceRpc }) }));

const { default: integrations, statusFor } = await import('./integrations');

const env = { BOOKS: { head: async () => null } };
const check = () =>
  integrations.request('/check', { method: 'POST', headers: { Authorization: 'Bearer t' } }, env);

describe('POST /check', () => {
  it('runs every check right away after the permission check', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: null });
    serviceRpc.mockClear();
    const res = await check();
    expect(res.status).toBe(200);
    expect(userRpc).toHaveBeenCalledWith('request_integration_check');
    const services = serviceRpc.mock.calls
      .filter((c) => (c as unknown[])[0] === 'worker_set_integration_health')
      .map((c) => ((c as unknown[])[1] as { p_service: string }).p_service);
    expect(services).toEqual(expect.arrayContaining(['supabase', 'r2']));
  });

  it('says so when a status could not be saved, instead of reporting old rows', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: null });
    serviceRpc.mockImplementation(async (name: string) =>
      name === 'worker_set_integration_health'
        ? { data: null, error: { message: 'down' } }
        : { data: {}, error: null },
    );
    expect((await check()).status).toBe(500);
    serviceRpc.mockImplementation(async () => ({ data: {}, error: null }));
  });

  it('refuses staff without settings access and runs nothing', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Not allowed' } });
    serviceRpc.mockClear();
    const res = await check();
    expect(res.status).toBe(403);
    expect(serviceRpc).not.toHaveBeenCalled();
  });
});

describe('statusFor', () => {
  it('over 10% failing, over 2% degraded', () => {
    expect(statusFor(100, 11).status).toBe('failing');
    expect(statusFor(100, 3).status).toBe('degraded');
    expect(statusFor(0, 0)).toEqual({ status: 'working', rate: 0 });
  });
});
