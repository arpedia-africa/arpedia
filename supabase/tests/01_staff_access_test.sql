-- Flow 01 · flow 16 pass 1: has_permission with two-step, matrix per role, invites,
-- at-least-2-Super-admins, disable, backup codes, lockouts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Seeded Super admins become Operations admins inside this test so the counts below are ours.
update public.staff_roles set role = 'operations_admin' where role = 'super_admin';

insert into auth.users (id, email) values
  ('30000000-0000-4000-a000-000000000001', 'sa1@arpedia.africa'),
  ('30000000-0000-4000-a000-000000000002', 'sa2@arpedia.africa'),
  ('30000000-0000-4000-a000-000000000003', 'pub@arpedia.africa'),
  ('30000000-0000-4000-a000-000000000004', 'fin@arpedia.africa'),
  ('30000000-0000-4000-a000-000000000005', 'reader@test.local'),
  ('30000000-0000-4000-a000-000000000006', 'new@arpedia.africa'),
  ('30000000-0000-4000-a000-000000000007', 'sa3@arpedia.africa');
insert into public.profiles (id, full_name) values
  ('30000000-0000-4000-a000-000000000001', 'Sa One'),
  ('30000000-0000-4000-a000-000000000002', 'Sa Two'),
  ('30000000-0000-4000-a000-000000000003', 'Pub'),
  ('30000000-0000-4000-a000-000000000004', 'Fin'),
  ('30000000-0000-4000-a000-000000000005', 'Reader'),
  ('30000000-0000-4000-a000-000000000006', ''),
  ('30000000-0000-4000-a000-000000000007', 'Sa Three')
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('30000000-0000-4000-a000-000000000001', 'super_admin'),
  ('30000000-0000-4000-a000-000000000002', 'super_admin'),
  ('30000000-0000-4000-a000-000000000003', 'publisher'),
  ('30000000-0000-4000-a000-000000000004', 'finance');
insert into auth.sessions (id, user_id, created_at) values
  ('30000000-0000-4000-e000-000000000003', '30000000-0000-4000-a000-000000000003', now());

-- JWT claims for `uid`: aal2 with a TOTP proof `age` old, or aal1 when age is null.
create function pg_temp.as_user(uid text, age interval default '1 minute', sid text default null) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated',
    'session_id', coalesce(sid, '30000000-0000-4000-f000-' || right(uid, 12)),
    'aal', case when age is null then 'aal1' else 'aal2' end,
    'amr', case when age is null then jsonb_build_array(jsonb_build_object('method', 'password',
                  'timestamp', extract(epoch from now())::bigint))
           else jsonb_build_array(jsonb_build_object('method', 'totp',
                  'timestamp', extract(epoch from now() - age)::bigint)) end)::text, true)
$$;
grant execute on function pg_temp.as_user(text, interval, text) to authenticated;

set local role authenticated;

-- ─── Two-step gates every permission ────────────────────────────────────────
select pg_temp.as_user('30000000-0000-4000-a000-000000000001', null);
select ok(not public.has_permission('manage_team'), 'Super admin without two-step has no permission');
select is(public.get_staff_context() ->> 'mfa_ok', 'false', 'context reports two-step needed');
select throws_ok($$select * from public.list_staff()$$, '42501', null, 'Team list refused before two-step');
select pg_temp.as_user('30000000-0000-4000-a000-000000000001', '13 hours');
select ok(not public.has_permission('manage_team'), 'a two-step proof older than 12 hours is refused');
select pg_temp.as_user('30000000-0000-4000-a000-000000000001');
select ok(public.has_permission('manage_team'), 'Super admin with fresh two-step manages the team');

-- ─── Matrix per role ────────────────────────────────────────────────────────
select pg_temp.as_user('30000000-0000-4000-a000-000000000003');
select ok(public.has_permission('approve_books') and public.has_permission('format_books'), 'Publisher approves and formats books');
select ok(not public.has_permission('view_money') and not public.has_permission('manage_team'), 'Publisher has no money or team');
select is((public.get_staff_context() -> 'permissions') @> '["curate_discover"]', true, 'context lists permissions');
select throws_ok($$select * from public.list_staff()$$, '42501', null, 'Publisher cannot list the team');
select throws_ok($$insert into public.role_permissions (role, permission) values ('publisher', 'view_money')$$,
  '42501', null, 'nobody writes the matrix');
