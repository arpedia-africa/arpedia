-- Flow 13 · 13-16: a payable line whose bank account stopped being verified after prepare is held
-- at release (not left `payable`), and the next close carries it in, so no money is orphaned.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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

-- 1 author A (account verified, then replaced after prepare), 2 author B (verified throughout),
-- 3 reader, 4 finance, 5 super admin.
insert into auth.users (id, email)
select ('13160000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@flow1316.test'
from generate_series(1, 5) n;
insert into public.profiles (id, full_name, is_author)
select ('13160000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'User ' || n, n <= 2
from generate_series(1, 5) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.author_profiles (user_id, pen_name, legal_name) values
  ('13160000-0000-4000-a000-000000000001', 'Ada', 'Adaeze Okafor'),
  ('13160000-0000-4000-a000-000000000002', 'Bayo', 'Adebayo Ade');
insert into public.staff_roles (user_id, role) values
  ('13160000-0000-4000-a000-000000000004', 'finance'),
  ('13160000-0000-4000-a000-000000000005', 'super_admin');
insert into public.books (id, author_id, title, status) values
  ('13160000-0000-4000-b000-000000000001', '13160000-0000-4000-a000-000000000001', 'A book', 'live'),
  ('13160000-0000-4000-b000-000000000002', '13160000-0000-4000-a000-000000000002', 'B book', 'live');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('13160000-0000-4000-a000-000000000003', 5000, 'plan_grant', 'plan', 't1316:g', '2026-05-01 10:00+01');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key, created_at) values
  ('13160000-0000-4000-a000-000000000003', -1000, 'unlock_all', 'plan', '13160000-0000-4000-b000-000000000001',
   '13160000-0000-4000-a000-000000000001', 160000, 't1316:a', '2026-05-10 12:00+01'),
  ('13160000-0000-4000-a000-000000000003', -1000, 'unlock_all', 'plan', '13160000-0000-4000-b000-000000000002',
   '13160000-0000-4000-a000-000000000002', 160000, 't1316:b', '2026-05-11 12:00+01');

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

-- Both accounts auto-verify (score 95), pause over.
select pg_temp.as_service();
select is(public.submit_bank_account('13160000-0000-4000-a000-000000000001', '058', 'GTBank', '1234',
  '\x00'::bytea, 'OKAFOR ADAEZE', 95) ->> 'status', 'verified', 'A''s account verifies');
select is(public.submit_bank_account('13160000-0000-4000-a000-000000000002', '058', 'GTBank', '5678',
  '\x00'::bytea, 'ADE ADEBAYO', 95) ->> 'status', 'verified', 'B''s account verifies');
select pg_temp.as_owner();
update public.author_bank_accounts set payouts_resume_at = now() - interval '1 hour';

-- Close and prepare May: both lines payable.
select pg_temp.as_user('13160000-0000-4000-a000-000000000005');
select lives_ok($$select public.close_cycle('2026-05-01')$$, 'May closes');
select pg_temp.as_owner();
update public.earning_cycles set closed_at = now() - interval '31 days' where month = '2026-05-01';
select pg_temp.as_user('13160000-0000-4000-a000-000000000004');
select lives_ok($$select public.prepare_cycle((select id from public.earning_cycles where month = '2026-05-01'),
  50000000)$$, 'Finance prepares May');
select pg_temp.as_owner();
select is((select count(*)::int from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2026-05-01' and e.status = 'payable'), 2, 'both lines are payable after prepare');

-- After prepare, A's account is replaced (no verified account left).
update public.author_bank_accounts set status = 'replaced'
where author_id = '13160000-0000-4000-a000-000000000001';

select pg_temp.as_user('13160000-0000-4000-a000-000000000005');
select results_eq($$select (r ->> 'authors')::int, (r ->> 'total_kobo')::bigint, (r ->> 'held_unverified')::int
                    from (select public.release_cycle((select id from public.earning_cycles
                                                       where month = '2026-05-01'),
                                                    pg_temp.stepup('13160000-0000-4000-a000-000000000005', 'release_payout')) r) x$$,
  $$values (1, 160000::bigint, 1)$$, 'release sends B and holds A for a bank account');
select pg_temp.as_owner();
select results_eq($$select e.status::text, e.held_reason from public.author_earnings e
                    join public.earning_cycles c on c.id = e.cycle_id
                    where c.month = '2026-05-01' and e.author_id = '13160000-0000-4000-a000-000000000001'$$,
  $$values ('held_unverified', 'Bank account not verified')$$, 'A''s line is held, not left payable');
select is((select e.status::text from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2026-05-01' and e.author_id = '13160000-0000-4000-a000-000000000002'),
  'queued', 'B''s line is queued');
select is((select count(*)::int from public.payouts
           where author_id = '13160000-0000-4000-a000-000000000001'), 0, 'no transfer for A');
select is((select count(*)::int from public.author_earnings where status = 'payable'), 0,
  'no line is left payable after release');

-- June closes with no new spend for A: the held May line is carried in.
select pg_temp.as_user('13160000-0000-4000-a000-000000000005');
select lives_ok($$select public.close_cycle('2026-06-01')$$, 'June closes');
select pg_temp.as_owner();
select is((select e.carry_in_kobo from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
           where c.month = '2026-06-01' and e.author_id = '13160000-0000-4000-a000-000000000001'),
  160000::bigint, 'the next close carries A''s held amount in');
select isnt((select e.carried_to from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
             where c.month = '2026-05-01' and e.author_id = '13160000-0000-4000-a000-000000000001'),
  null, 'the May line points at the line that carried it');

select * from finish();
rollback;
