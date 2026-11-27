-- Flow 17 · a reader who deletes the account in the app can't sign back in before erasure runs;
-- a staff deletion with a 30-day grace keeps sign-in open so the reader can restore it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, encrypted_password) values
  ('17200000-0000-4000-a000-000000000001', 'gone17@test.local', extensions.crypt('pw-17', extensions.gen_salt('bf'))),
  ('17200000-0000-4000-a000-000000000002', 'grace17@test.local', null);

set local role authenticated;
set local request.jwt.claims = '{"sub": "17200000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.request_account_deletion('delete') $$, 'the reader deletes the account');
reset role;

select is((select banned_until > now() + interval '1000 years' from auth.users where id = '17200000-0000-4000-a000-000000000001'),
  true, 'an app deletion blocks sign-in at once');
-- GoTrue can't read 'infinity' into a Go time: every sign-in for the user would fail with a 500.
select is((select isfinite(banned_until) from auth.users where id = '17200000-0000-4000-a000-000000000001'),
  true, 'and the ban is a finite time GoTrue can read');
select is((select count(*)::int from auth.sessions where user_id = '17200000-0000-4000-a000-000000000001'),
  0, 'and ends every session');

-- The sign-in Worker says "deleted" only to someone who knows the password (#72 row 13).
select is(public.banned_sign_in_reason('Gone17@test.local', 'pw-17'), 'deleted',
  'the right password on a deleted account hears it was deleted');
select is(public.banned_sign_in_reason('gone17@test.local', 'guess'), null,
  'a wrong password hears nothing');
select ok(not has_function_privilege('authenticated', 'public.banned_sign_in_reason(text, text)', 'execute'),
  'readers can''t call it');

select public._start_deletion('17200000-0000-4000-a000-000000000002', 'staff', null, 'asked by email',
  now() + interval '30 days', now() + interval '30 days');
select is((select banned_until from auth.users where id = '17200000-0000-4000-a000-000000000002'),
  null, 'a deletion with a grace keeps sign-in open so the reader can restore');

select * from finish();
rollback;
