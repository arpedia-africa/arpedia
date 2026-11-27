-- Flow 02 · spec check 02-3 (most read counts readers who opened the book), 02-4 (clubs are
-- searched and suggested), 02-14 (Recommended leaves out finished and saved books).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email)
select ('02f00000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t02f.local' from generate_series(1, 3) n;
insert into public.profiles (id, full_name, is_author)
select ('02f00000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 3 from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;

insert into public.books (id, author_id, title, genres, status)
select ('02f00000-0000-4000-c000-00000000000' || n)::uuid, '02f00000-0000-4000-a000-000000000003',
  'Qwlk Book ' || n, '{Fiction}', 'live' from generate_series(1, 3) n;
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord)
select ('02f00000-0000-4000-d000-00000000000' || n)::uuid, ('02f00000-0000-4000-c000-00000000000' || n)::uuid,
  1, 'live', 50000, 200, 100, 10, 0 from generate_series(1, 3) n;
update public.books set current_revision_id = ('02f00000-0000-4000-d000-' || right(id::text, 12))::uuid
where id::text like '02f00000-0000-4000-c000-%';

-- 02-3: two readers opened book 1 on the free preview; nobody unlocked it.
insert into public.reading_sessions (client_id, user_id, book_id, started_at, ended_at, active_seconds)
select gen_random_uuid(), ('02f00000-0000-4000-a000-00000000000' || n)::uuid, '02f00000-0000-4000-c000-000000000001',
  now() - interval '1 day', now() - interval '1 day' + interval '10 minutes', 600 from generate_series(1, 2) n;
select is((select readers from public._readers_7d() where book_id = '02f00000-0000-4000-c000-000000000001'), 2,
  'readers who opened the free preview count as readers');
insert into public.entitlements (user_id, book_id, scope, source) values
  ('02f00000-0000-4000-a000-000000000002', '02f00000-0000-4000-c000-000000000002', 'book', 'unlock_all');
select is((select readers from public._readers_7d() where book_id = '02f00000-0000-4000-c000-000000000002'), 1,
  'an unlock not yet opened still counts');
select is((select unlocks from public._readers_7d() where book_id = '02f00000-0000-4000-c000-000000000001'), 0,
  'unlocks still come from entitlements');

-- 02-4: only the public club matches; a private club and a room with the same word do not.
insert into public.groups (kind, name, visibility, member_count) values
  ('club', 'Zqxv Readers', 'public', 12),
  ('club', 'Zqxv Secret Circle', 'private', 4),
  ('room', 'Zqxv Room', 'public', 3);

-- 02-14: reader 1 finished book 2 and saved book 3.
insert into public.reading_progress (user_id, book_id, percent, max_percent, finished_at) values
  ('02f00000-0000-4000-a000-000000000001', '02f00000-0000-4000-c000-000000000002', 100, 100, now());
insert into public.saved_books (user_id, book_id) values
  ('02f00000-0000-4000-a000-000000000001', '02f00000-0000-4000-c000-000000000003');
delete from public.recommendation_cache where user_id = '02f00000-0000-4000-a000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"02f00000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(jsonb_array_length(public.search('zqxv') -> 'clubs'), 1, 'search finds the public club only');
select is(public.search('zqxv') #>> '{clubs,0,name}', 'Zqxv Readers', 'by name');
select is((public.search('zqxv') #>> '{counts,clubs}')::int, 1, 'and counts it');
select is(jsonb_array_length(public.search('zqxv', 'books') -> 'clubs'), 0, 'the Books scope leaves clubs out');
select ok(public.suggest('zqxv') @> '[{"type":"club","title":"Zqxv Readers","members":12}]',
  'suggestions include the club');

select ok(not ('02f00000-0000-4000-c000-000000000002' = any (public.get_recommendations())),
  'Recommended leaves out a finished book');
select ok(not ('02f00000-0000-4000-c000-000000000003' = any (public.get_recommendations())),
  'and a saved one');

select * from finish();
rollback;
