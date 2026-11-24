-- Flow 09 · Credits and plans: plan grants and rollover, bucket order, clawback, payment events
-- (duplicates, out of order), staff grants (500 limit, second approver), chapter returns, ledger
-- immutability and RLS on money rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(91);

-- ─── Fixtures ───────────────────────────────────────────────────────────────
-- 1 renewals, 2 rollover cap, 3 spend order, 4 top-up and clawback, 5 chapter return, 6 staff grants,
-- 7 and 10 payment events, 8 support, 9 author, 11 and 12 super admins.
insert into auth.users (id, email)
select ('90900000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@flow09.test'
from generate_series(1, 12) n;
insert into public.profiles (id, full_name, is_author)
select ('90900000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'User ' || n, n = 9
from generate_series(1, 12) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('90900000-0000-4000-a000-000000000008', 'support'),
  ('90900000-0000-4000-a000-000000000011', 'super_admin'),
  ('90900000-0000-4000-a000-000000000012', 'super_admin');

insert into public.subscriptions (id, user_id, plan_code, status, period_end) values
  ('90900000-0000-4000-b000-000000000001', '90900000-0000-4000-a000-000000000001', 'monthly', 'active',
   now() + interval '30 days'),
  ('90900000-0000-4000-b000-000000000004', '90900000-0000-4000-a000-000000000004', 'monthly', 'active',
   now() + interval '30 days');
insert into public.transactions (user_id, kind, plan_code, subscription_id, store, store_txn_id, gross_kobo,
                                 credits_granted)
values ('90900000-0000-4000-a000-000000000001', 'plan', 'monthly', '90900000-0000-4000-b000-000000000001',
        'play', 'rls-u1', 90000, 300);

create function pg_temp.as_user(uid text, age interval default '1 minute') returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - age)::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text, interval) to authenticated;

-- A normalized RevenueCat plan event for the Worker contract, and a helper that ingests it.
create function pg_temp.nrm(p_type text, p_user text, p_orig text, p_txn text, p_gross bigint default 90000)
returns jsonb language sql as $$
  select jsonb_build_object('type', p_type, 'user_id', p_user, 'store', 'play', 'plan_code', 'monthly',
    'txn_id', p_txn, 'original_txn_id', p_orig, 'period_start', now(), 'period_end', now() + interval '30 days',
    'gross_kobo', p_gross, 'fee_kobo', 0)
$$;
create function pg_temp.ingest(p_event text, p_ago interval, p_norm jsonb) returns jsonb
language sql as $$
  select public.ingest_payment_event('revenuecat', p_event, p_norm ->> 'type', now() - p_ago, '{}', p_norm)
$$;

-- ─── grant_plan_credits: once per transaction, rollover at renewal (reader 1) ─
select is(public.grant_plan_credits('90900000-0000-4000-a000-000000000001', '90900000-0000-4000-b000-000000000001',
  'play:t1', now(), now() + interval '30 days'), 300, 'first plan grant returns the plan credits');
select is(public.grant_plan_credits('90900000-0000-4000-a000-000000000001', '90900000-0000-4000-b000-000000000001',
  'play:t1', now(), now() + interval '30 days'), 0, 'a second call with the same transaction grants 0');
select is((select count(*)::int from public.credit_ledger where idempotency_key = 'plan:play:t1'), 1,
  'the replay wrote no second ledger row');
select results_eq($$select plan, rollover, topup, promo from public.credit_balances
                    where user_id = '90900000-0000-4000-a000-000000000001'$$,
  $$values (300, 0, 0, 0)$$, 'balances cache follows the grant');

select public.spend_credits('90900000-0000-4000-a000-000000000001', 100, 'tip', null, null, null, 'renew-spend-1');
select is(public.grant_plan_credits('90900000-0000-4000-a000-000000000001', '90900000-0000-4000-b000-000000000001',
  'play:t2', now(), now() + interval '30 days'), 300, 'renewal grants the plan again');
select results_eq($$select plan, rollover, topup, promo from public.credit_balances
                    where user_id = '90900000-0000-4000-a000-000000000001'$$,
  $$values (300, 200, 0, 0)$$, 'unused plan credits (200) move to rollover at renewal');
select is(public.grant_plan_credits('90900000-0000-4000-a000-000000000001', '90900000-0000-4000-b000-000000000001',
  'play:t3', now(), now() + interval '30 days'), 300, 'second renewal grants again');
