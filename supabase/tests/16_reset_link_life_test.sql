-- Spec check 16-15: a staff reset link is good for 30 minutes after it was sent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, recovery_sent_at) values
  ('91600000-0000-4000-a000-000000000051', 'fresh@flow16.test', now() - interval '29 minutes'),
  ('91600000-0000-4000-a000-000000000052', 'stale@flow16.test', now() - interval '31 minutes'),
  ('91600000-0000-4000-a000-000000000053', 'never@flow16.test', null);

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;

set local role authenticated;
select pg_temp.as_user('91600000-0000-4000-a000-000000000051');
select ok(public.staff_reset_link_fresh(), 'a link sent 29 minutes ago still works');
select pg_temp.as_user('91600000-0000-4000-a000-000000000052');
select ok(not public.staff_reset_link_fresh(), 'a link sent 31 minutes ago has expired');
select pg_temp.as_user('91600000-0000-4000-a000-000000000053');
select ok(not public.staff_reset_link_fresh(), 'no reset sent: not fresh');
reset role;

select ok(not has_function_privilege('anon', 'public.staff_reset_link_fresh()', 'execute'),
  'anon cannot call it');

select * from finish();
rollback;
