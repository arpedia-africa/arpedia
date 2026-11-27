-- Flow 13 · spec check 13-5: gift-loop detection follows the setting, raises one alert per pair,
-- and Freeze gifting on the alert keeps the loop's credits out of earnings (Finance only).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.as_staff(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create function pg_temp.alert() returns public.credit_alerts language sql as $$
  select * from public.credit_alerts where kind = 'gift_loop'
    and detail ->> 'pair' = '13900000-0000-4000-a000-000000000001:13900000-0000-4000-a000-000000000002'
$$;

-- 1 and 2 authors who gift each other's books, 3 an author who gifts one way, 4 finance, 5 support.
insert into auth.users (id, email)
select ('13900000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t13g.local' from generate_series(1, 5) n;
insert into public.profiles (id, full_name, is_author)
select ('13900000-0000-4000-a000-00000000000' || n)::uuid, 'Gifter ' || n, n <= 3 from generate_series(1, 5) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.staff_roles (user_id, role) values
  ('13900000-0000-4000-a000-000000000004', 'finance'), ('13900000-0000-4000-a000-000000000005', 'support');
insert into public.books (id, author_id, title, status) values
  ('13900000-0000-4000-b000-000000000001', '13900000-0000-4000-a000-000000000001', 'One', 'live'),
  ('13900000-0000-4000-b000-000000000002', '13900000-0000-4000-a000-000000000002', 'Two', 'live');
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key)
select ('13900000-0000-4000-a000-00000000000' || n)::uuid, 500, 'top_up', 'topup', 't13g:t' || n
from generate_series(1, 3) n;
insert into public.credit_ledger (user_id, delta, reason, bucket, book_id, author_id, author_earning_kobo,
                                  idempotency_key) values
  ('13900000-0000-4000-a000-000000000001', -40, 'gift_out', 'topup', '13900000-0000-4000-b000-000000000002',
   '13900000-0000-4000-a000-000000000002', 6400, 't13g:a'),
  ('13900000-0000-4000-a000-000000000002', -40, 'gift_out', 'topup', '13900000-0000-4000-b000-000000000001',
   '13900000-0000-4000-a000-000000000001', 6400, 't13g:b'),
  ('13900000-0000-4000-a000-000000000003', -40, 'gift_out', 'topup', '13900000-0000-4000-b000-000000000001',
   '13900000-0000-4000-a000-000000000001', 6400, 't13g:c');

-- ─── Setting off: nothing detected ──────────────────────────────────────────
insert into public.earning_settings (hold_days, min_payout_kobo, payout_day, gift_loop_detection, note)
values (30, 100000, 15, false, 'test off');
select public.job_gift_loop_detect();
select is((pg_temp.alert()).id, null, 'detection off: no alert');

-- ─── Setting on ─────────────────────────────────────────────────────────────
insert into public.earning_settings (hold_days, min_payout_kobo, payout_day, gift_loop_detection, note)
values (30, 100000, 15, true, 'test on');
select public.job_gift_loop_detect();
select isnt((pg_temp.alert()).id, null, 'two authors gifting each other''s books raise a gift-loop alert');
select is(jsonb_array_length((pg_temp.alert()).detail -> 'ledger_ids'), 2, 'the alert lists both gifts');
select is(((pg_temp.alert()).detail ->> 'credits')::int, 80, 'and their credits');
select ok(not exists (select 1 from public.credit_alerts where kind = 'gift_loop'
                      and user_id = '13900000-0000-4000-a000-000000000003'), 'a one-way gift is not a loop');
select public.job_gift_loop_detect();
select is((select count(*)::int from public.credit_alerts where kind = 'gift_loop'
           and detail ->> 'pair' = (pg_temp.alert()).detail ->> 'pair'), 1, 'running again keeps one alert per pair');

-- ─── Freeze gifting on the alert ────────────────────────────────────────────
select set_config('t.alert', (pg_temp.alert()).id::text, true);
select pg_temp.as_staff('13900000-0000-4000-a000-000000000005');
select throws_ok($$ select public.exclude_gift_loop_alert(current_setting('t.alert')::bigint) $$,
  '42501', null, 'Support cannot keep credits out of earnings');
select pg_temp.as_staff('13900000-0000-4000-a000-000000000004');
select is(public.exclude_gift_loop_alert(current_setting('t.alert')::bigint, 'Swapping gifts'), 2,
  'Finance keeps both gifts out of earnings');
select is(public.exclude_gift_loop_alert(current_setting('t.alert')::bigint), 0, 'a closed alert does nothing twice');

select pg_temp.as_owner();
select is((select count(*)::int from public.earning_exclusions x join public.credit_ledger l on l.id = x.ledger_id
           where x.reason = 'gift_loop' and l.idempotency_key in ('t13g:a', 't13g:b', 't13g:c')), 2,
  'only the loop''s gifts are excluded');
select public.job_gift_loop_detect();
select is((select count(*)::int from public.credit_alerts where kind = 'gift_loop' and resolved_at is null
           and detail ->> 'pair' like '13900000-%'), 0, 'excluded gifts do not raise the alert again');

select * from finish();
rollback;