select results_eq($$select plan, rollover, topup, promo from public.credit_balances
                    where user_id = '90900000-0000-4000-a000-000000000001'$$,
  $$values (300, 300, 0, 0)$$, 'rollover is capped at one plan (300) and the old rollover is gone');
select results_eq($$select bucket::text, sum(delta)::int from public.credit_ledger
                    where user_id = '90900000-0000-4000-a000-000000000001' and reason = 'expiry'
                    group by bucket order by bucket$$,
  $$values ('plan', -500), ('rollover', -200)$$, 'expiry rows: old rollover expired, plan credits carried out');

-- ─── roll_over: excess over the cap expires (reader 2) ──────────────────────
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('90900000-0000-4000-a000-000000000002', 500, 'plan_grant', 'plan', 'b:grant');
select is(public.roll_over('90900000-0000-4000-a000-000000000002', 'monthly', gen_random_uuid(), 'test:ro',
  now() + interval '30 days'), '{"rolled_over": 300, "expired": 200}'::jsonb,
  'roll_over moves up to the cap and expires the rest');
select is((select delta from public.credit_ledger where idempotency_key = 'test:ro:over_cap'), -200,
  'the excess has its own expiry row');
select results_eq($$select plan, rollover, topup, promo from public.credit_balances
                    where user_id = '90900000-0000-4000-a000-000000000002'$$,
  $$values (0, 300, 0, 0)$$, 'cache after roll_over');
select throws_ok($$select public.grant_plan_credits('90900000-0000-4000-a000-000000000002',
  '90900000-0000-4000-b000-0000000000ff', 'play:none', now(), now())$$,
  'P0001', 'no_subscription', 'a grant needs the reader''s own subscription');

-- ─── spend_credits bucket order (reader 3) ──────────────────────────────────
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('90900000-0000-4000-a000-000000000003', 10, 'rollover', 'rollover', 'c:r'),
  ('90900000-0000-4000-a000-000000000003', 20, 'plan_grant', 'plan', 'c:p'),
  ('90900000-0000-4000-a000-000000000003', 30, 'promo', 'promo', 'c:m'),
  ('90900000-0000-4000-a000-000000000003', 40, 'top_up', 'topup', 'c:t');
select public.spend_credits('90900000-0000-4000-a000-000000000003', 55, 'tip', null, null, null, 'order-key-a');
select results_eq($$select bucket::text, delta from public.credit_ledger
                    where idempotency_key like 'u:90900000-0000-4000-a000-000000000003:order-key-a%' order by id$$,
  $$values ('rollover', -10), ('plan', -20), ('promo', -25)$$, 'spends rollover, then plan, then promo');
select public.spend_credits('90900000-0000-4000-a000-000000000003', 45, 'tip', null, null, null, 'order-key-b');
select results_eq($$select bucket::text, delta from public.credit_ledger
                    where idempotency_key like 'u:90900000-0000-4000-a000-000000000003:order-key-b%' order by id$$,
  $$values ('promo', -5), ('topup', -40)$$, 'top-up credits are spent last');
select results_eq($$select plan, rollover, topup, promo from public.credit_balances
                    where user_id = '90900000-0000-4000-a000-000000000003'$$,
  $$values (0, 0, 0, 0)$$, 'every bucket ends at zero, none below');
select throws_ok($$select public.spend_credits('90900000-0000-4000-a000-000000000003', 1, 'tip', null, null, null,
  'order-key-c1')$$, 'P0001', 'insufficient_credits', 'nothing to spend is refused');

-- ─── grant_topup and clawback_purchase (reader 4) ───────────────────────────
insert into public.transactions (id, user_id, kind, topup_code, store, store_txn_id, gross_kobo, credits_granted)
values ('90900000-0000-4000-f000-000000000001', '90900000-0000-4000-a000-000000000004', 'topup', 'topup_200',
        'play', 'cb-1', 60000, 200);
select is(public.grant_topup('90900000-0000-4000-a000-000000000004', 'topup_200', 'play:cb-1'), 200,
  'top-up grants its credits');
select is(public.grant_topup('90900000-0000-4000-a000-000000000004', 'topup_200', 'play:cb-1'), 0,
  'a replayed top-up grants nothing');
select public.spend_credits('90900000-0000-4000-a000-000000000004', 150, 'tip', null, null, null, 'cb-spend-001');
select is(public.clawback_purchase('90900000-0000-4000-f000-000000000001', 'Refund test', false),
  '{"removed": 50, "not_recoverable": 150}'::jsonb, 'clawback takes only what is left and reports the rest');
