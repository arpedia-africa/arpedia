-- Flow 14 · 14-11 (rule 38): staff credit grants by tier. Support up to 200 at once, Operations up
-- to 500, more waits for a second person; removing credits needs Finance; the reader is told only
-- once a grant is in the balance.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- 1 support, 2 operations admin, 3 finance, 4 and 5 super admins, 6 and 7 readers, 8 moderator.
insert into auth.users (id, email)
select ('14110000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow1411.test'
from generate_series(1, 8) n;
insert into public.profiles (id, full_name)
select ('14110000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n
from generate_series(1, 8) n
on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('14110000-0000-4000-a000-000000000001', 'support'),
  ('14110000-0000-4000-a000-000000000002', 'operations_admin'),
  ('14110000-0000-4000-a000-000000000003', 'finance'),
  ('14110000-0000-4000-a000-000000000004', 'super_admin'),
  ('14110000-0000-4000-a000-000000000005', 'super_admin'),
  ('14110000-0000-4000-a000-000000000008', 'moderator');
-- Reader 7 holds 100 top-up and 100 promo credits.
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('14110000-0000-4000-a000-000000000007', 100, 'top_up', 'topup', 'g1411:t'),
  ('14110000-0000-4000-a000-000000000007', 100, 'promo', 'promo', 'g1411:p');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
create function pg_temp.notices(uid text) returns int
language sql security definer as $$
  select count(*)::int from pgmq.q_user_notify
  where message ->> 'kind' = 'credits_granted' and message ->> 'user_id' = uid
$$;
grant execute on function pg_temp.notices(text) to authenticated;
create function pg_temp.req(uid text, n int) returns uuid
language sql security definer as $$
  select id from public.credit_grant_requests where user_id = uid::uuid and credits = n and status = 'pending'
$$;
grant execute on function pg_temp.req(text, int) to authenticated;

select is((select limit_note from public.role_permissions where role = 'support' and permission = 'grant_credits'),
  'Up to 200', 'the roles matrix says Support grants up to 200');

set local role authenticated;

-- ─── Support: 200 at once, more waits for Operations ───
select pg_temp.as_user('14110000-0000-4000-a000-000000000001');
select is(public.staff_grant_credits('14110000-0000-4000-a000-000000000006', 200, 'Failed unlock', true,
  'Hi, we added 200 credits.') ->> 'status', 'applied', 'Support grants 200 at once');
select is(pg_temp.notices('14110000-0000-4000-a000-000000000006'), 1, 'the reader is told about an applied grant');
select is((select message ->> 'message' from pgmq.q_user_notify where message ->> 'kind' = 'credits_granted'
           and message ->> 'user_id' = '14110000-0000-4000-a000-000000000006'),
  'Hi, we added 200 credits.', 'the notice carries the staff message');
select is((select message ->> 'credits' from pgmq.q_user_notify where message ->> 'kind' = 'credits_granted'
           and message ->> 'user_id' = '14110000-0000-4000-a000-000000000006'), '200', 'and the credits');
select is(public.staff_grant_credits('14110000-0000-4000-a000-000000000006', 201, 'Goodwill', true) ->> 'status',
  'pending', 'Support over 200 waits');
select is(public.staff_grant_credits('14110000-0000-4000-a000-000000000006', 300, 'Goodwill', false) ->> 'approver',
  'operations_admin', 'up to 500 waits for an Operations admin');
select is(public.credit_balance('14110000-0000-4000-a000-000000000006'), 200, 'waiting grants add nothing');
select is(pg_temp.notices('14110000-0000-4000-a000-000000000006'), 1, 'and the reader is not told yet');
select throws_ok($$select public.staff_grant_credits('14110000-0000-4000-a000-000000000006', 10, 'Goodwill', true,
  repeat('x', 301))$$, 'P0001', 'message_too_long', 'the reader message is at most 300 characters');
select throws_ok($$select public.staff_remove_credits('14110000-0000-4000-a000-000000000007', 10, 'Refunded top-up')$$,
  '42501', null, 'Support cannot remove credits');
select throws_ok($$select public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000006', 201), true)$$,
  '42501', null, 'Support cannot approve');

-- ─── Operations admin: 500 at once, approves Support's 201 to 500 ───
select pg_temp.as_user('14110000-0000-4000-a000-000000000002');
select is(public.staff_grant_credits('14110000-0000-4000-a000-000000000006', 500, 'Contest prize') ->> 'status',
  'applied', 'Operations grants 500 at once');
select is(pg_temp.notices('14110000-0000-4000-a000-000000000006'), 1, 'not told when the switch is off');
select is(public.staff_grant_credits('14110000-0000-4000-a000-000000000006', 501, 'Contest prize') ->> 'approver',
  'finance', 'over 500 waits for Finance or a Super admin');
select is(public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000006', 201), true) ->> 'status',
  'applied', 'Operations approves a Support grant of 201');
select is(pg_temp.notices('14110000-0000-4000-a000-000000000006'), 2, 'the reader is told once it is approved');
select is(public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000006', 300), false) ->> 'status',
  'rejected', 'Operations turns down a Support grant of 300');
select is(pg_temp.notices('14110000-0000-4000-a000-000000000006'), 2, 'a turned-down grant tells no one');
select throws_ok($$select public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000006', 501), true)$$,
  '42501', null, 'Operations cannot approve a grant over 500');
select throws_ok($$select public.staff_remove_credits('14110000-0000-4000-a000-000000000007', 10, 'Refunded top-up')$$,
  '42501', null, 'Operations cannot remove credits');

-- ─── Moderator: no grant permission ───
select pg_temp.as_user('14110000-0000-4000-a000-000000000008');
select throws_ok($$select public.staff_grant_credits('14110000-0000-4000-a000-000000000006', 10, 'Goodwill')$$,
  '42501', null, 'a role without grant_credits cannot grant');

-- ─── Finance: removes, approves big grants, never below zero ───
select pg_temp.as_user('14110000-0000-4000-a000-000000000003');
select is(public.staff_remove_credits('14110000-0000-4000-a000-000000000007', 150, 'Refunded top-up') ->> 'status',
  'applied', 'Finance removes 150 at once');
select results_eq($$select bucket::text, delta from public.credit_ledger
  where user_id = '14110000-0000-4000-a000-000000000007' and reason = 'staff_adjust' order by id$$,
  $$values ('topup', -100), ('promo', -50)$$, 'top-up credits go first, then promo');
select is(public.credit_balance('14110000-0000-4000-a000-000000000007'), 50, 'the balance follows');
select throws_ok($$select public.staff_remove_credits('14110000-0000-4000-a000-000000000007', 51, 'Correction')$$,
  'P0001', 'not_enough_credits', 'a removal never takes the balance below zero');
select is(public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000006', 501), true) ->> 'status',
  'applied', 'Finance approves a grant over 500');
select is((select count(*)::int from public.audit_log where action = 'remove_credits'
           and object_id = '14110000-0000-4000-a000-000000000007'), 1, 'the removal is in the audit log');

-- Over 500 removal waits for a second Finance or Super admin.
reset role;
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key)
values ('14110000-0000-4000-a000-000000000007', 950, 'top_up', 'topup', 'g1411:t2');
set local role authenticated;
select pg_temp.as_user('14110000-0000-4000-a000-000000000004');
select is(public.staff_remove_credits('14110000-0000-4000-a000-000000000007', 900, 'Refunded top-up') ->> 'status',
  'pending', 'a removal over 500 waits');
select is(public.credit_balance('14110000-0000-4000-a000-000000000007'), 1000, 'nothing is removed yet');
select throws_ok($$select public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000007', 900), true)$$,
  'P0001', 'same_person', 'the person who asked cannot approve it');
select pg_temp.as_user('14110000-0000-4000-a000-000000000002');
select throws_ok($$select public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000007', 900), true)$$,
  '42501', null, 'Operations cannot approve a removal');
select pg_temp.as_user('14110000-0000-4000-a000-000000000005');
select is(public.decide_credit_grant(pg_temp.req('14110000-0000-4000-a000-000000000007', 900), true) ->> 'status',
  'applied', 'a second Super admin approves the removal');
select is(public.credit_balance('14110000-0000-4000-a000-000000000007'), 100, 'and the credits come off');

select * from finish();
rollback;
