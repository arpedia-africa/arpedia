-- Flow 13 · Earnings and payouts: close_cycle totals equal the ledger and are idempotent, exclusions
-- (self-read, gift loop, undone chapter), carry and holds, prepare/release rules (same person,
-- Super admin only, fresh 2-step, ledger mismatch, hold), duplicate release, transfer events
-- (duplicate, out of order, reversed after success), blind retries blocked, bank review, RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- The demo seed (seeds/13_earnings.sql) closes the same months: start from no earnings data.
set local session_replication_role = replica;
delete from public.payout_events;
delete from public.payouts;
delete from public.payout_runs;
delete from public.author_earnings;
delete from public.earning_exclusions;
delete from public.earning_cycles;
delete from public.author_bank_accounts;
delete from public.credit_ledger where idempotency_key like 'seed13:%';
set local session_replication_role = origin;

-- ─── Fixtures ───────────────────────────────────────────────────────────────
-- 1 author A (verified bank), 2 author B (below minimum), 3 author C (no bank), 4 reader,
-- 5 finance, 6 and 7 super admins.
insert into auth.users (id, email)
select ('13130000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@flow13.test'
from generate_series(1, 7) n;
insert into public.profiles (id, full_name, is_author)
select ('13130000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'User ' || n, n <= 3
from generate_series(1, 7) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.author_profiles (user_id, pen_name, legal_name) values
  ('13130000-0000-4000-a000-000000000001', 'Ada', 'Adaeze Okafor'),
  ('13130000-0000-4000-a000-000000000002', 'Bayo', 'Adebayo Ade'),
  ('13130000-0000-4000-a000-000000000003', 'Chi', 'Chiamaka Eze');
insert into public.staff_roles (user_id, role) values
  ('13130000-0000-4000-a000-000000000005', 'finance'),
  ('13130000-0000-4000-a000-000000000006', 'super_admin'),
  ('13130000-0000-4000-a000-000000000007', 'super_admin');
insert into public.books (id, author_id, title, status) values
  ('13130000-0000-4000-b000-000000000001', '13130000-0000-4000-a000-000000000001', 'A book', 'live'),
  ('13130000-0000-4000-b000-000000000002', '13130000-0000-4000-a000-000000000002', 'B book', 'live'),
  ('13130000-0000-4000-b000-000000000003', '13130000-0000-4000-a000-000000000003', 'C book', 'live');

-- Credits first (flow 09's bucket guard), then September 2026 spends (WAT).
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('13130000-0000-4000-a000-000000000004', 5000, 'plan_grant', 'plan', 't13:g4', '2026-08-01 10:00+01'),
  ('13130000-0000-4000-a000-000000000001', 100, 'top_up', 'topup', 't13:g1', '2026-08-01 10:00+01');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key, created_at) values
  ('13130000-0000-4000-a000-000000000004', -1000, 'unlock_all', 'plan', '13130000-0000-4000-b000-000000000001',
   '13130000-0000-4000-a000-000000000001', 160000, 't13:unlock', '2026-09-10 12:00+01'),
  ('13130000-0000-4000-a000-000000000004', -10, 'chapter', 'plan', '13130000-0000-4000-b000-000000000001',
   '13130000-0000-4000-a000-000000000001', 1600, 't13:ch', '2026-09-11 12:00+01'),
  ('13130000-0000-4000-a000-000000000004', -50, 'tip', 'plan', '13130000-0000-4000-b000-000000000001',
   '13130000-0000-4000-a000-000000000001', 8000, 't13:tip', '2026-09-12 12:00+01'),
  ('13130000-0000-4000-a000-000000000004', -20, 'tip', 'plan', '13130000-0000-4000-b000-000000000001',
   '13130000-0000-4000-a000-000000000001', 3200, 't13:loop', '2026-09-13 12:00+01'),
  ('13130000-0000-4000-a000-000000000001', -5, 'chapter', 'topup', '13130000-0000-4000-b000-000000000001',
   '13130000-0000-4000-a000-000000000001', 800, 't13:self', '2026-09-14 12:00+01'),
  ('13130000-0000-4000-a000-000000000004', -100, 'chapter', 'plan', '13130000-0000-4000-b000-000000000002',
   '13130000-0000-4000-a000-000000000002', 16000, 't13:b', '2026-09-15 12:00+01'),
  ('13130000-0000-4000-a000-000000000004', -1000, 'unlock_all', 'plan', '13130000-0000-4000-b000-000000000003',
   '13130000-0000-4000-a000-000000000003', 160000, 't13:c', '2026-09-16 12:00+01'),
  -- August: one tip to B (the ledger-mismatch case).
  ('13130000-0000-4000-a000-000000000004', -10, 'tip', 'plan', '13130000-0000-4000-b000-000000000002',
   '13130000-0000-4000-a000-000000000002', 1600, 't13:aug', '2026-08-20 12:00+01');
-- The reader undid the chapter within 10 minutes (reversal row nets it).
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  ref_ledger_id, idempotency_key, created_at)
select user_id, 10, 'undo', 'plan', book_id, author_id, -1600, id, 't13:undo', '2026-09-11 12:05+01'
from public.credit_ledger where idempotency_key = 't13:ch';

create function pg_temp.as_user(uid text, age interval default '1 minute') returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - age)::bigint)))::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
grant execute on function pg_temp.as_user(text, interval), pg_temp.as_service(), pg_temp.as_owner()
  to authenticated, service_role;