select is(public.credit_balance('90900000-0000-4000-a000-000000000004'), 0, 'balance never goes below zero');
select is((select count(*)::int from public.credit_alerts
           where user_id = '90900000-0000-4000-a000-000000000004' and kind = 'clawback_short'), 1,
  'Finance is alerted about the unrecoverable credits');
select is((public.clawback_purchase('90900000-0000-4000-f000-000000000001', 'Refund test again', false) ->> 'removed')::int,
  0, 'a second clawback has nothing left to remove');
select throws_ok($$select public.grant_topup('90900000-0000-4000-a000-000000000006', 'topup_200', 'play:nope')$$,
  'P0001', 'topup_needs_plan', 'a reader without a plan cannot top up in the app');

-- ─── Payment events: duplicates, out of order, refunds (readers 7 and 10) ───
select is(pg_temp.ingest('ev-u7-1', interval '3 days', pg_temp.nrm('initial_purchase',
  '90900000-0000-4000-a000-000000000007', 'GPA.7001', 'GPA.7001')) ->> 'outcome', 'initial_purchase +300',
  'an initial purchase grants the plan');
select is((select credits_granted from public.transactions where store = 'play' and store_txn_id = 'GPA.7001'), 300,
  'the transaction records the credits granted');
select is(pg_temp.ingest('ev-u7-1', interval '3 days', pg_temp.nrm('initial_purchase',
  '90900000-0000-4000-a000-000000000007', 'GPA.7001', 'GPA.7001')) ->> 'duplicate', 'true',
  'the same provider and event id is a duplicate');
select is(public.credit_balance('90900000-0000-4000-a000-000000000007'), 300, 'a duplicate changes no balance');
select is((select count(*)::int from public.credit_ledger where idempotency_key = 'plan:play:GPA.7001'), 1,
  'a duplicate writes no ledger row');
select is(pg_temp.ingest('ev-u7-2', interval '1 day', pg_temp.nrm('renewal',
  '90900000-0000-4000-a000-000000000007', 'GPA.7001', 'GPA.7002')) ->> 'outcome', 'renewal +300',
  'a renewal grants the plan again');
select is(public.credit_balance('90900000-0000-4000-a000-000000000007'), 600, 'plan and rollover add up');
select is(pg_temp.ingest('ev-u7-3', interval '2 days', pg_temp.nrm('cancellation',
  '90900000-0000-4000-a000-000000000007', 'GPA.7001', 'GPA.7003')) ->> 'outcome', 'stale: recorded, not applied',
  'an older cancellation is recorded but not applied');
select is((select status from public.subscriptions where user_id = '90900000-0000-4000-a000-000000000007'), 'active',
  'the subscription stays active after the stale cancellation');
select pg_temp.ingest('ev-u7-4', interval '12 hours', pg_temp.nrm('cancellation',
  '90900000-0000-4000-a000-000000000007', 'GPA.7001', 'GPA.7004'));
select is((select status from public.subscriptions where user_id = '90900000-0000-4000-a000-000000000007'),
  'cancelled', 'a newer cancellation is applied');

create temp table ev_refund as
  select pg_temp.ingest('ev-u7-5', interval '1 hour', pg_temp.nrm('refund',
    '90900000-0000-4000-a000-000000000007', 'GPA.7001', 'GPA.7002')
    || jsonb_build_object('refund_kobo', 90000)) as r;
select is(((select r ->> 'outcome' from ev_refund)::jsonb ->> 'removed'), '300',
  'a refund event claws the plan credits back');
select is((select status from public.subscriptions where user_id = '90900000-0000-4000-a000-000000000007'), 'refunded',
  'a full plan refund ends the subscription');
select is(public.credit_balance('90900000-0000-4000-a000-000000000007'), 0,
  'refund clawback and expiry leave nothing (top-ups would stay)');

select is(pg_temp.ingest('ev-u10-1', interval '1 day', pg_temp.nrm('renewal',
  '90900000-0000-4000-a000-000000000010', 'GPA.1001', 'GPA.1002')) ->> 'outcome', 'renewal +300',
  'a renewal before its initial purchase creates the subscription and grants');
select pg_temp.ingest('ev-u10-2', interval '5 days', pg_temp.nrm('initial_purchase',
  '90900000-0000-4000-a000-000000000010', 'GPA.1001', 'GPA.1001'));
