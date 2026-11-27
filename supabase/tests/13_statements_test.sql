-- Flow 13 · 13-7 and 13-8: statements. statements_due lists lines of released cycles without a
-- statement, statement_source returns what the PDF shows, record_statement is safe to repeat, and
-- statement_download_key lets Finance and Support in, and the author only once their line is paid.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

set local session_replication_role = replica;
delete from public.author_statements;
delete from public.payout_events;
delete from public.payouts;
delete from public.payout_runs;
delete from public.author_earnings;
delete from public.earning_exclusions;
delete from public.earning_cycles;
delete from public.author_bank_accounts;
delete from public.credit_ledger where idempotency_key like 'seed13:%';
set local session_replication_role = origin;

-- 1 author A, 2 author B, 3 reader, 4 finance, 5 support, 6 publisher.
insert into auth.users (id, email)
select ('13070000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@flow137.test'
from generate_series(1, 6) n;
insert into public.profiles (id, full_name, is_author)
select ('13070000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'User ' || n, n <= 2
from generate_series(1, 6) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.author_profiles (user_id, pen_name, legal_name) values
  ('13070000-0000-4000-a000-000000000001', 'Ada', 'Adaeze Okafor'),
  ('13070000-0000-4000-a000-000000000002', 'Bayo', 'Adebayo Ade');
insert into public.staff_roles (user_id, role) values
  ('13070000-0000-4000-a000-000000000004', 'finance'),
  ('13070000-0000-4000-a000-000000000005', 'support'),
  ('13070000-0000-4000-a000-000000000006', 'publisher');
insert into public.books (id, author_id, title, status) values
  ('13070000-0000-4000-b000-000000000001', '13070000-0000-4000-a000-000000000001', 'The River', 'live'),
  ('13070000-0000-4000-b000-000000000002', '13070000-0000-4000-a000-000000000002', 'B book', 'live');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('13070000-0000-4000-a000-000000000003', 5000, 'plan_grant', 'plan', 't137:g', '2026-05-01 10:00+01');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key, created_at) values
  ('13070000-0000-4000-a000-000000000003', -1000, 'unlock_all', 'plan', '13070000-0000-4000-b000-000000000001',
   '13070000-0000-4000-a000-000000000001', 160000, 't137:a', '2026-05-10 12:00+01'),
  ('13070000-0000-4000-a000-000000000003', -50, 'tip', 'plan', '13070000-0000-4000-b000-000000000001',
   '13070000-0000-4000-a000-000000000001', 8000, 't137:tip', '2026-05-11 12:00+01'),
  ('13070000-0000-4000-a000-000000000003', -100, 'chapter', 'plan', '13070000-0000-4000-b000-000000000002',
   '13070000-0000-4000-a000-000000000002', 16000, 't137:b', '2026-05-12 12:00+01');

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
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

-- May closes: A payable (₦1,680), B carried (below the minimum).
select pg_temp.as_service();
select lives_ok($$select public.close_cycle('2026-05-01')$$, 'May closes');
select is((select count(*)::int from public.statements_due()), 0, 'an unreleased cycle has no statements due');

-- The run is done (paid): both lines are due.
select pg_temp.as_owner();
update public.earning_cycles set status = 'paid' where month = '2026-05-01';
update public.author_earnings set status = 'paid' where author_id = '13070000-0000-4000-a000-000000000001';
create temp table ids as select id as cycle_id from public.earning_cycles where month = '2026-05-01';
grant select on ids to authenticated, service_role;
select pg_temp.as_service();
select is((select count(*)::int from public.statements_due()), 2, 'a paid cycle has a statement due per author');

select results_eq($$select s ->> 'month', s ->> 'pen_name', (s ->> 'rate_kobo')::int, (s ->> 'tips_kobo')::bigint,
                           (s ->> 'amount_kobo')::bigint, s ->> 'status'
                    from (select public.statement_source('13070000-0000-4000-a000-000000000001',
                                                         (select cycle_id from ids)) s) x$$,
  $$values ('2026-05', 'Ada', 160, 8000::bigint, 168000::bigint, 'paid')$$, 'the source has the month, rate and totals');
select is(public.statement_source('13070000-0000-4000-a000-000000000001', (select cycle_id from ids)) -> 'books',
  '[{"title": "The River", "credits": 1000, "kobo": 160000}]'::jsonb, 'credits by book leave tips out');
select is(public.statement_source('13070000-0000-4000-a000-000000000003', (select cycle_id from ids)), null,
  'no line, no source');

select lives_ok($$select public.record_statement('13070000-0000-4000-a000-000000000001',
  (select cycle_id from ids), 'cycle', 'statements/a/c.pdf')$$, 'A''s statement is recorded');
select is(public.record_statement('13070000-0000-4000-a000-000000000001', (select cycle_id from ids), 'cycle',
  'statements/a/c.pdf'), (select id from public.author_statements
                          where author_id = '13070000-0000-4000-a000-000000000001'),
  'recording it again returns the same row');
select lives_ok($$select public.record_statement('13070000-0000-4000-a000-000000000002',
  (select cycle_id from ids), 'cycle', 'statements/b/c.pdf')$$, 'B''s statement is recorded');
select is((select count(*)::int from public.statements_due()), 0, 'nothing left due');

select pg_temp.as_owner();
create temp table st as
select (select id from public.author_statements where author_id = '13070000-0000-4000-a000-000000000001') as a_id,
       (select id from public.author_statements where author_id = '13070000-0000-4000-a000-000000000002') as b_id;
grant select on st to authenticated;

-- Downloads.
select pg_temp.as_user('13070000-0000-4000-a000-000000000004');
select is(public.statement_download_key((select b_id from st)), 'statements/b/c.pdf', 'Finance downloads any statement');
select pg_temp.as_user('13070000-0000-4000-a000-000000000005');
select is(public.statement_download_key((select a_id from st)), 'statements/a/c.pdf', 'Support downloads too');
select pg_temp.as_user('13070000-0000-4000-a000-000000000006');
select throws_ok($$select public.statement_download_key((select a_id from st))$$, '42501', null,
  'a Publisher cannot');
select pg_temp.as_user('13070000-0000-4000-a000-000000000001');
select is(public.statement_download_key((select a_id from st)), 'statements/a/c.pdf',
  'the author downloads their own paid statement');
select throws_ok($$select public.statement_download_key((select b_id from st))$$, '42501', null,
  'an author cannot read another author''s statement');
select is((select count(*)::int from public.my_statements()), 1, 'the author lists their paid statement');
select pg_temp.as_user('13070000-0000-4000-a000-000000000002');
select throws_ok($$select public.statement_download_key((select b_id from st))$$, '42501', null,
  'an unpaid (carried) line''s statement waits until paid');
select is(public.can_request_statement('13070000-0000-4000-a000-000000000001'), false,
  'an author cannot ask for another author''s year to date');

select * from finish();
rollback;
