-- Flow 15 fix 15-24 (rule 27): the Analytics Reading tab. Pages per session and offline share
-- from sessions, highlights and discussions, how far readers get, per book, most discussed
-- paragraphs and reading rooms; groups under 5 readers come back null.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email)
select ('15240000-0000-4000-a000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'rd' || i || '@test.local'
from generate_series(1, 7) i;
insert into public.profiles (id, full_name)
select id, 'Reading ' || right(id::text, 2) from auth.users where email like 'rd_@test.local'
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values ('15240000-0000-4000-a000-000000000007', 'super_admin');

-- A live 120-page book by 07, with a paragraph p9 in chapter index 2.
insert into public.books (id, author_id, title) values
  ('15240000-0000-4000-c000-000000000001', '15240000-0000-4000-a000-000000000007', 'Reading Book');
insert into public.book_revisions (id, book_id, revision_no, words, pages, price_credits, free_through_ord) values
  ('15240000-0000-4000-d000-000000000001', '15240000-0000-4000-c000-000000000001', 1, 30000, 120, 60, 0);
update public.books set status = 'live', current_revision_id = '15240000-0000-4000-d000-000000000001'
  where id = '15240000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title) values
  ('15240000-0000-4000-d000-000000000001', '15240000-0000-4000-e000-000000000001', 2, 'Three');
insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint) values
  ('15240000-0000-4000-d000-000000000001', 'p9', '15240000-0000-4000-e000-000000000001', 9, 'fp9');

-- Only this test's rows count.
delete from public.reading_sessions;
delete from public.reading_progress;
delete from public.passage_comment_reactions;
delete from public.passage_comments;
update public.annotations set deleted_at = now() where deleted_at is null;

create function pg_temp.d() returns date language sql as $$ select (now() at time zone 'Africa/Lagos')::date - 1 $$;
create function pg_temp.noon(days int default 0) returns timestamptz language sql as $$
  select ((pg_temp.d() - days) + time '12:00') at time zone 'Africa/Lagos'
$$;

-- Readers 01–06 read yesterday through log_reading_session: 10 pages each; 01, 02, 03 offline.
-- A 6-argument call (today's app) still works and leaves pages and offline empty.
create function pg_temp.log_as(u uuid, pages numeric, offline boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if pages is null then
    perform public.log_reading_session(p_client_id => gen_random_uuid(), p_book => '15240000-0000-4000-c000-000000000001',
      p_device_id => null, p_started_at => pg_temp.noon(), p_ended_at => pg_temp.noon() + interval '2 minutes',
      p_active_seconds => 120);
  else
    perform public.log_reading_session(gen_random_uuid(), '15240000-0000-4000-c000-000000000001', null,
      pg_temp.noon(), pg_temp.noon() + interval '2 minutes', 120, pages, offline);
  end if;
  reset role;
end $$;
-- log_reading_session caps ended_at at now(), so yesterday noon is fine.
select pg_temp.log_as(id, 10, right(id::text, 2)::int <= 3) from auth.users
  where email like 'rd_@test.local' and email <> 'rd7@test.local';
select pg_temp.log_as('15240000-0000-4000-a000-000000000001', null, null);
select is((select count(*)::int from public.reading_sessions where pages is null and offline is null), 1,
  'a call without pages or offline still logs the session');

-- All six unlocked it; progress: 01 10%, 02 30%, 03 60%, 04 80%, 05 and 06 finished yesterday.
insert into public.entitlements (user_id, book_id, scope, source)
select id, '15240000-0000-4000-c000-000000000001', 'book', 'unlock_all' from auth.users
  where email like 'rd_@test.local' and email <> 'rd7@test.local';
insert into public.reading_progress (user_id, book_id, percent, max_percent, finished_at, last_opened_at)
select u.id, '15240000-0000-4000-c000-000000000001', v.p, v.p, case when v.p = 100 then pg_temp.noon() end, pg_temp.noon()
from auth.users u join (values ('01', 10), ('02', 30), ('03', 60), ('04', 80), ('05', 100), ('06', 100)) v (n, p)
  on right(u.id::text, 2) = v.n
where u.email like 'rd_@test.local';

-- Each of the six highlights p9 and comments on it with the same passage quote; 02 hearts 01's comment.
insert into public.annotations (client_id, user_id, book_id, kind, color, cfi_range, start_para_id, created_at)
select gen_random_uuid(), id, '15240000-0000-4000-c000-000000000001', 'highlight', 'yellow', 'cfi', 'p9', pg_temp.noon()
from auth.users where email like 'rd_@test.local' and email <> 'rd7@test.local';
insert into public.passage_comments (id, book_id, para_id, user_id, body, quote, created_at)
select ('15240000-0000-4000-f000-0000000000' || right(id::text, 2))::uuid, '15240000-0000-4000-c000-000000000001', 'p9',
       id, 'So true', 'Read it when you are brave enough.', pg_temp.noon()
from auth.users where email like 'rd_@test.local' and email <> 'rd7@test.local';
insert into public.passage_comment_reactions (comment_id, user_id, kind, created_at) values
  ('15240000-0000-4000-f000-000000000001', '15240000-0000-4000-a000-000000000002', 'heart', pg_temp.noon());

-- One room held yesterday 19:00–20:00 with all six: five were there in its last 10 minutes, two
-- messages; their unlocks above (made now) fall within 7 days after it. Other rooms are not this test's.
delete from public.reading_rooms;
insert into public.groups (id, kind, name) values ('15240000-0000-4000-b000-000000000001', 'room', 'Reading Book live');
insert into public.reading_rooms (group_id, book_id, code, state, starts_at, ended_at) values
  ('15240000-0000-4000-b000-000000000001', '15240000-0000-4000-c000-000000000001', 'RDNGRM24', 'ended',
   pg_temp.noon() + interval '7 hours', pg_temp.noon() + interval '8 hours');
insert into public.group_members (group_id, user_id, joined_at, last_seen_at)
select '15240000-0000-4000-b000-000000000001', id, pg_temp.noon() + interval '7 hours',
       pg_temp.noon() + case when email = 'rd6@test.local' then interval '7 hours 20 minutes' else interval '7 hours 55 minutes' end
from auth.users where email like 'rd_@test.local' and email <> 'rd7@test.local';
insert into public.messages (group_id, sender_id, client_id, body) values
  ('15240000-0000-4000-b000-000000000001', '15240000-0000-4000-a000-000000000001', gen_random_uuid(), 'Hello'),
  ('15240000-0000-4000-b000-000000000001', '15240000-0000-4000-a000-000000000002', gen_random_uuid(), 'Hi');

create function pg_temp.as_staff() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', '15240000-0000-4000-a000-000000000007', 'role', 'authenticated',
    'session_id', '15240000-0000-4000-f000-000000000007', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
           'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_staff(), pg_temp.d(), pg_temp.noon(int) to authenticated;
create table pg_temp.r (j jsonb);
grant all on pg_temp.r to authenticated;
set local role authenticated;
select pg_temp.as_staff();
insert into pg_temp.r select public.staff_analytics_reading(pg_temp.d(), pg_temp.d() + 1);
reset role;

select is((select j -> 'kpis' from pg_temp.r),
  '{"pages_per_session": 10.0, "pages_per_session_prev": null, "offline_share": 50.0, "highlights": 6,
    "highlights_per_finished": null, "discussions": 6, "discussion_readers": 6}'::jsonb,
  'key numbers: pages per session, offline share, highlights, discussions (2 finished books: no per-book rate)');
select is((select j -> 'how_far' -> 'bands' from pg_temp.r),
  '[{"label": "Under 25%", "share": 16.7}, {"label": "25 to 50%", "share": 16.7}, {"label": "50 to 75%", "share": 16.7},
    {"label": "75 to 99%", "share": 16.7}, {"label": "Finished", "share": 33.3}]'::jsonb,
  'how far readers get, of readers who unlocked');