select is(pg_temp.ingest('ev-u10-3', interval '1 day', pg_temp.nrm('renewal',
  '90900000-0000-4000-a000-000000000010', 'GPA.1001', 'GPA.1002')) ->> 'outcome', 'renewal +0',
  'the same store transaction under a new event id grants nothing');
select is((select count(*)::int from public.credit_ledger where idempotency_key = 'plan:play:GPA.1002'), 1,
  'the early renewal granted exactly once');
select is((select count(*)::int from public.credit_ledger
           where user_id = '90900000-0000-4000-a000-000000000010' and reason = 'plan_grant'), 2,
  'the two store transactions granted once each');
select is((select count(*)::int from public.transactions where user_id = '90900000-0000-4000-a000-000000000010'), 2,
  'two transactions recorded');
select is((select count(*)::int from public.subscriptions where user_id = '90900000-0000-4000-a000-000000000010'), 1,
  'out-of-order events share one subscription');
select is((select last_event_at from public.subscriptions where user_id = '90900000-0000-4000-a000-000000000010'),
  now() - interval '1 day', 'the older initial purchase did not move the subscription back in time');

-- ─── Ledger immutability and money grants (run as postgres) ─────────────────
select throws_ok($$update public.credit_ledger set note = 'x'
  where user_id = '90900000-0000-4000-a000-000000000001'$$, '42501', null, 'ledger rows cannot be updated');
select throws_ok($$delete from public.credit_ledger
  where user_id = '90900000-0000-4000-a000-000000000001'$$, '42501', null, 'ledger rows cannot be deleted');
select ok(not has_table_privilege('service_role', 'public.credit_balances', 'UPDATE'),
  'service_role cannot write balances directly');
select ok(not has_table_privilege('service_role', 'public.transactions', 'INSERT'),
  'service_role cannot write transactions directly');
select ok(not has_table_privilege('service_role', 'public.payment_events', 'INSERT'),
  'service_role cannot write payment events directly');
select throws_ok($$insert into public.credit_ledger (user_id, delta, reason, bucket)
  values ('90900000-0000-4000-a000-000000000006', -1, 'expiry', 'plan')$$,
  '23514', 'credit bucket plan would go below zero', 'a bucket cannot go below zero');

-- ─── Chapter return fixtures (reader 5): one charge past the undo window, one inside it ─
insert into public.books (id, author_id, title) values
  ('90900000-0000-4000-c000-000000000001', '90900000-0000-4000-a000-000000000009', 'Return Book');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits)
values ('90900000-0000-4000-c100-000000000001', '90900000-0000-4000-c000-000000000001', 1, 'live', 60000, 240, 120);
insert into public.chapters (revision_id, chapter_uid, ord, title, words, pages, price_credits) values
  ('90900000-0000-4000-c100-000000000001', '90900000-0000-4000-e000-000000000001', 1, 'One', 16500, 66, 33),
  ('90900000-0000-4000-c100-000000000001', '90900000-0000-4000-e000-000000000002', 2, 'Two', 16500, 66, 33);
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key) values
  ('90900000-0000-4000-a000-000000000005', 100, 'plan_grant', 'plan', 'f:grant');
insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, ref_type, ref_id, book_id, chapter_uid,
  author_id, author_earning_kobo, idempotency_key, created_at) values
  ('90900000-0000-4000-a000-000000000005', -33, 'chapter', 'plan', '90900000-0000-4000-9000-000000000001', 'book',
   '90900000-0000-4000-c000-000000000001', '90900000-0000-4000-c000-000000000001',
   '90900000-0000-4000-e000-000000000001', '90900000-0000-4000-a000-000000000009', 5280, 'f:old',
   now() - interval '20 minutes'),
  ('90900000-0000-4000-a000-000000000005', -33, 'chapter', 'plan', '90900000-0000-4000-9000-000000000002', 'book',
   '90900000-0000-4000-c000-000000000001', '90900000-0000-4000-c000-000000000001',
   '90900000-0000-4000-e000-000000000002', '90900000-0000-4000-a000-000000000009', 5280, 'f:new',
   now() - interval '2 minutes');
insert into public.entitlements (user_id, book_id, scope, chapter_uid, source) values
  ('90900000-0000-4000-a000-000000000005', '90900000-0000-4000-c000-000000000001', 'chapter',
   '90900000-0000-4000-e000-000000000001', 'chapter'),
  ('90900000-0000-4000-a000-000000000005', '90900000-0000-4000-c000-000000000001', 'chapter',
   '90900000-0000-4000-e000-000000000002', 'chapter');

set local role authenticated;

