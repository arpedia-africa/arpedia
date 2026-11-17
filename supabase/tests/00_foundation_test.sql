-- Flow 00 · ledger is append-only, RLS keeps ledgers private, credit_balance sums correctly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures: two readers with their own ledgers.
insert into auth.users (id, email) values
  ('10000000-0000-4000-a000-000000000001', 'a@test.local'),
  ('10000000-0000-4000-a000-000000000002', 'b@test.local'),
  ('10000000-0000-4000-a000-000000000003', 'fin@test.local');
insert into public.profiles (id, full_name) values
  ('10000000-0000-4000-a000-000000000001', 'Reader A'),
  ('10000000-0000-4000-a000-000000000002', 'Reader B'),
  ('10000000-0000-4000-a000-000000000003', 'Finance F');
insert into public.staff_roles (user_id, role) values ('10000000-0000-4000-a000-000000000003', 'finance');
insert into public.credit_ledger (user_id, delta, reason, bucket) values
  ('10000000-0000-4000-a000-000000000001', 300, 'plan_grant', 'plan'),
  ('10000000-0000-4000-a000-000000000001', 200, 'top_up', 'topup'),
  ('10000000-0000-4000-a000-000000000001', -125, 'unlock_all', 'plan'),
  ('10000000-0000-4000-a000-000000000001', -9, 'chapter', 'plan'),
  ('10000000-0000-4000-a000-000000000001', 9, 'undo', 'plan'),
  ('10000000-0000-4000-a000-000000000002', 800, 'plan_grant', 'plan');

-- ─── Append-only, even for the table owner ──────────────────────────────────
select throws_ok(
  $$update public.credit_ledger set delta = 1000 where user_id = '10000000-0000-4000-a000-000000000001'$$,
  '42501', null, 'ledger rejects UPDATE (owner)');
select throws_ok(
  $$delete from public.credit_ledger where user_id = '10000000-0000-4000-a000-000000000001'$$,
  '42501', null, 'ledger rejects DELETE (owner)');
select throws_ok($$truncate public.credit_ledger cascade$$, '42501', null, 'ledger rejects TRUNCATE (owner)');
select throws_ok(
  $$insert into public.credit_ledger (user_id, delta, reason, bucket)
    values ('10000000-0000-4000-a000-000000000001', 0, 'promo', 'promo')$$,
  '23514', null, 'ledger rejects a zero delta');

select ok(not has_table_privilege('authenticated', 'public.credit_ledger', 'INSERT'), 'authenticated cannot INSERT ledger');
select ok(not has_table_privilege('authenticated', 'public.credit_ledger', 'UPDATE'), 'authenticated cannot UPDATE ledger');
select ok(not has_table_privilege('service_role', 'public.credit_ledger', 'UPDATE'), 'service_role cannot UPDATE ledger');
select ok(not has_table_privilege('service_role', 'public.credit_ledger', 'DELETE'), 'service_role cannot DELETE ledger');

-- ─── credit_balance ─────────────────────────────────────────────────────────
select is(public.credit_balance('10000000-0000-4000-a000-000000000001'), 375, 'balance sums the ledger');
select is(public.credit_balance('10000000-0000-4000-a000-000000000099'), 0, 'balance is 0 with no rows');

-- ─── RLS as reader A ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.credit_ledger), 5, 'reader sees only own ledger rows');
select is((select count(*)::int from public.credit_ledger where user_id = '10000000-0000-4000-a000-000000000002'),
  0, 'reader cannot read another user''s ledger');
select is(public.credit_balance('10000000-0000-4000-a000-000000000001'), 375, 'reader reads own balance');
select throws_ok($$select public.credit_balance('10000000-0000-4000-a000-000000000002')$$,
  '42501', null, 'reader cannot read another user''s balance');
select throws_ok(
  $$insert into public.credit_ledger (user_id, delta, reason, bucket)
    values ('10000000-0000-4000-a000-000000000001', 1000, 'promo', 'promo')$$,
  '42501', null, 'reader cannot insert ledger rows');

-- ─── Finance reads any balance ──────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select is(public.credit_balance('10000000-0000-4000-a000-000000000002'), 800, 'finance reads any balance');

select * from finish();
rollback;
