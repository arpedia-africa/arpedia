-- Flow 13 · Finance alerts: payout_reminder_due goes once per cycle, 3 days before payout day, and
-- counts unverified authors; payouts_pending_over flags only the payouts raised on that call.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Four authors, then the earnings rows straight into the tables (no close or release needed).
insert into auth.users (id, email)
select ('13f00000-0000-4000-a000-00000000000' || n)::uuid, 'fa' || n || '@flow13.test' from generate_series(1, 4) n;
insert into public.profiles (id, full_name, is_author)
select ('13f00000-0000-4000-a000-00000000000' || n)::uuid, 'Author ' || n, true from generate_series(1, 4) n
on conflict (id) do update set full_name = excluded.full_name, is_author = true;

set local session_replication_role = replica;
delete from public.payout_events;
delete from public.payouts;
delete from public.payout_runs;
delete from public.author_earnings;
delete from public.earning_cycles;
delete from public.author_bank_accounts;

insert into public.earning_cycles (id, month, status, closed_at, payout_date, legacy) values
  -- due: payout in 3 days (Lagos)
  ('13f00000-0000-4000-c000-000000000001', '2026-01-01', 'prepared', now(),
   (now() at time zone 'Africa/Lagos')::date + 3, false),
  -- not yet: payout in 10 days
  ('13f00000-0000-4000-c000-000000000002', '2026-02-01', 'closed', now(),
   (now() at time zone 'Africa/Lagos')::date + 10, false),
  -- already paid
  ('13f00000-0000-4000-c000-000000000003', '2025-12-01', 'paid', now(),
   (now() at time zone 'Africa/Lagos')::date + 1, false);
-- A: payable, verified · B: payable, no verified account · C: held unverified · D: carried
insert into public.author_earnings (id, cycle_id, author_id, payable_kobo, status) values
  ('13f00000-0000-4000-e000-000000000001', '13f00000-0000-4000-c000-000000000001',
   '13f00000-0000-4000-a000-000000000001', 500000, 'payable'),
  ('13f00000-0000-4000-e000-000000000002', '13f00000-0000-4000-c000-000000000001',
   '13f00000-0000-4000-a000-000000000002', 200000, 'payable'),
  ('13f00000-0000-4000-e000-000000000003', '13f00000-0000-4000-c000-000000000001',
   '13f00000-0000-4000-a000-000000000003', 150000, 'held_unverified'),
  ('13f00000-0000-4000-e000-000000000004', '13f00000-0000-4000-c000-000000000001',
   '13f00000-0000-4000-a000-000000000004', 50000, 'carried');
insert into public.author_bank_accounts (author_id, bank_code, bank_name, account_last4, account_number_enc,
                                         bank_account_name, match_score, status, payouts_resume_at) values
  ('13f00000-0000-4000-a000-000000000001', '058', 'GTBank', '1234', '\x00', 'A', 95, 'verified', now()),
  ('13f00000-0000-4000-a000-000000000002', '058', 'GTBank', '5678', '\x00', 'B', 60, 'needs_review', now());

insert into public.payout_runs (id, cycle_id) values
  ('13f00000-0000-4000-d000-000000000001', '13f00000-0000-4000-c000-000000000003');
insert into public.payouts (id, run_id, author_earning_id, author_id, amount_kobo, attempt, reference, status,
                            flutterwave_transfer_id, sent_at, raised_at) values
  -- stuck 50 h, never raised
  ('13f00000-0000-4000-f000-000000000001', '13f00000-0000-4000-d000-000000000001',
   '13f00000-0000-4000-e000-000000000001', '13f00000-0000-4000-a000-000000000001', 500000, 1,
   'ARP-PO-T13F-1', 'pending', '901', now() - interval '50 hours', null),
  -- stuck 60 h, raised an hour ago
  ('13f00000-0000-4000-f000-000000000002', '13f00000-0000-4000-d000-000000000001',
   '13f00000-0000-4000-e000-000000000002', '13f00000-0000-4000-a000-000000000002', 200000, 1,
   'ARP-PO-T13F-2', 'pending', '902', now() - interval '60 hours', now() - interval '1 hour'),
  -- pending 2 h: not stuck
  ('13f00000-0000-4000-f000-000000000003', '13f00000-0000-4000-d000-000000000001',
   '13f00000-0000-4000-e000-000000000003', '13f00000-0000-4000-a000-000000000003', 150000, 1,
   'ARP-PO-T13F-3', 'pending', '903', now() - interval '2 hours', null);
set local session_replication_role = origin;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_user() returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"13f00000-0000-4000-a000-000000000001","role":"authenticated"}', true);
end $$;
grant execute on function pg_temp.as_service(), pg_temp.as_user() to authenticated, service_role;

-- ─── payout_reminder_due ────────────────────────────────────────────────────
select pg_temp.as_user();
select throws_ok($$select public.payout_reminder_due()$$, '42501', null, 'readers cannot call the reminder');

select pg_temp.as_service();
create temp table r as select public.payout_reminder_due() as v;
grant select on r to service_role;
select is((select v ->> 'cycle_id' from r), '13f00000-0000-4000-c000-000000000001',
  'the cycle paid in 3 days is due');
select is((select (v ->> 'payable_authors')::int from r), 1, 'one author can be paid');
select is((select (v ->> 'payable_kobo')::bigint from r), 500000::bigint, 'payable counts verified authors only');
select is((select (v ->> 'unverified_authors')::int from r), 2,
  'held unverified and payable without a verified account are both unverified');
select is((select (v ->> 'unverified_kobo')::bigint from r), 350000::bigint, 'their amount');
select is(public.payout_reminder_due(), null::jsonb, 'the reminder goes once per cycle');

-- ─── payouts_pending_over ───────────────────────────────────────────────────
create temp table p as select x from jsonb_array_elements(public.payouts_pending_over(48)) x;
grant select on p to service_role;
select is((select count(*)::int from p), 2, 'only transfers pending over 48 hours');
select is((select (x ->> 'newly_raised')::boolean from p where x ->> 'reference' = 'ARP-PO-T13F-1'), true,
  'a transfer raised on this call is flagged');
select is((select (x ->> 'newly_raised')::boolean from p where x ->> 'reference' = 'ARP-PO-T13F-2'), false,
  'one raised before is not raised again');
select is((select (x ->> 'amount_kobo')::bigint from p where x ->> 'reference' = 'ARP-PO-T13F-1'),
  500000::bigint, 'the amount is returned for the alert');
-- (A later call can't be checked here: now() is fixed inside this test's one transaction.)

select * from finish();
rollback;
