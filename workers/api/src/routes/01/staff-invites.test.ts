import { beforeEach, describe, expect, it, vi } from 'vitest';

// Spec check 16-16: an invite to an address that already has an account (a reader using their work
// email) joins that account to the team instead of failing with account_exists.
const rpc = vi.fn();
const createUser = vi.fn();
const updateUserById = vi.fn();
const deleteUser = vi.fn();
vi.mock('../../db', () => ({
  serviceDb: () => ({ rpc, auth: { admin: { createUser, updateUserById, deleteUser } } }),
}));

const { default: invites } = await import('./staff-invites');

const READER = '11111111-1111-4111-8111-111111111111';
const accept = (password = 'a-long-password') =>
  invites.request(
    '/tok/accept',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) },
    {},
  );

beforeEach(() => {
  for (const f of [rpc, createUser, updateUserById, deleteUser]) f.mockReset();
  rpc.mockImplementation(async (name: string) =>
    name === 'get_staff_invite'
      ? { data: { email: 'ada@arpedia.africa', full_name: 'Ada', state: 'open' }, error: null }
      : name === 'worker_user_by_email'
        ? { data: READER, error: null }
        : { data: null, error: null },
  );
});

describe('POST /:token/accept', () => {
  it('a new address gets a new account', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'new' } }, error: null });
    const res = await accept();
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('accept_staff_invite', expect.objectContaining({ p_user: 'new' }));
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('an existing account joins the team with the chosen password', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'already registered' } });
    updateUserById.mockResolvedValue({ data: {}, error: null });
    const res = await accept();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: 'ada@arpedia.africa', existing_account: true });
    expect(rpc).toHaveBeenCalledWith('accept_staff_invite', {
      p_token_hash: expect.any(String),
      p_user: READER,
    });
    expect(updateUserById).toHaveBeenCalledWith(READER, { password: 'a-long-password', email_confirm: true });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('an existing account is never touched when the invite is no longer valid', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'already registered' } });
    rpc.mockImplementation(async (name: string) =>
      name === 'get_staff_invite'
        ? { data: { email: 'ada@arpedia.africa', full_name: 'Ada', state: 'open' }, error: null }
        : name === 'worker_user_by_email'
          ? { data: READER, error: null }
          : { data: null, error: { message: 'expired' } },
    );
    expect((await accept()).status).toBe(410);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('any other sign-up failure (rate limit, outage) never takes over an existing account', async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { code: 'over_request_rate_limit', message: 'slow down' },
    });
    expect((await accept()).status).toBe(500);
    expect(rpc).not.toHaveBeenCalledWith('worker_user_by_email', expect.anything());
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('short passwords are refused first', async () => {
    expect((await accept('short')).status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });
});
