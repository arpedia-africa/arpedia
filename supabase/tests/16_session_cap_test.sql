-- Spec check 16-21 (flow 16 rule 4): no staff session lasts longer than 12 hours on the server.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('16210000-0000-4000-a000-000000000001', 'cap-admin@arpedia.africa'),
  ('16210000-0000-4000-a000-000000000002', 'cap-reader@test.local');
insert into public.profiles (id, full_name) values
  ('16210000-0000-4000-a000-000000000001', 'Cap Admin'),
  ('16210000-0000-4000-a000-000000000002', 'Cap Reader')
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values ('16210000-0000-4000-a000-000000000001', 'super_admin');
insert into auth.sessions (id, user_id, created_at) values
  ('16210000-0000-4000-b000-000000000001', '16210000-0000-4000-a000-000000000001', now() - interval '11 hours'),
  ('16210000-0000-4000-b000-000000000002', '16210000-0000-4000-a000-000000000001', now() - interval '13 hours'),
  ('16210000-0000-4000-b000-000000000003', '16210000-0000-4000-a000-000000000002', now() - interval '3 days');

-- JWT claims for `uid` in session `sid`, with a TOTP proof one minute old.
create function pg_temp.as_user(uid text, sid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', sid, 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
             'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text, text) to authenticated;

set local role authenticated;

-- A session 11 hours old works as before.
select pg_temp.as_user('16210000-0000-4000-a000-000000000001', '16210000-0000-4000-b000-000000000001');
select ok(public.staff_session_fresh(), 'an 11-hour-old session is fresh');
select ok(public.has_permission('manage_team'), 'and keeps its permissions');
select is(public.get_staff_context() ->> 'mfa_ok', 'true', 'and the console sees two-step done');

-- A session 13 hours old has no permission even with a fresh two-step code, and is ended.
select pg_temp.as_user('16210000-0000-4000-a000-000000000001', '16210000-0000-4000-b000-000000000002');
select ok(not public.staff_session_fresh(), 'a 13-hour-old session is not fresh');
select ok(not public.staff_mfa_ok(), 'a fresh two-step code does not extend it');
select ok(not public.has_permission('manage_team'), 'it holds no permission');
select throws_ok($$select * from public.list_staff()$$, '42501', null, 'staff RPCs refuse it');
select ok(public.get_staff_context() is null, 'the console gets no staff context, so it asks to sign in');
select ok(public.get_staff_context() is null, 'still none on the next request (the session row stays, refused)');
reset role;
select is((select count(*)::int from auth.sessions where user_id = '16210000-0000-4000-a000-000000000001'), 2,
  'no session row is deleted, so the old one can never look unknown and fresh');

-- Readers are never capped: the check only runs for active staff.
set local role authenticated;
select pg_temp.as_user('16210000-0000-4000-a000-000000000002', '16210000-0000-4000-b000-000000000003');
select ok(public.get_staff_context() is null, 'a reader gets no staff context');
reset role;
select is((select count(*)::int from auth.sessions where id = '16210000-0000-4000-b000-000000000003'), 1,
  'and a reader''s 3-day-old session is never ended');

select * from finish();
rollback;
