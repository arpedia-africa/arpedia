-- Spec check 09-7, 09-9, 09-14: linked-elsewhere Play purchases, duplicate web charges, pending and
-- failed Flutterwave charges, all through ingest_payment_event (the Workers' contract).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'pe' || n || '@flow09.test'
from generate_series(41, 45) n;
insert into public.profiles (id, full_name)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'Payments ' || n
from generate_series(41, 45) n
on conflict (id) do nothing;

create function pg_temp.ev(p_provider text, p_event text, p_ago interval, p_norm jsonb) returns jsonb
language sql as $$
  select public.ingest_payment_event(p_provider, p_event, p_norm ->> 'type', now() - p_ago, '{}', p_norm)
$$;
create function pg_temp.plan_ev(p_user text, p_store text, p_orig text, p_txn text) returns jsonb
language sql as $$
  select jsonb_build_object('type', 'initial_purchase', 'user_id', p_user, 'store', p_store, 'plan_code', 'monthly',
    'txn_id', p_txn, 'original_txn_id', p_orig, 'period_start', now() - interval '1 hour',
    'period_end', now() + interval '30 days', 'gross_kobo', 90000, 'fee_kobo', 1300)
$$;
create function pg_temp.topup_ev(p_user text, p_txn text) returns jsonb
language sql as $$
  select jsonb_build_object('type', 'topup', 'user_id', p_user, 'store', 'web', 'topup_code', 'topup_200',
    'txn_id', p_txn, 'gross_kobo', 60000, 'fee_kobo', 800)
$$;
create function pg_temp.granted(p_user text) returns int language sql as $$
  select coalesce(sum(delta), 0)::int from public.credit_ledger
  where user_id = p_user::uuid and reason in ('plan_grant', 'top_up')
$$;

-- ─── 09-9: a Play subscription already linked to another account (readers 41, 42) ──
select is(pg_temp.ev('revenuecat', 'pe41-1', interval '2 hours',
  pg_temp.plan_ev('90900000-0000-4000-a000-000000000041', 'play', 'GPA.41', 'GPA.41-0')) ->> 'outcome',
  'initial_purchase +300', 'the first account buys the plan');
select is(pg_temp.ev('revenuecat', 'pe42-1', interval '1 hour',
  pg_temp.plan_ev('90900000-0000-4000-a000-000000000042', 'play', 'GPA.41', 'GPA.41-1')),
  jsonb_build_object('id', (select id from public.payment_events where event_id = 'pe42-1'),
                     'duplicate', false, 'outcome', 'linked_elsewhere: recorded, not applied'),
  'a purchase for the same store subscription from another account is recorded, not an error');
select is(pg_temp.granted('90900000-0000-4000-a000-000000000042'), 0, 'the second account gets no credits');
select ok(not exists (select 1 from public.transactions where store_txn_id = 'GPA.41-1'),
  'and no transaction');
select is((select user_id from public.subscriptions where store_original_txn_id = 'GPA.41'),
  '90900000-0000-4000-a000-000000000041'::uuid, 'the subscription stays with its first account');
select is(pg_temp.granted('90900000-0000-4000-a000-000000000041'), 300, 'the first account keeps its credits');

-- ─── 09-7: two web plan charges within a minute (reader 43) ─────────────────
select is(pg_temp.ev('flutterwave', 'charge:7001', interval '10 minutes',
  pg_temp.plan_ev('90900000-0000-4000-a000-000000000043', 'web', 'fwplan:5:90900000-0000-4000-a000-000000000043', '7001'))
  ->> 'outcome', 'initial_purchase +300', 'the first charge grants the plan');
select is(pg_temp.ev('flutterwave', 'charge:7002', interval '9 minutes 40 seconds',
  pg_temp.plan_ev('90900000-0000-4000-a000-000000000043', 'web', 'fwplan:5:90900000-0000-4000-a000-000000000043', '7002'))
  ->> 'outcome', 'initial_purchase +0 (duplicate)', 'a second charge 20 seconds later grants nothing');
select is(pg_temp.granted('90900000-0000-4000-a000-000000000043'), 300, 'credits once for the period');
select results_eq($$select store_txn_id, flag from public.transactions
                    where user_id = '90900000-0000-4000-a000-000000000043' order by store_txn_id$$,
  $$values ('7001'::text, null::text), ('7002', 'duplicate_charge')$$, 'only the second charge is flagged');
select results_eq($$select r.recommendation, r.status, r.amount_kobo from public.refund_requests r
                    join public.transactions t on t.id = r.transaction_id where t.store_txn_id = '7002'$$,
  $$values ('duplicate'::text, 'waiting'::text, 90000::bigint)$$, 'it waits in Refunds as Refund the duplicate');
select ok(exists (select 1 from public.credit_alerts where user_id = '90900000-0000-4000-a000-000000000043'
                  and kind = 'duplicate_charge'), 'and shows in Credits anomalies');
select ok(exists (select 1 from pgmq.q_payments_out where message ->> 'kind' = 'finance_alert'
                  and message ->> 'alert' = 'duplicate_charge'), 'Finance is alerted');

-- ─── 09-7: top-ups (reader 44) ──────────────────────────────────────────────
select is(pg_temp.ev('flutterwave', 'charge:7011', interval '30 minutes',
  pg_temp.topup_ev('90900000-0000-4000-a000-000000000044', '7011')) ->> 'outcome', 'topup +200', 'a top-up');
select is(pg_temp.ev('flutterwave', 'charge:7012', interval '29 minutes 30 seconds',
  pg_temp.topup_ev('90900000-0000-4000-a000-000000000044', '7012')) ->> 'outcome', 'topup +200 (duplicate)',
  'the same top-up 30 seconds later still grants (a refund takes it back) and is marked a duplicate');
select is((select flag from public.transactions where store_txn_id = '7012'), 'duplicate_charge',
  'the duplicate top-up is flagged');
select is(pg_temp.ev('flutterwave', 'charge:7013', interval '20 minutes',
  pg_temp.topup_ev('90900000-0000-4000-a000-000000000044', '7013')) ->> 'outcome', 'topup +200',
  'a top-up minutes later is a new purchase');

-- ─── 09-14: pending and failed charges (reader 45) ──────────────────────────
select is(pg_temp.ev('flutterwave', 'charge:7101:pending', interval '5 minutes',
  jsonb_build_object('type', 'unpaid', 'user_id', '90900000-0000-4000-a000-000000000045', 'store', 'web',
    'txn_id', '7101', 'status', 'pending', 'kind', 'topup', 'topup_code', 'topup_200', 'gross_kobo', 60000))
  ->> 'outcome', 'charge pending', 'a pending charge is recorded');
select results_eq($$select status, credits_granted from public.transactions where store_txn_id = '7101'$$,
  $$values ('pending'::text, 0)$$, 'as a pending transaction with no credits');
select is(pg_temp.ev('flutterwave', 'charge:7101', interval '4 minutes',
  pg_temp.topup_ev('90900000-0000-4000-a000-000000000045', '7101')) ->> 'outcome', 'topup +200',
  'when it succeeds the credits are granted');
select results_eq($$select status, credits_granted from public.transactions where store_txn_id = '7101'$$,
  $$values ('succeeded'::text, 200)$$, 'and the same transaction is now succeeded');
select is(pg_temp.ev('flutterwave', 'charge:7102:failed', interval '3 minutes',
  jsonb_build_object('type', 'unpaid', 'user_id', '90900000-0000-4000-a000-000000000045', 'store', 'web',
    'txn_id', '7102', 'status', 'failed', 'kind', 'plan', 'plan_code', 'monthly', 'gross_kobo', 90000))
  ->> 'outcome', 'charge failed', 'a failed plan charge is recorded as failed');

select * from finish();
rollback;