-- ─── Staff grants: up to 500 at once, over 500 needs a different approver ───
select pg_temp.as_user('90900000-0000-4000-a000-000000000011');
select is(public.staff_grant_credits('90900000-0000-4000-a000-000000000006', 500, 'Goodwill credit') ->> 'status',
  'applied', 'a grant of 500 applies at once');
select is((select sum(delta)::int from public.credit_ledger
           where user_id = '90900000-0000-4000-a000-000000000006' and reason = 'staff_adjust' and bucket = 'promo'),
  500, 'the grant is a staff_adjust row in the promo bucket');
select is((select count(*)::int from public.audit_log
           where action = 'grant_credits' and object_id = '90900000-0000-4000-a000-000000000006'), 1,
  'the grant is in the audit log');
select is(public.staff_grant_credits('90900000-0000-4000-a000-000000000006', 501, 'Big goodwill') ->> 'status',
  'pending', 'a grant over 500 waits for a second person');
select is(public.credit_balance('90900000-0000-4000-a000-000000000006'), 500, 'a pending request grants nothing');
select throws_ok($$select public.decide_credit_grant((select id from public.credit_grant_requests
  where user_id = '90900000-0000-4000-a000-000000000006' and status = 'pending'), true)$$,
  'P0001', 'same_person', 'the requester cannot approve their own grant');

select pg_temp.as_user('90900000-0000-4000-a000-000000000008');
select is(public.staff_grant_credits('90900000-0000-4000-a000-000000000006', 100, 'Support goodwill') ->> 'status',
  'applied', 'support can grant up to 500');
select throws_ok($$select public.decide_credit_grant((select id from public.credit_grant_requests
  where user_id = '90900000-0000-4000-a000-000000000006' and status = 'pending'), true)$$,
  '42501', null, 'support cannot approve a large grant');

select pg_temp.as_user('90900000-0000-4000-a000-000000000012');
select is(public.decide_credit_grant((select id from public.credit_grant_requests
  where user_id = '90900000-0000-4000-a000-000000000006' and status = 'pending'), true) ->> 'status',
  'applied', 'a different approver applies the grant');
select is(public.credit_balance('90900000-0000-4000-a000-000000000006'), 1101, 'all three grants are in the balance');
select is((select approved_by from public.credit_grant_requests
           where user_id = '90900000-0000-4000-a000-000000000006' and credits = 501),
  '90900000-0000-4000-a000-000000000012'::uuid, 'the approver is recorded');
select throws_ok($$select public.decide_credit_grant((select id from public.credit_grant_requests
  where user_id = '90900000-0000-4000-a000-000000000006' and credits = 501), true)$$,
  'P0001', 'not_pending', 'a decided request cannot be decided again');
select throws_ok($$select public.staff_grant_credits('90900000-0000-4000-a000-000000000006', 10, 'x')$$,
  'P0001', 'reason_required', 'a grant needs a reason');

-- ─── staff_return_chapter: closed inside the undo window, works after it ────
select pg_temp.as_user('90900000-0000-4000-a000-000000000008');
select throws_ok($$select public.staff_return_chapter((select id from public.credit_ledger
  where idempotency_key = 'f:new'), 'did_not_open')$$, 'P0001', 'undo_window_open',
  'a charge inside the reader''s 10-minute undo window cannot be returned by staff');
select throws_ok($$select public.staff_return_chapter((select id from public.credit_ledger
  where idempotency_key = 'f:old'), 'changed_my_mind')$$, 'P0001', 'bad_reason', 'only the listed reasons are allowed');
select is(public.staff_return_chapter((select id from public.credit_ledger where idempotency_key = 'f:old'),
  'skipped_by_mistake') ->> 'returned', '33', 'a charge past the window is returned');
select is((select count(*)::int from public.credit_ledger
           where user_id = '90900000-0000-4000-a000-000000000005' and reason = 'refund' and delta = 33
             and bucket = 'plan' and ref_type = 'credit_return'
             and idempotency_key = 'credit_return:' || (select id from public.credit_ledger where idempotency_key = 'f:old')),
  1, 'a reverse row goes back into the bucket the charge came from (flow 14''s one return path)');
select is((select revoked_reason from public.entitlements
           where user_id = '90900000-0000-4000-a000-000000000005'
             and chapter_uid = '90900000-0000-4000-e000-000000000001'), 'staff_return',
  'the chapter entitlement is removed');
