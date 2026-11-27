-- Flow 11 · 11-5 and 13-13: Studio reads the flow 13 settings, the author rate, the real bank account
-- state and the author's payout lines instead of hard-coded values.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- 1 author, 2 reader.
insert into auth.users (id, email)
select ('11500000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'u' || n || '@flow115.test'
from generate_series(1, 2) n;
insert into public.profiles (id, full_name, is_author)
select ('11500000-0000-4000-a000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'User ' || n, n = 1
from generate_series(1, 2) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.author_profiles (user_id, pen_name, legal_name, approved_at) values
  ('11500000-0000-4000-a000-000000000001', 'Ada', 'Adaeze Okafor', '2026-05-02 10:00+01');
insert into public.books (id, author_id, title, status) values
  ('11500000-0000-4000-b000-000000000001', '11500000-0000-4000-a000-000000000001', 'A book', 'live');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key, created_at) values
  ('11500000-0000-4000-a000-000000000002', 5000, 'plan_grant', 'plan', 't115:g', '2026-06-01 10:00+01');
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key, created_at) values
  ('11500000-0000-4000-a000-000000000002', -1500, 'unlock_all', 'plan', '11500000-0000-4000-b000-000000000001',
   '11500000-0000-4000-a000-000000000001', 240000, 't115:a', '2026-06-10 12:00+01');

-- Finance changed the settings: 20-day hold, paid on the 10th, ₦2,000 minimum.
insert into public.earning_settings (hold_days, min_payout_kobo, payout_day, note)
values (20, 200000, 10, 'test');

create function pg_temp.as_author() returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"11500000-0000-4000-a000-000000000001","role":"authenticated"}', true);
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
grant execute on function pg_temp.as_author(), pg_temp.as_service(), pg_temp.as_owner()
  to authenticated, service_role;

-- Expected values worked out as the owner (the helpers are not granted to authors).
create temp table expect as
select (public._rules() ->> 'author_rate_kobo')::int as rate,
       public._payout_date(public._cycle_end(date_trunc('month', now() at time zone 'Africa/Lagos')::date),
                           20, 10) as open_date;
grant select on expect to authenticated, service_role;

-- No account yet; settings and the author rate come from the server.
select pg_temp.as_author();
select is(public.studio_home() ->> 'payout_account_status', 'not_set', 'no bank account: not set');
select is((public.studio_home() ->> 'min_payout_kobo')::bigint, 200000::bigint, 'home minimum follows settings');
select is((public.studio_earnings() ->> 'min_payout_kobo')::bigint, 200000::bigint,
  'earnings minimum follows settings');
select is((public.studio_earnings() ->> 'kobo_per_credit')::int,
  (select rate from expect), 'kobo per credit is the author rate');
select results_eq($$select (h ->> 'hold_days')::int, (h ->> 'payout_day')::int
                    from (select public.studio_home() h) x$$,
  $$values (20, 10)$$, 'home has the hold and payout day');

-- An open month shows the date the settings give it, like admin.
select is((select (m -> 'payout' ->> 'payout_date')::date
           from jsonb_array_elements(public.studio_earnings() -> 'history') m
           where m ->> 'month' = to_char(now() at time zone 'Africa/Lagos', 'YYYY-MM')),
  (select open_date from expect), 'an open month has its projected payout date');
select is(public.studio_home() -> 'next_payout', 'null'::jsonb, 'nothing closed yet: no next payout');

-- An account in review is pending.
select pg_temp.as_service();
select is(public.submit_bank_account('11500000-0000-4000-a000-000000000001', '058', 'GTBank', '1234',
  '\x00'::bytea, 'OKAFOR ADAEZE', 70) ->> 'status', 'needs_review', 'a low match waits for review');
select pg_temp.as_author();
select is(public.studio_home() ->> 'payout_account_status', 'pending', 'account in review: pending');

-- A verified account, then June closes: the line is payable on the cycle's date.
select pg_temp.as_service();
select is(public.submit_bank_account('11500000-0000-4000-a000-000000000001', '058', 'GTBank', '1234',
  '\x00'::bytea, 'OKAFOR ADAEZE', 95) ->> 'status', 'verified', 'a high match verifies');
select lives_ok($$select public.close_cycle('2026-06-01')$$, 'June closes');
select pg_temp.as_owner();
create temp table june as select payout_date from public.earning_cycles where month = '2026-06-01';
grant select on june to authenticated;
select pg_temp.as_author();
select is(public.studio_home() ->> 'payout_account_status', 'verified', 'verified account');
select is((select m -> 'payout' from jsonb_array_elements(public.studio_earnings() -> 'history') m
           where m ->> 'month' = '2026-06'),
  jsonb_build_object('payout_date', (select payout_date from june),
                     'closed', true, 'status', 'payable', 'payable_kobo', 240000, 'carried', false,
                     'paid_at', null),
  'June shows the real line and its payout date');
select is(public.studio_home() -> 'next_payout',
  jsonb_build_object('month', '2026-06', 'payout_date',
                     (select payout_date from june),
                     'kobo', 240000, 'status', 'payable'),
  'next payout is the payable June line');

select * from finish();
rollback;
