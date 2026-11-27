-- Flow 15 fix 15-23 (rule 26): Growth retention by sign-up week, churn by plan with the main
-- reason, and promo conversions. Staff with view_analytics only; groups under 5 come back null.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Readers 01–08 sign up on the Monday 5 weeks before last week's Monday; 09 is the staff member.
create function pg_temp.wk() returns date language sql as $$
  select date_trunc('week', (now() at time zone 'Africa/Lagos')::date - 1)::date - 35
$$;
create function pg_temp.at(d date) returns timestamptz language sql as $$
  select (d + time '12:00') at time zone 'Africa/Lagos'
$$;
insert into auth.users (id, email, created_at)
select ('15230000-0000-4000-a000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'gr' || i || '@test.local',
       pg_temp.at(pg_temp.wk())
from generate_series(1, 9) i;
insert into public.profiles (id, full_name, created_at)
select id, 'Growth ' || right(id::text, 2), created_at from auth.users where email like 'gr_@test.local'
  on conflict (id) do update set full_name = excluded.full_name, created_at = excluded.created_at;
insert into public.staff_roles (user_id, role) values ('15230000-0000-4000-a000-000000000009', 'super_admin');

-- Other sign-ups in that week are not this test's.
update public.profiles set created_at = created_at - interval '400 days'
  where id::text not like '15230000-%' and (created_at at time zone 'Africa/Lagos')::date
        between pg_temp.wk() - 60 and pg_temp.wk() + 60;
delete from public.reading_sessions;

-- Back on day 1: 01–06; day 7: 01–05; day 30: 01–02. A 10-second session doesn't count (07, day 1).
insert into public.reading_sessions (client_id, user_id, book_id, started_at, ended_at, active_seconds)
select gen_random_uuid(), u.id, (select id from public.books limit 1), pg_temp.at(pg_temp.wk() + v.day),
       pg_temp.at(pg_temp.wk() + v.day) + interval '2 minutes', case when v.n = '07' then 10 else 120 end
from auth.users u join (values ('01', 1), ('02', 1), ('03', 1), ('04', 1), ('05', 1), ('06', 1), ('07', 1),
                               ('01', 7), ('02', 7), ('03', 7), ('04', 7), ('05', 7),
                               ('01', 30), ('02', 30)) v (n, day)
  on right(u.id::text, 2) = v.n and u.email like 'gr_@test.local';

-- Subscriptions: 6 monthly live 40 days ago; in the last 30 days 03 expired after a billing issue,
-- 04 and 05 expired (chose not to renew), 06 was refunded.
-- Other subscriptions start today, so neither 30-day window counts them.
update public.subscriptions set created_at = now() where user_id::text not like '15230000-%';
insert into public.subscriptions (user_id, plan_code, status, period_start, period_end, created_at, ended_at, store)
select u.id, 'monthly', v.st, now() - interval '40 days', now() - interval '10 days', now() - interval '40 days',
       case when v.st in ('expired', 'refunded') then now() - interval '10 days' end, 'play'
from auth.users u join (values ('01', 'active'), ('02', 'active'), ('03', 'expired'), ('04', 'expired'),
                               ('05', 'expired'), ('06', 'refunded')) v (n, st)
  on right(u.id::text, 2) = v.n and u.email like 'gr_@test.local';
insert into public.payment_events (provider, event_id, event_type, occurred_at, payload, normalized) values
  ('revenuecat', 'gr-billing-03', 'BILLING_ISSUE', now() - interval '15 days', '{}',
   '{"type": "billing_issue", "user_id": "15230000-0000-4000-a000-000000000003"}');

-- Promo GROW5: 01–05 redeem yesterday; 01 and 02 then pay.
insert into public.promo_codes (code, kind, amount, max_uses, status) values ('grow5', 'bonus_credits', 50, 100, 'active');
insert into public.promo_redemptions (code, user_id, redeemed_at)
select 'grow5', id, now() - interval '1 day' from auth.users
  where email in ('gr1@test.local', 'gr2@test.local', 'gr3@test.local', 'gr4@test.local', 'gr5@test.local');
insert into public.transactions (user_id, kind, topup_code, store, store_txn_id, gross_kobo, status, created_at)
select id, 'topup', 'topup_200', 'web', 'gr-' || right(id::text, 2), 60000, 'succeeded', now() - interval '1 hour'
from auth.users where email in ('gr1@test.local', 'gr2@test.local');

create function pg_temp.as_staff() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', '15230000-0000-4000-a000-000000000009', 'role', 'authenticated',
    'session_id', '15230000-0000-4000-f000-000000000009', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_staff(), pg_temp.wk() to authenticated;
create table pg_temp.r (j jsonb);
grant all on pg_temp.r to authenticated;
set local role authenticated;
select pg_temp.as_staff();
insert into pg_temp.r
select public.staff_analytics_growth((now() at time zone 'Africa/Lagos')::date - 29, (now() at time zone 'Africa/Lagos')::date - 1);
reset role;

select is((select jsonb_array_length(j -> 'cohorts') from pg_temp.r), 6, 'six sign-up weeks');
select is((select j -> 'cohorts' -> 0 from pg_temp.r),
  jsonb_build_object('week', pg_temp.wk(), 'size', 8, 'd1', 6, 'd7', 5, 'd30', 2),
  'the oldest week: 8 readers (staff left out), back on day 1, 7 and 30 (30-second sessions only)');
select is((select (j -> 'cohorts' -> 5 ->> 'size')::int from pg_temp.r), 0, 'an empty week counts 0');
select is((select j -> 'churn' -> 'rate' from pg_temp.r), '66.7'::jsonb, 'monthly churn: 4 of 6 left');
select is((select j -> 'churn' -> 'plans' -> 0 from pg_temp.r),
  '{"plan": "Monthly", "subscribers": 6, "left": 4, "rate": 66.7, "reason": "Chose not to renew"}'::jsonb,
  'churn by plan with the main reason');
select is((select j -> 'promos' -> 0 from pg_temp.r),
  '{"code": "GROW5", "kind": "bonus_credits", "amount": 50, "started": 5, "paid": 2, "rate": 40.0}'::jsonb,
  'promo conversion: 2 of 5 paid after redeeming');

-- Under 5: hidden.
delete from public.promo_redemptions where user_id = '15230000-0000-4000-a000-000000000005';
delete from public.subscriptions where user_id = '15230000-0000-4000-a000-000000000002';
set local role authenticated;
select pg_temp.as_staff();
select is(public.staff_analytics_growth(current_date - 29, current_date - 1) -> 'promos' -> 0 -> 'paid', 'null'::jsonb,
  'a code redeemed by fewer than 5 readers shows no conversion');
select is(public.staff_analytics_growth(current_date - 29, current_date - 1) -> 'churn' -> 'plans' -> 0 -> 'rate', '80.0'::jsonb,
  'churn still shows at 5 subscribers');
reset role;

create function pg_temp.as_reader() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', '15230000-0000-4000-a000-000000000001',
    'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_reader() to authenticated;
select pg_temp.as_reader();
set local role authenticated;
select throws_ok($$select public.staff_analytics_growth(current_date - 7, current_date)$$, '42501', null,
  'a reader cannot see growth analytics');
reset role;

select * from finish();
rollback;