-- A's account, auto-verified (score 95), its 48-hour pause already over.
select pg_temp.as_service();
select is(public.submit_bank_account('13130000-0000-4000-a000-000000000001', '058', 'GTBank', '1234',
  '\x00'::bytea, 'OKAFOR ADAEZE', 95) ->> 'status', 'verified', 'score 90+ auto-verifies the account');
select pg_temp.as_owner();
update public.author_bank_accounts set payouts_resume_at = now() - interval '1 hour';

-- ─── close_cycle ────────────────────────────────────────────────────────────
select pg_temp.as_user('13130000-0000-4000-a000-000000000004');
select throws_ok($$select public.close_cycle('2026-09-01')$$, '42501', null, 'readers cannot close a month');
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select throws_ok($$select public.close_cycle('2026-09-01')$$, '42501', null, 'Finance cannot close a month');
select is(public.exclude_gift_loop(array[(select id from public.credit_ledger where idempotency_key = 't13:loop')]),
  1, 'Finance excludes a gift loop row');
select pg_temp.as_user('13130000-0000-4000-a000-000000000006');
select throws_ok($$select public.close_cycle(date_trunc('month', now() at time zone 'Africa/Lagos')::date)$$,
  'P0001', 'month_not_ended', 'the current month cannot close');
select is((public.close_cycle('2026-09-01') ->> 'authors')::int, 3, 'September closes with three authors');
select results_eq($$select book_credits, tip_message_credits, excluded_credits, amount_kobo, e.status::text
                    from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
                    where c.month = '2026-09-01' and author_id = '13130000-0000-4000-a000-000000000001'$$,
  $$values (1000, 50, 25, 168000::bigint, 'payable')$$,
  'A earns credits × ₦1.60: undone chapter nets, self-read and gift loop excluded');
select is((select status::text from public.author_earnings where author_id = '13130000-0000-4000-a000-000000000002'
           and cycle_id = (select id from public.earning_cycles where month = '2026-09-01')),
  'carried', 'below ₦1,000 is carried');
select is((select status::text from public.author_earnings where author_id = '13130000-0000-4000-a000-000000000003'
           and cycle_id = (select id from public.earning_cycles where month = '2026-09-01')),
  'held_unverified', 'no verified account: held, not skipped');
select is((select (ledger_check ->> 'diff_kobo')::bigint from public.earning_cycles where month = '2026-09-01'),
  0::bigint, 'ledger check: lines and exclusions equal the ledger');
select is((select earnings_kobo from public.earning_cycles where month = '2026-09-01'),
  (select sum(author_earning_kobo)::bigint from public.credit_ledger
   where created_at >= '2026-09-01 00:00+01' and created_at < '2026-10-01 00:00+01' and author_id is not null)
  - 4000, 'month total = ledger sum minus the excluded 4,000 kobo');
select is((select count(*)::int from public.earning_exclusions where reason = 'undone'), 1,
  'the undone chapter is counted under what was not paid');
select lives_ok($$select public.close_cycle('2026-09-01')$$, 'closing again is allowed before preparing');
select results_eq($$select count(*)::int, sum(amount_kobo)::bigint from public.author_earnings e
                    join public.earning_cycles c on c.id = e.cycle_id where c.month = '2026-09-01'$$,
  $$values (3, 344000::bigint)$$, 'close_cycle is idempotent');
select is((select count(*)::int from public.earning_exclusions), 3, 're-running adds no exclusions');
select pg_temp.as_owner();
select is((select payout_date from public.earning_cycles where month = '2026-09-01'),
  public._payout_date((select closed_at from public.earning_cycles where month = '2026-09-01'), 30, 15),
  'payout date = first 15th on or after close + 30 days');