select is((select j -> 'how_far' -> 'by_length' -> 0 from pg_temp.r),
  '{"label": "under 150 pages", "avg": 63.3}'::jsonb, 'average completion for books under 150 pages');
select is((select j -> 'how_far' -> 'by_length' -> 1 ->> 'avg' from pg_temp.r), null,
  'a length band with fewer than 5 readers shows nothing');
select is((select (j -> 'books' -> 0) - 'id' from pg_temp.r),
  '{"title": "Reading Book", "author": "Reading 07", "highlights": 6, "discussions": 1, "replies": 5, "offline": 50.0}'::jsonb,
  'per book: highlights, discussions (paragraphs), replies, offline share');
select is((select (j -> 'paragraphs' -> 0) - 'book_id' from pg_temp.r),
  '{"title": "Reading Book", "quote": "Read it when you are brave enough.", "chapter": 3, "comments": 6, "highlights": 6}'::jsonb,
  'most discussed paragraph: the book''s own text, chapter, comments, highlights');
select is((select (j -> 'rooms') #- '{rows,0,id}' #- '{rows,0,held}' from pg_temp.r),
  '{"stayed_pct": 83, "rows": [{"name": "Reading Book live", "joined": 6, "stayed_pct": 83, "messages": 2, "unlocks": 6}]}'::jsonb,
  'room attendance: joined, stayed to the end, messages, unlocks within 7 days');

-- Fewer than 5 commenters: the paragraph is not shown and the readers count is hidden.
delete from public.passage_comment_reactions;
delete from public.passage_comments where user_id::text > '15240000-0000-4000-a000-000000000004';
set local role authenticated;
select pg_temp.as_staff();
select is(public.staff_analytics_reading(pg_temp.d(), pg_temp.d() + 1) -> 'paragraphs', '[]'::jsonb,
  'a paragraph with fewer than 5 readers commenting is not shown');
select is(public.staff_analytics_reading(pg_temp.d(), pg_temp.d() + 1) -> 'kpis' -> 'discussion_readers', 'null'::jsonb,
  'fewer than 5 readers who took part shows no count');
reset role;

-- A reader cannot read it; a 6-argument signature no longer exists on its own.
create function pg_temp.as_reader() returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', '15240000-0000-4000-a000-000000000001',
    'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_reader() to authenticated;
select pg_temp.as_reader();
set local role authenticated;
select throws_ok($$select public.staff_analytics_reading(current_date - 7, current_date)$$, '42501', null,
  'a reader cannot see reading analytics');
reset role;
select is((select count(*)::int from pg_proc where proname = 'log_reading_session'), 1,
  'one log_reading_session, so named calls are never ambiguous');

select * from finish();
rollback;
