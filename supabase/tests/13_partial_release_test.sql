-- Flow 13 · 13-12: when the Flutterwave balance is short, a Super admin releases in part (whole
-- lines, smallest first, up to the balance); the rest stays approved, not sent, until a later call
-- sends it. The month is Paid only when nothing is left to send.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Start from no earnings data (the demo seed closes the same months).
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

-- 1 author A (₦1,600), 2 author B (₦3,200), 3 reader, 4 finance, 5 super admin.
insert into auth.users (id, email)
select ('13120000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@flow1312.test'
from generate_series(1, 5) n;
insert into public.profiles (id, full_name, is_author)
select ('13120000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'User ' || n, n <= 2
from generate_series(1, 5) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.author_profiles (user_id, pen_name, legal_name) values
  ('13120000-0000-4000-a000-000000000001', 'Ada', 'Adaeze Okafor'),
  ('13120000-0000-4000-a000-000000000002', 'Bayo', 'Adebayo Ade');
insert into public.staff_roles (user_id, role) values
  ('13120000-0000-4000-a000-000000000004', 'finance'),
  ('13120000-0000-4000-a000-000000000005', 'super_admin');
insert into public.books (id, author_id, title, status) values
  ('13120000-0000-4000-b000-000000000001', '13120000-0000-4000-a000-000000000001', 'A book', 'live'),
  ('13120000-0000-4000-b000-000000000002', '13120000-0000-4000-a000-000000000002', 'B book', 'live');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('13120000-0000-4000-a000-000000000003', 5000, 'plan_grant', 'plan', 't1312:g', '2026-05-01 10:00+01');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key, created_at) values
  ('13120000-0000-4000-a000-000000000003', -1000, 'unlock_all', 'plan', '13120000-0000-4000-b000-000000000001',
   '13120000-0000-4000-a000-000000000001', 160000, 't1312:a', '2026-05-10 12:00+01'),
  ('13120000-0000-4000-a000-000000000003', -2000, 'unlock_all', 'plan', '13120000-0000-4000-b000-000000000002',
   '13120000-0000-4000-a000-000000000002', 320000, 't1312:b', '2026-05-11 12:00+01');

create function pg_temp.as_user(uid text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true);
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
grant execute on function pg_temp.as_user(text), pg_temp.as_service(), pg_temp.as_owner()
  to authenticated, service_role;
-- A single-use step-up for `uid` (flow 16 rule 6), as verify_stepup records a backup code.
create function pg_temp.stepup(uid text, scope text) returns uuid
language plpgsql as $$
declare
  v_role text := current_setting('role');
  v_id uuid;
begin
  perform set_config('role', 'postgres', true);
  insert into public.staff_stepups (user_id, scope, method, proof_at)
    values (uid::uuid, scope, 'backup', now()) returning id into v_id;
  perform set_config('role', v_role, true);
  return v_id;
end $$;
grant execute on function pg_temp.stepup(text, text) to authenticated, service_role;


create function pg_temp.may() returns uuid language sql as $$
  select id from public.earning_cycles where month = '2026-05-01'
$$;
create function pg_temp.line(n int) returns text language sql as $$
  select e.status::text from public.author_earnings e
  where e.cycle_id = (select id from public.earning_cycles where month = '2026-05-01')
    and e.author_id = ('13120000-0000-4000-a000-00000000000' || n)::uuid
$$;
grant execute on function pg_temp.may(), pg_temp.line(int) to authenticated, service_role;

select pg_temp.as_service();
select is(public.submit_bank_account('13120000-0000-4000-a000-000000000001', '058', 'GTBank', '1234',
  '\x00'::bytea, 'OKAFOR ADAEZE', 95) ->> 'status', 'verified', 'A''s account verifies');
select is(public.submit_bank_account('13120000-0000-4000-a000-000000000002', '058', 'GTBank', '5678',
  '\x00'::bytea, 'ADE ADEBAYO', 95) ->> 'status', 'verified', 'B''s account verifies');
select pg_temp.as_owner();
update public.author_bank_accounts set payouts_resume_at = now() - interval '1 hour';

select pg_temp.as_user('13120000-0000-4000-a000-000000000005');
select lives_ok($$select public.close_cycle('2026-05-01')$$, 'May closes');
select pg_temp.as_owner();
update public.earning_cycles set closed_at = now() - interval '31 days' where month = '2026-05-01';
select pg_temp.as_user('13120000-0000-4000-a000-000000000004');
select lives_ok($$select public.prepare_cycle(pg_temp.may(), 200000)$$, 'Finance prepares May with a short balance');

-- The preparer can't release in part either; a balance below every line sends nothing.
select throws_ok($$select public.release_cycle_part(pg_temp.may(),
    pg_temp.stepup('13120000-0000-4000-a000-000000000004', 'release_payout'), 200000)$$,
  null, null, 'Finance (the preparer) cannot release in part');
select pg_temp.as_user('13120000-0000-4000-a000-000000000005');
select throws_ok($$select public.release_cycle_part(pg_temp.may(),
    pg_temp.stepup('13120000-0000-4000-a000-000000000005', 'release_payout'), 100000)$$,
  'P0001', 'balance_too_low', 'a balance below the smallest line sends nothing');
select throws_ok($$select public.release_cycle_part(pg_temp.may(), null, 200000)$$,
  null, null, 'a partial release needs a fresh code');

-- ₦2,000 covers A (₦1,600) but not B (₦3,200): A goes, B stays approved, not sent.
select results_eq($$select (r ->> 'authors')::int, (r ->> 'total_kobo')::bigint, (r ->> 'left_authors')::int,
                           (r ->> 'left_kobo')::bigint
                    from (select public.release_cycle_part(pg_temp.may(),
                            pg_temp.stepup('13120000-0000-4000-a000-000000000005', 'release_payout'), 200000) r) x$$,
  $$values (1, 160000::bigint, 1, 320000::bigint)$$, 'partial release sends A and leaves B');
select pg_temp.as_owner();
select results_eq($$select pg_temp.line(1), pg_temp.line(2)$$, $$values ('queued', 'payable')$$,
  'A is queued; B stays approved, not sent (payable)');
select is((select status::text from public.earning_cycles where month = '2026-05-01'), 'releasing',
  'the month is releasing');

-- A's transfer settles: the month is not Paid while B is left.
select pg_temp.as_service();
select public.payout_transfer_created((select id from public.payouts
  where author_id = '13120000-0000-4000-a000-000000000001'), 'fw-ev1312a');
select ok((public.payout_apply_event('ev1312a', (select reference from public.payouts
  where author_id = '13120000-0000-4000-a000-000000000001'), 'successful') ->> 'applied')::boolean, 'A''s transfer succeeds');
select pg_temp.as_owner();
select is((select status::text from public.earning_cycles where month = '2026-05-01'), 'releasing',
  'the month is not Paid while B is approved, not sent');

-- The full release replays (sends nothing twice, sends nothing new).
select pg_temp.as_user('13120000-0000-4000-a000-000000000005');
select is((public.release_cycle(pg_temp.may(),
  pg_temp.stepup('13120000-0000-4000-a000-000000000005', 'release_payout')) ->> 'replayed')::boolean, true,
  'a full release on a releasing month replays');
select pg_temp.as_owner();
select is(pg_temp.line(2), 'payable', 'the replay did not send B');

-- Topped up: the rest goes.
select pg_temp.as_user('13120000-0000-4000-a000-000000000005');
select results_eq($$select (r ->> 'authors')::int, (r ->> 'total_kobo')::bigint, (r ->> 'left_authors')::int,
                           (r ->> 'rest')::boolean
                    from (select public.release_cycle_part(pg_temp.may(),
                            pg_temp.stepup('13120000-0000-4000-a000-000000000005', 'release_payout'), 1000000) r) x$$,
  $$values (1, 320000::bigint, 0, true)$$, 'send the rest sends B');
select pg_temp.as_owner();
select is((select count(*)::int from public.payout_runs where cycle_id = pg_temp.may()), 2,
  'each send is its own run');
select is((select count(*)::int from public.payouts p join public.payout_runs r on r.id = p.run_id
           where r.cycle_id = pg_temp.may()), 2, 'one transfer per author, none twice');

select pg_temp.as_service();
select public.payout_transfer_created((select id from public.payouts
  where author_id = '13120000-0000-4000-a000-000000000002'), 'fw-ev1312b');
select ok((public.payout_apply_event('ev1312b', (select reference from public.payouts
  where author_id = '13120000-0000-4000-a000-000000000002'), 'successful') ->> 'applied')::boolean, 'B''s transfer succeeds');
select pg_temp.as_owner();
select is((select status::text from public.earning_cycles where month = '2026-05-01'), 'paid',
  'the month is Paid once nothing is left to send');

select * from finish();
rollback;
