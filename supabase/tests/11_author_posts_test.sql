-- Flow 11 · 11-3 (rule 31, server half): an author posts an update to followers and their
-- community, with an optional live book; readers, muted words and retries are handled.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- 1 author (with a community and a follower), 2 follower, 3 reader (not an author).
insert into auth.users (id, email)
select ('11300000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow1103.test' from generate_series(1, 3) n;
insert into public.profiles (id, full_name, is_author)
select ('11300000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 1 from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.follows (follower_id, followee_id) values
  ('11300000-0000-4000-a000-000000000002', '11300000-0000-4000-a000-000000000001');
insert into public.groups (id, kind, name, owner_id, visibility) values
  ('11300000-0000-4000-c000-000000000001', 'author', 'User 1 readers', '11300000-0000-4000-a000-000000000001', 'public');
insert into public.books (id, author_id, title, status) values
  ('11300000-0000-4000-b000-000000000001', '11300000-0000-4000-a000-000000000001', 'Harmattan Road', 'live'),
  ('11300000-0000-4000-b000-000000000002', '11300000-0000-4000-a000-000000000001', 'Draft Book', 'draft'),
  ('11300000-0000-4000-b000-000000000003', '11300000-0000-4000-a000-000000000003', 'Not Yours', 'live');
delete from public.automod_words;
insert into public.automod_words (text, is_phrase, category, scope, action) values
  ('rubbishword', false, 'harassment', 'everywhere', 'hide_and_report');

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
create temp table res (k text, v jsonb);
grant all on res to authenticated;

set local role authenticated;
select pg_temp.as_user('11300000-0000-4000-a000-000000000003');
select throws_ok($$ select public.publish_author_post('Hi', 'Hello readers') $$, 'P0001', 'not_author',
  'a reader who is not an author cannot post');

select pg_temp.as_user('11300000-0000-4000-a000-000000000001');
select throws_ok($$ select public.publish_author_post('  ', 'Hello readers') $$, 'P0001', 'invalid_title', 'a title is needed');
select throws_ok($$ select public.publish_author_post('Hi', 'x') $$, 'P0001', 'invalid_body', 'a body is needed');
select throws_ok($$ select public.publish_author_post(repeat('t', 121), 'Hello readers') $$, 'P0001', 'invalid_title',
  'titles stop at 120');
select throws_ok($$ select public.publish_author_post('Hi', 'Hello readers', '11300000-0000-4000-b000-000000000002') $$,
  'P0001', 'book_not_found', 'only a live book can be linked');
select throws_ok($$ select public.publish_author_post('Hi', 'Hello readers', '11300000-0000-4000-b000-000000000003') $$,
  'P0001', 'book_not_found', 'only the author''s own book');
select throws_ok($$ select public.publish_author_post('Hi', 'You RUBBISHWORD') $$, 'P0001', 'rejected_by_rules',
  'a muted word refuses the post');

insert into res select 'first', public.publish_author_post(' Chapter 12 is out ', 'Thank you for reading!',
  '11300000-0000-4000-b000-000000000001');
insert into res select 'again', public.publish_author_post('Chapter 12 is out', 'Thank you for reading!',
  '11300000-0000-4000-b000-000000000001');
select is((select v ->> 'post_id' from res where k = 'again'), (select v ->> 'post_id' from res where k = 'first'),
  'the same post again (a retry) returns the first one');
select is((select v -> 'repeat' from res where k = 'again'), 'true'::jsonb, 'and says so');
select is((public.get_post((select (v ->> 'post_id')::uuid from res where k = 'first')) -> 'book'),
  '{"id": "11300000-0000-4000-b000-000000000001", "title": "Harmattan Road"}'::jsonb, 's-post shows the linked book');
reset role;

select is((select count(*)::int from public.author_posts where author_id = '11300000-0000-4000-a000-000000000001'),
  1, 'one post stored');
select is((select title || '|' || state::text from public.author_posts where author_id = '11300000-0000-4000-a000-000000000001'),
  'Chapter 12 is out|published', 'trimmed and published');
select is((select q.message -> 'user_ids' from pgmq.q_push_fanout q
           where q.message ->> 'type' = 'author_new_post'
             and q.message #>> '{data,actor_id}' = '11300000-0000-4000-a000-000000000001'),
  '["11300000-0000-4000-a000-000000000002"]'::jsonb, 'followers get the new-post push');
select is((select kind::text || '|' || body from public.messages where group_id = '11300000-0000-4000-c000-000000000001'),
  'system|User 1 posted: Chapter 12 is out', 'the community gets a line about it');

-- Ten posts a day at most.
insert into public.author_posts (author_id, title, body, state, published_at)
select '11300000-0000-4000-a000-000000000001', 'Old ' || n, 'Body ' || n, 'published', now() - interval '1 hour'
from generate_series(1, 9) n;
set local role authenticated;
select pg_temp.as_user('11300000-0000-4000-a000-000000000001');
select throws_ok($$ select public.publish_author_post('Eleventh', 'One more today') $$, 'P0001', 'rate_limited',
  'more than 10 a day is refused');
reset role;

select * from finish();
rollback;
