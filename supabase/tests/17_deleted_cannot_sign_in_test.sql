-- Flow 17 · a reader who deletes the account in the app can't sign back in before erasure runs;
-- a staff deletion with a 30-day grace keeps sign-in open so the reader can restore it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('17200000-0000-4000-a000-000000000001', 'gone17@test.local'),
  ('17200000-0000-4000-a000-000000000002', 'grace17@test.local');

set local role authenticated;
set local request.jwt.claims = '{"sub": "17200000-0000-4000-a000-000000000001", "role": "authenticated"}';
select lives_ok($$ select public.request_account_deletion('delete') $$, 'the reader deletes the account');
reset role;

select is((select banned_until = 'infinity' from auth.users where id = '17200000-0000-4000-a000-000000000001'),
  true, 'an app deletion blocks sign-in at once');
select is((select count(*)::int from auth.sessions where user_id = '17200000-0000-4000-a000-000000000001'),
  0, 'and ends every session');

select public._start_deletion('17200000-0000-4000-a000-000000000002', 'staff', null, 'asked by email',
  now() + interval '30 days', now() + interval '30 days');
select is((select banned_until from auth.users where id = '17200000-0000-4000-a000-000000000002'),
  null, 'a deletion with a grace keeps sign-in open so the reader can restore');

select * from finish();
rollback;