-- ─── RLS ────────────────────────────────────────────────────────────────────
select pg_temp.as_user('13130000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.author_earnings), 1, 'an author sees only their own lines');
select is((select count(*)::int from public.author_bank_accounts), 1, 'an author sees their own account');
select throws_ok($$select account_number_enc from public.author_bank_accounts$$, '42501', null,
  'the encrypted number is never returned to a client');
select throws_ok($$update public.author_earnings set amount_kobo = 1$$, '42501', null,
  'clients write no earnings');
select pg_temp.as_user('13130000-0000-4000-a000-000000000004');
select is((select count(*)::int from public.author_earnings), 0, 'readers see no earnings');
select is((select count(*)::int from public.earning_cycles), 0, 'readers see no cycles');

-- ─── prepare and release ────────────────────────────────────────────────────
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select throws_ok($$select public.prepare_cycle((select id from public.earning_cycles where month = '2026-09-01'))$$,
  'P0001', 'hold_not_ended', 'cannot prepare before the hold ends');
select pg_temp.as_owner();
update public.earning_cycles set closed_at = now() - interval '31 days' where month = '2026-09-01';
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select ok((public.prepare_cycle((select id from public.earning_cycles where month = '2026-09-01'), 50000000)
           ->> 'ledger_match')::boolean, 'Finance prepares when the checks pass');
select throws_ok($$select public.release_cycle((select id from public.earning_cycles where month = '2026-09-01'))$$,
  '42501', null, 'Finance cannot release');
select pg_temp.as_user('13130000-0000-4000-a000-000000000006', '30 minutes');
select throws_ok($$select public.release_cycle((select id from public.earning_cycles where month = '2026-09-01'))$$,
  '42501', 'two_step_required', 'release needs a 2-step code in the last 10 minutes');
select pg_temp.as_owner();
update public.earning_cycles set prepared_by = '13130000-0000-4000-a000-000000000006' where month = '2026-09-01';
select pg_temp.as_user('13130000-0000-4000-a000-000000000006');
select throws_ok($$select public.release_cycle((select id from public.earning_cycles where month = '2026-09-01'))$$,
  'P0001', 'same_person', 'the preparer cannot approve');
select pg_temp.as_owner();
update public.earning_cycles set prepared_by = '13130000-0000-4000-a000-000000000005' where month = '2026-09-01';
select pg_temp.as_user('13130000-0000-4000-a000-000000000006');
select results_eq($$select (r ->> 'authors')::int, (r ->> 'total_kobo')::bigint from
                    (select public.release_cycle((select id from public.earning_cycles where month = '2026-09-01')) r) x$$,
  $$values (1, 168000::bigint)$$, 'a second Super admin releases the verified, payable author');
select is((public.release_cycle((select id from public.earning_cycles where month = '2026-09-01')) ->> 'replayed')::boolean,
  true, 'releasing twice replays');
select pg_temp.as_owner();
select is((select count(*)::int from public.payouts), 1, 'no duplicate transfers');
select is((select reference from public.payouts),
  'ARP-PO-202609-1313000000004000a000000000000001-1', 'reference ARP-PO-{cycle}-{author}-{attempt}');
select is((select count(*)::int from pgmq.q_payout_transfer), 1, 'one transfer message queued');

-- Ledger mismatch: a row lands in a closed month after close (August).
select pg_temp.as_user('13130000-0000-4000-a000-000000000006');
select lives_ok($$select public.close_cycle('2026-08-01')$$, 'August closes');
select pg_temp.as_owner();
update public.earning_cycles set closed_at = now() - interval '31 days' where month = '2026-08-01';
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo, created_at)
values ('13130000-0000-4000-a000-000000000004', -5, 'tip', 'plan', '13130000-0000-4000-b000-000000000002',
        '13130000-0000-4000-a000-000000000002', 800, '2026-08-25 12:00+01');
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select is((public.recheck_cycle((select id from public.earning_cycles where month = '2026-08-01')) ->> 'diff_kobo')::bigint,
  800::bigint, 'recheck shows the difference');
select throws_ok($$select public.prepare_cycle((select id from public.earning_cycles where month = '2026-08-01'))$$,
  'P0001', 'ledger_mismatch', 'a ledger mismatch blocks preparing');

-- ─── Transfer events (Worker) ───────────────────────────────────────────────
select pg_temp.as_service();
select ok((public.payout_for_transfer((select id from public.payouts)) ->> 'send')::boolean,
  'the Worker gets the transfer to send');
select public.payout_transfer_created((select id from public.payouts), 'fw-1');
select ok((public.payout_apply_event('ev-1', (select reference from public.payouts), 'successful') ->> 'applied')::boolean,
  'successful applies');
