-- Flow 15 · Insights: onboarding funnel (groups under 5 hidden), per-book hours and genre share,
-- staff-only access with view_analytics.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Seven readers who signed up on 2 Jan 2020 (a day nothing else uses), at different onboarding steps.
insert into auth.users (id, email)
select ('15100000-0000-4000-a000-00000000000' || i)::uuid, 'f' || i || '@test.local' from generate_series(1, 7) i;
insert into auth.users (id, email) values
  ('15100000-0000-4000-a000-000000000010', 'an15@arpedia.africa'),
  ('15100000-0000-4000-a000-000000000011', 'au15@test.local');
insert into public.profiles (id, full_name, created_at, onboarding_step)
select ('15100000-0000-4000-a000-00000000000' || i)::uuid, 'Reader ' || i, '2020-01-02 10:00+01',
       (array['signup', 'interests', 'role', 'plans', 'plans', 'done', 'done'])[i]
from generate_series(1, 7) i
on conflict (id) do update set created_at = excluded.created_at, onboarding_step = excluded.onboarding_step;
insert into public.profiles (id, full_name) values
  ('15100000-0000-4000-a000-000000000010', 'Analyst 15'),
  ('15100000-0000-4000-a000-000000000011', 'Author Fifteen')
on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values ('15100000-0000-4000-a000-000000000010', 'analyst');

insert into public.books (id, author_id, title, genres, status) values
  ('15100000-0000-4000-b000-000000000001', '15100000-0000-4000-a000-000000000011', 'Insight One', '{Fiction}', 'live'),
  ('15100000-0000-4000-b000-000000000002', '15100000-0000-4000-a000-000000000011', 'Insight Two', '{Poetry}', 'live');
insert into public.analytics_daily (day, metric, dim, value) values
  ('2020-01-02', 'book_hours', '{"book_id": "15100000-0000-4000-b000-000000000001"}', 30),
  ('2020-01-03', 'book_hours', '{"book_id": "15100000-0000-4000-b000-000000000001"}', 45),
  ('2020-01-02', 'book_hours', '{"book_id": "15100000-0000-4000-b000-000000000002"}', 25);

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '15100000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

set local role authenticated;
select pg_temp.as_user('15100000-0000-4000-a000-000000000001');
select throws_ok($$select public.staff_analytics_funnel('2020-01-01', '2020-01-31')$$, '42501', null,
  'readers cannot read the funnel');
select throws_ok($$select public.staff_analytics_books('2020-01-01', '2020-01-31')$$, '42501', null,
  'readers cannot read book analytics');

select pg_temp.as_user('15100000-0000-4000-a000-000000000010');
select is(public.staff_analytics_funnel('2020-01-01', '2020-01-31') -> 'signed_up', '7'::jsonb, 'seven signed up');
select is(public.staff_analytics_funnel('2020-01-01', '2020-01-31') -> 'interests', '5'::jsonb,
  'five got past interests');
select is(public.staff_analytics_funnel('2020-01-01', '2020-01-31') -> 'plans', 'null'::jsonb, 'four reached the plans: fewer than 5, not shown');
select throws_ok($$select public.staff_analytics_funnel('2020-01-01', '2021-06-30')$$, '22023', null,
  'a period over 400 days is refused');

select is(public.staff_analytics_books('2020-01-01', '2020-01-31') #>> '{top,0,title}', 'Insight One',
  'the book with the most hours comes first');
select is(public.staff_analytics_books('2020-01-01', '2020-01-31') #>> '{top,0,hours}', '75',
  'hours add up over the period');
select is(public.staff_analytics_books('2020-01-01', '2020-01-31') #>> '{genres,0,share}', '75.0',
  'Fiction holds 75% of reading time');

select * from finish();
rollback;