select is((select count(*)::int from public.entitlements
           where user_id = '90900000-0000-4000-a000-000000000005'
             and chapter_uid = '90900000-0000-4000-e000-000000000002' and revoked_at is null), 1,
  'other chapters keep their entitlement');
select is(public.credit_balance('90900000-0000-4000-a000-000000000005'), 67, 'the reader has the credits back');
select throws_ok($$select public.staff_return_chapter((select id from public.credit_ledger
  where idempotency_key = 'f:old'), 'did_not_open')$$, 'P0001', 'already_returned', 'a charge is returned only once');
select throws_ok($$select public.staff_return_chapter((select id from public.credit_ledger
  where idempotency_key = 'f:grant'), 'did_not_open')$$, 'P0001', 'not_a_chapter_charge',
  'only chapter charges can be returned');

-- ─── RLS: a reader sees and writes only their own money rows (reader 1) ─────
select pg_temp.as_user('90900000-0000-4000-a000-000000000001');
select is((select count(distinct user_id)::int from public.credit_ledger), 1, 'reader sees only their own ledger');
select is((select count(distinct user_id)::int from public.credit_balances), 1, 'reader sees only their own balances');
select is((select count(distinct user_id)::int from public.subscriptions), 1, 'reader sees only their own subscription');
select is((select count(distinct user_id)::int from public.transactions), 1, 'reader sees only their own transactions');
select throws_ok($$insert into public.credit_balances (user_id, plan)
  values ('90900000-0000-4000-a000-000000000001', 1000)$$, '42501', null, 'readers cannot insert balances');
select throws_ok($$update public.credit_balances set plan = 99999$$, '42501', null, 'readers cannot update balances');
select throws_ok($$insert into public.transactions (user_id, kind, plan_code, store, store_txn_id)
  values ('90900000-0000-4000-a000-000000000001', 'plan', 'monthly', 'play', 'hack-1')$$,
  '42501', null, 'readers cannot insert transactions');
select throws_ok($$update public.credit_ledger set delta = 1 where user_id = '90900000-0000-4000-a000-000000000001'$$,
  '42501', null, 'readers cannot update the ledger');
select throws_ok($$delete from public.credit_ledger where user_id = '90900000-0000-4000-a000-000000000001'$$,
  '42501', null, 'readers cannot delete from the ledger');
select throws_ok($$select public.staff_grant_credits('90900000-0000-4000-a000-000000000001', 10, 'free credits')$$,
  '42501', null, 'readers cannot grant credits');
select throws_ok($$select public.staff_return_chapter(1, 'wrong_book')$$, '42501', null,
  'readers cannot return chapters');
select throws_ok($$select public.decide_credit_grant(gen_random_uuid(), true)$$, '42501', null,
  'readers cannot decide grants');
select throws_ok($$select public.ingest_payment_event('revenuecat', 'x', 'x', now(), '{}', '{}')$$, '42501', null,
  'readers cannot ingest payment events');
select is((public.my_credit_balance() ->> 'total')::int, 600, 'my_credit_balance totals the buckets');
select is(public.my_credit_balance() ->> 'rollover', '300', 'my_credit_balance shows the rollover split');

reset role;

-- ─── Audit and cache against the ledger ─────────────────────────────────────
select is((select count(*)::int from public.audit_log
           where action = 'credit_return.done' and object_id = '90900000-0000-4000-a000-000000000005'), 1,
  'the chapter return is in the audit log');
select is((select count(*)::int from public.audit_log
           where area = 'money' and object_type = 'user' and object_id = '90900000-0000-4000-a000-000000000006'), 4,
  'both grants, the request and the approval are in the audit log');
select is((select count(*)::int from (
             select user_id,
                    coalesce(sum(delta) filter (where bucket = 'plan'), 0) as p,
                    coalesce(sum(delta) filter (where bucket = 'rollover'), 0) as r,
                    coalesce(sum(delta) filter (where bucket = 'topup'), 0) as t,
                    coalesce(sum(delta) filter (where bucket = 'promo'), 0) as m
             from public.credit_ledger where user_id::text like '90900000-%' group by user_id) l
           join public.credit_balances b on b.user_id = l.user_id
           where (l.p, l.r, l.t, l.m) <> (b.plan, b.rollover, b.topup, b.promo)), 0,
  'balances cache equals the ledger sums for every test reader');
select is((select count(*)::int from public.credit_balances where user_id::text like '90900000-%'),
  (select count(distinct user_id)::int from public.credit_ledger where user_id::text like '90900000-%'),
  'every reader with ledger rows has a cache row');

select * from finish();
rollback;
