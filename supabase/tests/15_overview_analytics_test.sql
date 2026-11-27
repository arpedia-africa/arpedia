-- Flow 15 fix 15-22 (rule 25): the Analytics Overview numbers. The rollup runs again (it read a
-- column that does not exist), and fills monthly readers, books started and finished; top books
-- carry readers, finished % and rating; preview to unlock is split by book length.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email)
select ('15220000-0000-4000-a000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'ov' || i || '@test.local'
from generate_series(1, 7) i;
insert into public.profiles (id, full_name)
select id, 'Overview ' || right(id::text, 2) from auth.users where email like 'ov_@test.local'
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values ('15220000-0000-4000-a000-000000000007', 'super_admin');

-- A live, priced 120-page book by reader 07's author profile.
insert into public.books (id, author_id, title) values
  ('15220000-0000-4000-c000-000000000001', '15220000-0000-4000-a000-000000000007', 'Overview Book');
insert into public.book_revisions (id, book_id, revision_no, words, pages, price_credits, free_through_ord) values
  ('15220000-0000-4000-d000-000000000001', '15220000-0000-4000-c000-000000000001', 1, 30000, 120, 60, 0);
update public.books set status = 'live', current_revision_id = '15220000-0000-4000-d000-000000000001'
  where id = '15220000-0000-4000-c000-000000000001';
insert into public.book_rating_stats (book_id, avg, count) values ('15220000-0000-4000-c000-000000000001', 4.67, 3)
  on conflict (book_id) do update set avg = excluded.avg, count = excluded.count;

-- Only this test's reading counts.
delete from public.reading_sessions;
delete from public.reading_progress;
delete from public.analytics_daily;

-- Yesterday at noon, Lagos time.
create function pg_temp.d() returns date language sql as $$ select (now() at time zone 'Africa/Lagos')::date - 1 $$;
create function pg_temp.noon(days int default 0) returns timestamptz language sql as $$
  select ((pg_temp.d() - days) + time '12:00') at time zone 'Africa/Lagos'
$$;

-- Readers 01–06 read 2 minutes yesterday; 06 first read it 20 days ago; 01 also had a 10-second session.
insert into public.reading_sessions (client_id, user_id, book_id, started_at, ended_at, active_seconds)
select gen_random_uuid(), u.id, '15220000-0000-4000-c000-000000000001', pg_temp.noon(), pg_temp.noon() + interval '2 minutes', 120
from auth.users u where u.email like 'ov_@test.local' and u.email <> 'ov7@test.local';
insert into public.reading_sessions (client_id, user_id, book_id, started_at, ended_at, active_seconds) values
  (gen_random_uuid(), '15220000-0000-4000-a000-000000000006', '15220000-0000-4000-c000-000000000001',
   pg_temp.noon(20), pg_temp.noon(20) + interval '2 minutes', 120),
  (gen_random_uuid(), '15220000-0000-4000-a000-000000000001', '15220000-0000-4000-c000-000000000001',
   pg_temp.noon(2), pg_temp.noon(2) + interval '10 seconds', 10);
-- 01 and 02 finished yesterday; the rest are halfway. 01–03 unlocked it.
insert into public.reading_progress (user_id, book_id, percent, max_percent, finished_at, last_opened_at)
select u.id, '15220000-0000-4000-c000-000000000001',
       case when right(u.id::text, 2) in ('01', '02') then 100 else 50 end,
       case when right(u.id::text, 2) in ('01', '02') then 100 else 50 end,
       case when right(u.id::text, 2) in ('01', '02') then pg_temp.noon() end, pg_temp.noon()
from auth.users u where u.email like 'ov_@test.local' and u.email <> 'ov7@test.local';
insert into public.entitlements (user_id, book_id, scope, source)
select ('15220000-0000-4000-a000-0000000000' || lpad(i::text, 2, '0'))::uuid, '15220000-0000-4000-c000-000000000001',
       'book', 'unlock_all'
from generate_series(1, 3) i;

select lives_ok($$select public.analytics_rollup(pg_temp.d() - 25, pg_temp.d())$$, 'the rollup runs');
select results_eq($$select metric, value from public.analytics_daily
                    where day = pg_temp.d() and metric in ('dau', 'mau', 'books_started', 'books_finished', 'sessions')
                    order by metric$$,
  $$values ('books_finished', 2::numeric), ('books_started', 5::numeric), ('dau', 6::numeric),
           ('mau', 6::numeric), ('sessions', 6::numeric)$$,
  'daily readers, monthly readers, books started (first read) and finished for yesterday');
select is((select value from public.analytics_daily where day = pg_temp.d() - 20 and metric = 'mau'), 1::numeric,
  'monthly readers 20 days ago: the one reader who read then');
select is((select value from public.analytics_daily where day = pg_temp.d() and metric = 'reading_hours'), 0.2::numeric,
  'reading hours come from active seconds');

create function pg_temp.as_staff() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', '15220000-0000-4000-a000-000000000007', 'role', 'authenticated',
    'session_id', '15220000-0000-4000-f000-000000000007', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_staff(), pg_temp.d(), pg_temp.noon(int) to authenticated;
create table pg_temp.r (j jsonb);
grant all on pg_temp.r to authenticated;
set local role authenticated;
select pg_temp.as_staff();
insert into pg_temp.r select public.staff_analytics_books(pg_temp.d(), pg_temp.d() + 1, 50);
reset role;

select is((select x - 'id' - 'title' - 'author' - 'genre' - 'hours' - 'unlocks'
           from pg_temp.r, jsonb_array_elements(j -> 'top') x where x ->> 'id' = '15220000-0000-4000-c000-000000000001'),
  '{"readers": 6, "finished_pct": 33.3, "rating": 4.7}'::jsonb, 'top book: readers, finished %, rating');
select is((select (j -> 'preview_unlock' ->> 'share')::numeric from pg_temp.r), 50.0,
  'half the readers who reached the end of the preview unlocked');
select is((select j -> 'preview_unlock' -> 'bands' -> 0 from pg_temp.r),
  '{"label": "Under 150 pages", "share": 50.0}'::jsonb, 'by book length: under 150 pages');
select is((select j -> 'preview_unlock' -> 'bands' -> 1 ->> 'share' from pg_temp.r), null,
  'a band with fewer than 5 readers shows no share');

-- Fewer than 5 readers: no readers count or finished %.
delete from public.reading_progress where user_id <> '15220000-0000-4000-a000-000000000001';
delete from public.reading_sessions where user_id <> '15220000-0000-4000-a000-000000000001';
set local role authenticated;
select pg_temp.as_staff();
select is((select x -> 'readers' from jsonb_array_elements(public.staff_analytics_books(pg_temp.d(), pg_temp.d() + 1, 50) -> 'top') x
           where x ->> 'id' = '15220000-0000-4000-c000-000000000001'), 'null'::jsonb,
  'a book with fewer than 5 readers shows no reader count');
reset role;

select * from finish();
rollback;
