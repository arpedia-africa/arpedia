-- Flow 15 · 15-26 (with 11-13, 13-20, 14-29): staff and system events reach the analytics outbox
-- with the spec's names and properties, and the Worker takes and marks them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email)
select ('15260000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow1526.test' from generate_series(1, 2) n;
delete from public.analytics_outbox;

create function pg_temp.ev(p_event text) returns jsonb
language sql as $$ select props - 'source' from public.analytics_outbox where event = p_event order by id desc limit 1 $$;

-- Earnings: a closed month with two author lines, then a payout that succeeds.
insert into public.earning_cycles (id, month, status, closed_at, payout_date, legacy, earnings_kobo) values
  ('15260000-0000-4000-c000-000000000001', '2019-10-01', 'closed', now(), current_date + 20, false, 480000);
insert into public.author_earnings (id, cycle_id, author_id, payable_kobo, status) values
  ('15260000-0000-4000-e000-000000000001', '15260000-0000-4000-c000-000000000001', '15260000-0000-4000-a000-000000000001', 300000, 'payable'),
  ('15260000-0000-4000-e000-000000000002', '15260000-0000-4000-c000-000000000001', '15260000-0000-4000-a000-000000000002', 180000, 'payable');
insert into public.audit_log (actor_id, area, action, object_type, object_id, summary) values
  ('15260000-0000-4000-a000-000000000002', 'money', 'cycle.close', 'earning_cycle', '15260000-0000-4000-c000-000000000001', 'Closed');
select is(pg_temp.ev('cycle_closed'), '{"month": "2019-10", "authors": 2, "kobo": 480000}'::jsonb, 'cycle_closed {month, authors, kobo}');
select is((select distinct_id from public.analytics_outbox where event = 'cycle_closed'), '15260000-0000-4000-a000-000000000002',
  'the staff member who acted');

insert into public.audit_log (actor_id, area, action, object_type, object_id, after) values
  (null, 'money', 'cycle.release', 'earning_cycle', '15260000-0000-4000-c000-000000000001', '{"authors": 2, "total_kobo": 480000}'),
  (null, 'money', 'bank_account.verify', 'author_bank_account', 'x', '{}'),
  (null, 'money', 'payout.retry', 'payout', 'x', '{"waiting": true}');
select is(pg_temp.ev('cycle_released'), '{"authors": 2, "kobo": 480000}'::jsonb, 'cycle_released {authors, kobo}');
select is(pg_temp.ev('bank_account_reviewed'), '{"decision": "verify"}'::jsonb, 'bank_account_reviewed {decision}');
select is(pg_temp.ev('payout_retry'), '{"mode": "new_account_when_verified"}'::jsonb, 'payout_retry {mode}');
select is((select distinct_id from public.analytics_outbox where event = 'payout_retry'), 'system', 'system events say so');

insert into public.payout_runs (id, cycle_id) values ('15260000-0000-4000-d000-000000000001', '15260000-0000-4000-c000-000000000001');
insert into public.payouts (id, run_id, author_earning_id, author_id, amount_kobo, attempt, reference, status) values
  ('15260000-0000-4000-f000-000000000001', '15260000-0000-4000-d000-000000000001', '15260000-0000-4000-e000-000000000001',
   '15260000-0000-4000-a000-000000000001', 300000, 1, 'ARP-PO-T1526-1', 'pending');
update public.payouts set status = 'successful' where id = '15260000-0000-4000-f000-000000000001';
select is(pg_temp.ev('payout_settled'), '{"status": "successful"}'::jsonb, 'payout_settled {status}');

-- Trust, campaigns and exports.
insert into public.audit_log (actor_id, area, action, object_type, object_id, object_label, summary, after, reason) values
  (null, 'trust', 'claim.uphold', 'claim', 'c1', null, null, null, null),
  (null, 'money', 'return_chapter', 'ledger', '1', null, 'Returned 12 credits for a chapter', '{}', 'wrong_chapter'),
  (null, 'insights', 'export.create', 'export', 'e1', 'readers', null, '{"includes_pii": true}', 'audit');
select is(pg_temp.ev('claim_decided'), '{"decision": "uphold"}'::jsonb, 'claim_decided {decision}');
select is(pg_temp.ev('credit_returned'), '{"credits": 12, "reason": "wrong_chapter"}'::jsonb, 'credit_returned {credits, reason}');
select is(pg_temp.ev('export_created'), '{"kind": "readers", "includes_pii": true}'::jsonb, 'export_created {kind, includes_pii}');

-- Actions that aren't events add nothing; the Worker takes the rest and marks them sent.
insert into public.audit_log (area, action) values ('trust', 'room.view');
select is((select count(*)::int from public.analytics_outbox where event like 'room%'), 0, 'other audit actions are not events');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.analytics_outbox_done(array(select (e ->> 'id')::bigint
                                             from jsonb_array_elements(public.analytics_outbox_take(100)) e)),
  (select count(*)::int from public.analytics_outbox), 'every taken event is marked sent');

select * from finish();
rollback;
