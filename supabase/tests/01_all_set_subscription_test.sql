-- Flow 01 · spec check 01-6: get_all_set reads the plan and renewal date from the reader's live
-- subscription row; without one it keeps the ledger plan and no renewal date; a plan cancelled
-- inside its period does not renew.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email)
select ('01600000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t16.local' from generate_series(1, 2) n;
insert into public.profiles (id, full_name)
select ('01600000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n from generate_series(1, 2) n
on conflict (id) do update set full_name = excluded.full_name;

-- Reader 1 started monthly; Play moved them to quarterly with a later renewal. An old expired row stays.
insert into public.credit_ledger (user_id, delta, reason, bucket, ref_type, ref_id, idempotency_key) values
  ('01600000-0000-4000-a000-000000000001', 300, 'plan_grant', 'plan', 'plan', 'monthly', 't16:g1'),
  ('01600000-0000-4000-a000-000000000002', 300, 'plan_grant', 'plan', 'plan', 'monthly', 't16:g2');
insert into public.subscriptions (user_id, plan_code, status, period_end) values
  ('01600000-0000-4000-a000-000000000001', 'monthly', 'expired', '2026-01-10T09:00:00Z'),
  ('01600000-0000-4000-a000-000000000001', 'quarterly', 'active', '2027-03-02T09:00:00Z');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"01600000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(public.get_all_set() ->> 'plan', 'quarterly', 'the plan comes from the live subscription');
select is((public.get_all_set() ->> 'renews_at')::timestamptz, '2027-03-02T09:00:00Z'::timestamptz,
  'the renewal date is its period end, not grant date plus months');
select is((public.get_all_set() ->> 'credits')::int, 300, 'credits still come from the ledger');

select set_config('request.jwt.claims', '{"sub":"01600000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is(public.get_all_set() ->> 'plan', 'monthly', 'no subscription yet: the ledger plan');
select is(public.get_all_set() -> 'renews_at', 'null'::jsonb, 'and no renewal date');

-- Reader 2 cancels on Play inside the paid period: still quarterly, but no renewal date.
reset role;
insert into public.subscriptions (user_id, plan_code, status, period_end) values
  ('01600000-0000-4000-a000-000000000002', 'quarterly', 'cancelled', now() + interval '20 days');
set local role authenticated;
select is(public.get_all_set() ->> 'plan', 'quarterly', 'a cancelled plan inside its period is still the plan');
select is(public.get_all_set() -> 'renews_at', 'null'::jsonb, 'but it does not renew');
select is((public.get_all_set() ->> 'renewing')::boolean, false, 'and says so');

select * from finish();
rollback;