select ok((public.payout_apply_event('ev-1', (select reference from public.payouts), 'successful') ->> 'replayed')::boolean,
  'the same event twice changes nothing');
select ok(not (public.payout_apply_event('ev-2', (select reference from public.payouts), 'pending') ->> 'applied')::boolean,
  'a late pending never overwrites successful');
select pg_temp.as_owner();
select results_eq($$select e.status::text, c.status::text from public.author_earnings e
                    join public.earning_cycles c on c.id = e.cycle_id
                    where e.author_id = '13130000-0000-4000-a000-000000000001' and c.month = '2026-09-01'$$,
  $$values ('paid', 'paid')$$, 'line and month are paid');
select pg_temp.as_service();
select ok((public.payout_apply_event('ev-3', (select reference from public.payouts), 'reversed',
           'Account closed') ->> 'applied')::boolean, 'a reversal follows a success');
select pg_temp.as_owner();
select is((select status::text from public.earning_cycles where month = '2026-09-01'), 'paid_with_failures',
  'the month shows failures');

-- ─── Retries ────────────────────────────────────────────────────────────────
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select throws_ok($$select public.retry_payout((select id from public.payouts), 'same_account_confirmed')$$,
  'P0001', 'confirm_required', 'retrying the same account needs confirmation');
select is((public.retry_payout((select id from public.payouts), 'new_account_when_verified') ->> 'waiting_for_account')::boolean,
  true, 'no blind retry: the money waits for a new verified account');
select throws_ok($$select public.retry_payout((select id from public.payouts where attempt = 1), 'new_account_when_verified')$$,
  'P0001', 'already_retried', 'one retry per failure');
select pg_temp.as_service();
select is(public.submit_bank_account('13130000-0000-4000-a000-000000000001', '044', 'Access Bank', '9876',
  '\x01'::bytea, 'ADA OKAFOR', 70) ->> 'status', 'needs_review', 'a low score goes to a person');
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select is((public.review_bank_account((select id from public.author_bank_accounts where status = 'needs_review'),
  'verify') ->> 'retries_queued')::int, 1, 'verifying the new account queues the waiting retry');
select pg_temp.as_owner();
select results_eq($$select p.attempt, b.account_last4, p.not_before > now() + interval '47 hours'
                    from public.payouts p join public.author_bank_accounts b on b.id = p.bank_account_id
                    where not p.waiting_for_account and p.status = 'queued'$$,
  $$values (2, '9876', true)$$, 'attempt 2 goes to the new account after its 48-hour pause');

-- ─── Settings and pauses ────────────────────────────────────────────────────
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select throws_ok($$select public.save_earning_settings(30, 100000, 15, true)$$, '42501', null,
  'Finance cannot save settings');
select lives_ok($$select public.pause_author_payouts('13130000-0000-4000-a000-000000000002', 'account_dispute')$$,
  'Finance pauses an author with a reason');
select pg_temp.as_owner();
select is((select status from public._line_status('13130000-0000-4000-a000-000000000002', 500000, 100000)),
  'held_paused'::public.author_earning_status, 'a paused author is held');

-- ─── Admin reads ────────────────────────────────────────────────────────────
select pg_temp.as_user('13130000-0000-4000-a000-000000000005');
select is((select r ->> 'status' from jsonb_array_elements(public.admin_earning_cycles() -> 'cycles') r
           where r ->> 'month' = '2026-09-01'), 'releasing', 'cycle list shows September sending its retry');
select is(jsonb_array_length(public.admin_earning_cycle((select id from public.earning_cycles
                                                         where month = '2026-09-01')) -> 'lines'),
  (select count(*)::int from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
   where c.month = '2026-09-01'), 'cycle detail lists every author line');
select is((public.admin_payouts() ->> 'total')::int, (select count(*)::int from public.payouts),
  'payouts list every transfer');
select is((public.admin_payout((select id from public.payouts where attempt = 1)) ->> 'can_retry')::boolean, false,
  'a retried transfer cannot be retried again');
select ok(not (public.admin_bank_account((select id from public.author_bank_accounts limit 1))
               ? 'account_number_enc'), 'the encrypted number never leaves the database');
select lives_ok($$select public.admin_author_payout('13130000-0000-4000-a000-000000000001'),
                         public.admin_earning_settings(), public.admin_bank_accounts('verified')$$,
  'author payout, settings and bank queue read');
select pg_temp.as_user('13130000-0000-4000-a000-000000000004');
select throws_ok($$select public.admin_payouts()$$, '42501', null, 'readers cannot list payouts');

select * from finish();
rollback;