select ok((select count(*) from public.role_permissions) > 0, 'staff read the matrix');
select throws_ok($$select * from public.staff_backup_codes$$, '42501', null, 'backup codes are never readable');
select pg_temp.as_user('30000000-0000-4000-a000-000000000004');
select ok(public.has_permission('view_audit') and public.has_permission('release_payouts'), 'Finance: audit (money only) and payouts (calculate) are limited permissions');
select pg_temp.as_user('30000000-0000-4000-a000-000000000005');
select ok(not public.has_permission('view_readers'), 'a reader has no permissions');
select is(public.get_staff_context(), null, 'a reader has no staff context');

-- ─── Invites ────────────────────────────────────────────────────────────────
select pg_temp.as_user('30000000-0000-4000-a000-000000000001');
select throws_ok($$select public.invite_staff('x@gmail.com', 'X', 'support', 'h0')$$, '23514', null,
  'invites only go to @arpedia.africa');
select throws_ok($$select public.invite_staff('pub@arpedia.africa', 'Pub', 'support', 'h0')$$, '23505', null,
  'cannot invite someone already on the team');
select lives_ok($$select public.invite_staff('new@arpedia.africa', 'Nkem New', 'support', 'h1')$$, 'Super admin invites');
select lives_ok($$select public.invite_staff('NEW@arpedia.africa', 'Nkem New', 'support', 'h2')$$, 'resend replaces the invite');
select is((select count(*)::int from public.staff_invites where email = 'new@arpedia.africa' and revoked_at is null), 1,
  'one open invite per email');
select throws_ok($$select public.accept_staff_invite('h2', '30000000-0000-4000-a000-000000000006')$$, '42501', null,
  'clients cannot accept invites (Worker only)');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.accept_staff_invite('h2', '30000000-0000-4000-a000-000000000006')::text, 'support', 'Worker accepts the invite');
select throws_ok($$select public.accept_staff_invite('h2', '30000000-0000-4000-a000-000000000006')$$, 'P0002', null,
  'an invite works once');
select throws_ok($$select public.accept_staff_invite('h1', '30000000-0000-4000-a000-000000000006')$$, 'P0002', null,
  'a replaced invite no longer works');
reset role;
select is((select full_name from public.profiles where id = '30000000-0000-4000-a000-000000000006'), 'Nkem New',
  'accepted invite fills the name');

-- ─── At least 2 Super admins; disable; roles ────────────────────────────────
set local role authenticated;
select pg_temp.as_user('30000000-0000-4000-a000-000000000001');
select throws_ok($$select public.change_staff_role('30000000-0000-4000-a000-000000000002', 'finance')$$, '23514', null,
  'cannot demote one of the last 2 Super admins');
select throws_ok($$select public.set_staff_status('30000000-0000-4000-a000-000000000001', false)$$, '23514', null,
  'cannot disable yourself');
select lives_ok($$select public.set_staff_status('30000000-0000-4000-a000-000000000003', false)$$, 'Super admin disables a Publisher');
reset role;
select is((select count(*)::int from auth.sessions where user_id = '30000000-0000-4000-a000-000000000003'), 0,
  'disable ends every session');
select is((select action from public.audit_log order by id desc limit 1), 'staff.disable', 'disable is audited');
set local role authenticated;
select pg_temp.as_user('30000000-0000-4000-a000-000000000003');
select ok(not public.has_permission('approve_books'), 'a disabled account loses access on its next request');

-- ─── Backup codes ───────────────────────────────────────────────────────────
select pg_temp.as_user('30000000-0000-4000-a000-000000000004');
select is(array_length(public.create_staff_backup_codes(), 1), 10, '10 backup codes');
reset role;
-- A known code for the next checks.
update public.staff_backup_codes set code_hash = encode(extensions.digest('abcd-1234', 'sha256'), 'hex')
  where ctid = (select ctid from public.staff_backup_codes where user_id = '30000000-0000-4000-a000-000000000004' limit 1);
set local role authenticated;
select pg_temp.as_user('30000000-0000-4000-a000-000000000004', null);
select is(public.use_staff_backup_code('ABCD-1234 '), 9, 'a backup code works once in place of an app code');
select ok(public.has_permission('view_money'), 'the backup code verifies this session');
select is(public.use_staff_backup_code('abcd-1234'), -1, 'a used backup code is refused');

-- ─── Lockout: 5 wrong passwords in 15 minutes ───────────────────────────────
reset role;
set local role anon;
select public.note_staff_signin_failure('Locked@arpedia.africa') from generate_series(1, 4);
select ok(not public.staff_signin_locked('locked@arpedia.africa'), '4 wrong passwords do not lock');
select public.note_staff_signin_failure('locked@arpedia.africa');
select ok(public.staff_signin_locked('LOCKED@arpedia.africa'), '5 wrong passwords lock the email');

select * from finish();
rollback;
