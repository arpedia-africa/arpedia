-- Flow 09 · webhook replays through ingest_payment_event (the Workers' contract): refund after spend,
-- Flutterwave duplicate and chargeback, grace then recovery, grace then expiry with top-ups kept.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'w' || n || '@flow09.test'
from generate_series(21, 24) n;
insert into public.profiles (id, full_name)
select ('90900000-0000-4000-a000-0000000000' || n)::uuid, 'Webhook ' || n
from generate_series(21, 24) n
on conflict (id) do nothing;

create function pg_temp.ev(p_provider text, p_event text, p_ago interval, p_norm jsonb) returns jsonb
language sql as $$
  select public.ingest_payment_event(p_provider, p_event, p_norm ->> 'type', now() - p_ago, '{}', p_norm)
$$;
create function pg_temp.sub_ev(p_type text, p_user text, p_store text, p_orig text, p_txn text,
                               p_end interval default interval '30 days') returns jsonb
language sql as $$
  select jsonb_build_object('type', p_type, 'user_id', p_user, 'store', p_store, 'plan_code', 'monthly',
    'txn_id', p_txn, 'original_txn_id', p_orig, 'period_start', now() - interval '1 day',
    'period_end', now() + p_end, 'gross_kobo', 90000, 'fee_kobo', 13500)
$$;
create function pg_temp.bal(p_user text) returns int[] language sql as $$
  select array[plan, rollover, topup, promo] from public.credit_balances where user_id = p_user::uuid
$$;

-- ─── Store refund after spend (RevenueCat, reader 21) ───────────────────────
select is(pg_temp.ev('revenuecat', 'w21-1', interval '3 hours',
  pg_temp.sub_ev('initial_purchase', '90900000-0000-4000-a000-000000000021', 'play', 'GPA.21', 'GPA.21-0')) ->> 'outcome',
  'initial_purchase +300', 'initial purchase grants the plan');
select public.spend_credits('90900000-0000-4000-a000-000000000021', 250, 'tip', null, null, null, 'w21-spend');
select is(pg_temp.ev('revenuecat', 'w21-2', interval '1 hour',
  jsonb_build_object('type', 'refund', 'user_id', '90900000-0000-4000-a000-000000000021', 'store', 'play',
                     'txn_id', 'GPA.21-0', 'refund_kobo', 90000)) ->> 'duplicate',
  'false', 'store refund is applied');
select is(pg_temp.bal('90900000-0000-4000-a000-000000000021'), array[0, 0, 0, 0],
  'only the 50 unspent credits are clawed back; balance is zero, never negative');
select is((select -sum(delta)::int from public.credit_ledger
           where user_id = '90900000-0000-4000-a000-000000000021' and reason = 'refund'), 50,
  'refund rows remove exactly the unspent 50');
select ok(exists (select 1 from public.credit_alerts where user_id = '90900000-0000-4000-a000-000000000021'
                  and kind = 'clawback_short' and (detail ->> 'not_recoverable')::int = 250),
  'the 250 already spent are reported as not recoverable');
select results_eq($$select t.status, s.status from public.transactions t join public.subscriptions s
                    on s.id = t.subscription_id where t.store_txn_id = 'GPA.21-0'$$,
  $$values ('refunded'::text, 'refunded'::text)$$, 'transaction and subscription are refunded');
select is(pg_temp.ev('revenuecat', 'w21-2', interval '1 hour',
  jsonb_build_object('type', 'refund', 'user_id', '90900000-0000-4000-a000-000000000021', 'store', 'play',
                     'txn_id', 'GPA.21-0', 'refund_kobo', 90000)) ->> 'duplicate',
  'true', 'a replayed refund is a duplicate');
select is((select count(*)::int from public.credit_ledger
           where user_id = '90900000-0000-4000-a000-000000000021' and reason = 'refund' and delta <> 0),
  (select count(*)::int from public.credit_ledger
   where user_id = '90900000-0000-4000-a000-000000000021' and reason = 'refund'),
  'no zero-delta ledger rows were written');

-- ─── Flutterwave duplicate and chargeback (reader 22) ───────────────────────
select is(pg_temp.ev('flutterwave', 'charge:5022', interval '2 days',
  pg_temp.sub_ev('initial_purchase', '90900000-0000-4000-a000-000000000022', 'web',
                 'fwplan:9:90900000-0000-4000-a000-000000000022', '5022')) ->> 'outcome',
  'initial_purchase +300', 'web checkout grants the plan');
select is(pg_temp.ev('flutterwave', 'charge:5022', interval '2 days',
  pg_temp.sub_ev('initial_purchase', '90900000-0000-4000-a000-000000000022', 'web',
                 'fwplan:9:90900000-0000-4000-a000-000000000022', '5022')) ->> 'duplicate',
  'true', 'a replayed Flutterwave webhook is acknowledged as a duplicate');
select is((select count(*)::int from public.credit_ledger
           where user_id = '90900000-0000-4000-a000-000000000022' and reason = 'plan_grant'), 1,
  'the replay granted nothing');
select is((select count(*)::int from public.payment_events where provider = 'flutterwave' and event_id = 'charge:5022'),
  1, 'one stored event');
select public.spend_credits('90900000-0000-4000-a000-000000000022', 100, 'tip', null, null, null, 'w22-spend');
select is(pg_temp.ev('flutterwave', 'chargeback:5022', interval '1 hour',
  jsonb_build_object('type', 'chargeback', 'user_id', '90900000-0000-4000-a000-000000000022', 'store', 'web',
                     'txn_id', '5022')) ->> 'duplicate',
  'false', 'chargeback is applied');
select is(pg_temp.bal('90900000-0000-4000-a000-000000000022'), array[0, 0, 0, 0],
  'chargeback claws back the unspent 200');
select results_eq($$select t.status, s.status from public.transactions t join public.subscriptions s
                    on s.id = t.subscription_id where t.store = 'web' and t.store_txn_id = '5022'$$,
  $$values ('disputed'::text, 'refunded'::text)$$, 'transaction disputed, subscription ended');
select ok(exists (select 1 from public.credit_alerts where user_id = '90900000-0000-4000-a000-000000000022'
                  and kind = 'chargeback'), 'reader flagged in Credits anomalies');
select ok(exists (select 1 from pgmq.q_payments_out where message ->> 'kind' = 'finance_alert'
                  and message ->> 'alert' = 'chargeback'), 'Finance is alerted');

-- ─── Grace then recovery (reader 23) ────────────────────────────────────────
select pg_temp.ev('revenuecat', 'w23-1', interval '5 days',
  pg_temp.sub_ev('initial_purchase', '90900000-0000-4000-a000-000000000023', 'play', 'GPA.23', 'GPA.23-0'));
select pg_temp.ev('revenuecat', 'w23-2', interval '2 days',
  jsonb_build_object('type', 'billing_issue', 'user_id', '90900000-0000-4000-a000-000000000023', 'store', 'play',
                     'original_txn_id', 'GPA.23', 'txn_id', 'GPA.23-0'));
select is((select status from public.subscriptions where store_original_txn_id = 'GPA.23'), 'grace',
  'billing issue puts the subscription in grace');
select is((select count(*)::int from public.credit_ledger
           where user_id = '90900000-0000-4000-a000-000000000023' and reason = 'plan_grant'), 1,
  'no grant during grace');
select is(pg_temp.ev('revenuecat', 'w23-3', interval '1 day',
  pg_temp.sub_ev('renewal', '90900000-0000-4000-a000-000000000023', 'play', 'GPA.23', 'GPA.23-1')) ->> 'outcome',
  'renewal +300', 'the recovered renewal grants once');
select is((select status from public.subscriptions where store_original_txn_id = 'GPA.23'), 'active',
  'the subscription is active again');

-- ─── Grace then expiry; top-ups stay (reader 24) ────────────────────────────
select pg_temp.ev('revenuecat', 'w24-1', interval '40 days',
  pg_temp.sub_ev('initial_purchase', '90900000-0000-4000-a000-000000000024', 'play', 'GPA.24', 'GPA.24-0',
                 interval '-1 hour'));
select pg_temp.ev('revenuecat', 'w24-2', interval '30 days',
  jsonb_build_object('type', 'topup', 'user_id', '90900000-0000-4000-a000-000000000024', 'store', 'play',
                     'topup_code', 'topup_200', 'txn_id', 'GPA.24-T', 'gross_kobo', 60000));
select pg_temp.ev('revenuecat', 'w24-3', interval '2 hours',
  jsonb_build_object('type', 'billing_issue', 'user_id', '90900000-0000-4000-a000-000000000024', 'store', 'play',
                     'original_txn_id', 'GPA.24', 'txn_id', 'GPA.24-0'));
select is(pg_temp.bal('90900000-0000-4000-a000-000000000024'), array[300, 0, 200, 0],
  'plan and top-up credits before expiry');
select ok(public.job_expire_ended_subscriptions() >= 1, 'the expiry job ends the unpaid grace period');
select is((select status from public.subscriptions where store_original_txn_id = 'GPA.24'), 'expired',
  'status is expired after grace');
select is(pg_temp.bal('90900000-0000-4000-a000-000000000024'), array[0, 0, 200, 0],
  'plan credits expire, top-up credits stay');

select * from finish();
rollback;
