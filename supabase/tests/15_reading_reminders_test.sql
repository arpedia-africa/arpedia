-- Flow 15 · 15-18: reading reminders go out at 18:00 in each reader's own time zone, only to
-- readers with an unfinished book who haven't read for 3 days, at most once a week, and name the
-- book they opened last with a tap that opens it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- A zone whose clock reads 18:xx right now, and one that doesn't (whole-hour offsets only).
create temp table tz as
select (select z.name from pg_catalog.pg_timezone_names z
         where extract(minute from z.utc_offset) = 0
           and extract(hour from (now() at time zone 'UTC') + z.utc_offset) = 18
         order by z.name limit 1) as six,
       (select z.name from pg_catalog.pg_timezone_names z
         where extract(minute from z.utc_offset) = 0
           and extract(hour from (now() at time zone 'UTC') + z.utc_offset) <> 18
         order by z.name limit 1) as other;

-- Readers 1–6, author 9.
insert into auth.users (id, email)
select ('15180000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow1518.test'
from unnest(array[1, 2, 3, 4, 5, 6, 9]) n;
insert into public.profiles (id, full_name, is_author)
select ('15180000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 9 from unnest(array[1, 2, 3, 4, 5, 6, 9]) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.notification_preferences (user_id, timezone)
select ('15180000-0000-4000-a000-00000000000' || n)::uuid, case when n = 2 then (select other from tz) else (select six from tz) end
from generate_series(1, 6) n
on conflict (user_id) do update set timezone = excluded.timezone;
insert into public.books (id, author_id, title, status) values
  ('15180000-0000-4000-b000-000000000001', '15180000-0000-4000-a000-000000000009', 'Harmattan Road', 'live'),
  ('15180000-0000-4000-b000-000000000002', '15180000-0000-4000-a000-000000000009', 'Lagos at Dusk', 'live'),
  ('15180000-0000-4000-b000-000000000003', '15180000-0000-4000-a000-000000000009', 'Gone Book', 'taken_down');

-- 1: unfinished, last read 4 days ago (due). 2: same, but not 18:00 where they live.
-- 3: only a finished book. 4: unfinished, read yesterday. 5: due, but reminded 2 days ago.
-- 6: two unfinished books (and a taken-down one opened more recently): the later live one.
insert into public.reading_progress (user_id, book_id, percent, max_percent, finished_at, last_opened_at) values
  ('15180000-0000-4000-a000-000000000001', '15180000-0000-4000-b000-000000000001', 30, 30, null, now() - interval '4 days'),
  ('15180000-0000-4000-a000-000000000002', '15180000-0000-4000-b000-000000000001', 30, 30, null, now() - interval '4 days'),
  ('15180000-0000-4000-a000-000000000003', '15180000-0000-4000-b000-000000000001', 100, 100, now() - interval '5 days', now() - interval '5 days'),
  ('15180000-0000-4000-a000-000000000004', '15180000-0000-4000-b000-000000000001', 30, 30, null, now() - interval '1 day'),
  ('15180000-0000-4000-a000-000000000005', '15180000-0000-4000-b000-000000000001', 30, 30, null, now() - interval '4 days'),
  ('15180000-0000-4000-a000-000000000006', '15180000-0000-4000-b000-000000000001', 10, 10, null, now() - interval '9 days'),
  ('15180000-0000-4000-a000-000000000006', '15180000-0000-4000-b000-000000000002', 20, 20, null, now() - interval '5 days'),
  ('15180000-0000-4000-a000-000000000006', '15180000-0000-4000-b000-000000000003', 20, 20, null, now() - interval '4 days');
insert into public.push_log (user_id, type, category, status, created_at) values
  ('15180000-0000-4000-a000-000000000005', 'reading_reminder', 'reminders', 'delivered', now() - interval '2 days');

create function pg_temp.reminded() returns setof jsonb
language sql as $$
  select q.message from pgmq.q_push_fanout q
  where q.message ->> 'type' = 'reading_reminder' and q.message -> 'user_ids' ->> 0 like '15180000-%'
  order by q.message -> 'user_ids' ->> 0
$$;

select isnt((select six from tz), null, 'a time zone reads 18:00 now');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"15180000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.enqueue_reading_reminders() $$, '42501', null, 'readers cannot run the job');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(public.enqueue_reading_reminders() >= 2, 'the job queues reminders');
select is(array(select m -> 'user_ids' ->> 0 from pg_temp.reminded() m),
  array['15180000-0000-4000-a000-000000000001', '15180000-0000-4000-a000-000000000006'],
  'only readers at 18:00 locally, with an unfinished book, 3 days away and not reminded this week');
select is((select m #>> '{data,vars,book_title}' from pg_temp.reminded() m limit 1), 'Harmattan Road',
  'the push names the book');
select is((select m #> '{data,target}' from pg_temp.reminded() m limit 1),
  '{"kind": "book", "id": "15180000-0000-4000-b000-000000000001"}'::jsonb, 'a tap opens the book');
select is((select m #>> '{data,vars,book_title}' from pg_temp.reminded() m offset 1), 'Lagos at Dusk',
  'the unfinished live book opened last (a taken-down one is skipped)');
select is((select m #>> '{data,book_id}' from pg_temp.reminded() m offset 1), '15180000-0000-4000-b000-000000000002',
  'book id passed on');

-- A reading session yesterday counts as reading, even when the progress row is older.
delete from pgmq.q_push_fanout where message ->> 'type' = 'reading_reminder';
insert into public.reading_sessions (client_id, user_id, book_id, started_at, ended_at, active_seconds) values
  (gen_random_uuid(), '15180000-0000-4000-a000-000000000001', '15180000-0000-4000-b000-000000000001',
   now() - interval '1 day', now() - interval '1 day' + interval '10 minutes', 600);
select public.enqueue_reading_reminders();
select is(array(select m -> 'user_ids' ->> 0 from pg_temp.reminded() m),
  array['15180000-0000-4000-a000-000000000006'], 'a recent reading session holds the reminder back');

select * from finish();
rollback;
