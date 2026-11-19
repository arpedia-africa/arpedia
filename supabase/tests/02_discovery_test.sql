-- Flow 02 · Discovery: RLS on notifications, book_requests, search_events, shelf_drafts;
-- publish_shelf (max 10, pins); rotate_trending keeps pins; create_notification honours
-- preferences and deduplicates; Home, Top 10, Explore and search read paths.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- Seed people: Ngozi (reader), Tolu (author), Tunde (Publisher), Kemi D. (Analyst).
create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '20000000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true)
$$;
create function pg_temp.as_service() returns void
language sql as $$
  select set_config('request.jwt.claims', '{"role":"service_role"}', true)
$$;
grant execute on function pg_temp.as_user(text), pg_temp.as_service() to authenticated, service_role;

create temporary table ids (k text primary key, v uuid);
insert into ids select 'ngozi', '00000000-0000-4000-a000-000000000001'::uuid
  union all select 'tolu', '00000000-0000-4000-a000-000000000003'::uuid
  union all select 'tunde', '00000000-0000-4000-b000-000000000003'::uuid
  union all select 'analyst', '00000000-0000-4000-b000-000000000007'::uuid
  union all select 'trending', (select id from public.home_sections where key = 'trending')
  union all select 'harmattan', (select id from public.books where title = 'Harmattan Letters')
  union all select 'bread', (select id from public.books where title = 'Bread on Water');
grant select on ids to authenticated, service_role;

-- ─── Notifications ──────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is((select count(*)::int from public.notifications), 8, 'reader sees her own 8 notifications');
select is((public.get_notifications() ->> 'unread')::int, 3, 'feed reports 3 unread');
select throws_ok($$insert into public.notifications (user_id, kind, category, title)
  values ('00000000-0000-4000-a000-000000000001', 'x', 'books', 'x')$$, '42501', null, 'no direct insert');
select throws_ok($$update public.notifications set title = 'changed'$$, '42501', null, 'only read_at is writable');
select is(public.mark_notification_read((select id from public.notifications where read_at is null
  order by created_at desc limit 1)), 2, 'marking one read returns the new unread count');
select throws_ok($$select public.create_notification('00000000-0000-4000-a000-000000000001', 'x', 'books', 'x')$$,
  '42501', null, 'readers cannot create notifications');
select is(public.mark_all_notifications_read(), 0, 'mark all read clears the badge');
select is((public.get_home() ->> 'unread')::int, 0, 'Home bell agrees');

select pg_temp.as_user('00000000-0000-4000-a000-000000000003');
select is((select count(*)::int from public.notifications), 0, 'another reader sees none of them');

reset role;
set local role service_role;
select pg_temp.as_service();
select isnt(public.create_notification((select v from ids where k = 'tolu'), 'new_book', 'books', 'Hi', '', 'book', 'b1'),
  null, 'service role creates a notification');
select is(public.create_notification((select v from ids where k = 'tolu'), 'new_book', 'books', 'Hi', '', 'book', 'b1'),
  (select id from public.notifications where user_id = (select v from ids where k = 'tolu') and target_id = 'b1'),
  'same kind and target within a minute is one row');
reset role;
create or replace function public.notification_allowed(p_user uuid, p_kind text) returns boolean
language sql stable set search_path = '' as $$ select p_kind <> 'muted_kind' $$;
set local role service_role;
select pg_temp.as_service();
select is(public.create_notification((select v from ids where k = 'tolu'), 'muted_kind', 'books', 'Hi'), null,
  'a kind the reader turned off is skipped');
reset role;

-- ─── Book requests ──────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is(public.request_book('Things Fall Apart'), 4, 'request counts every reader asking');
select is(public.request_book('  things   FALL apart '), 4, 'a repeat is the same request');
select is((select count(*)::int from public.book_requests), 1, 'reader reads only her own request');
select throws_ok($$insert into public.book_requests (user_id, query_norm) values (auth.uid(), 'abc')$$,
  '42501', null, 'no direct insert into book_requests');

-- ─── Search events ──────────────────────────────────────────────────────────
select is((select count(*)::int from public.search_events), 0, 'readers read no search events');
select lives_ok($$select public.log_search('g', 3)$$, 'a 1-letter query is ignored');
select throws_ok($$insert into public.search_events (query_norm) values ('abc')$$, '42501', null,
  'no direct insert into search_events');
select pg_temp.as_user('00000000-0000-4000-b000-000000000007');
select ok((select count(*) from public.search_events) > 0, 'Analyst reads search events');
select is((select count(*)::int from public.search_events where query_norm = 'g'), 0, 'nothing logged for 1 letter');

-- ─── Shelves ────────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select throws_ok($$select public.save_shelf_draft((select v from ids where k = 'trending'), '[]')$$, '42501', null,
  'readers cannot edit shelves');
select is((select count(*)::int from public.shelf_drafts), 0, 'readers see no drafts');

select pg_temp.as_user('00000000-0000-4000-b000-000000000003');
select is(public.save_shelf_draft((select v from ids where k = 'trending'),
  (select jsonb_agg(jsonb_build_object('item_type', 'book', 'item_id', id)) from public.books)),
  (select count(*)::int from public.books), 'Publisher saves a draft');
select throws_ok($$select public.publish_shelf((select v from ids where k = 'trending'))$$, '22023',
  'Trending holds at most 10 books', 'publish refuses more than 10 books');
select lives_ok($$select public.discard_shelf_draft((select v from ids where k = 'trending'))$$, 'discard');
select is((select count(*)::int from public.shelf_items where section_id = (select v from ids where k = 'trending')), 8,
  'discard leaves the live shelf untouched');

select public.save_shelf_draft((select v from ids where k = 'trending'), (
  select jsonb_agg(jsonb_build_object('item_type', 'book', 'item_id', b.id, 'pinned', b.title = 'Bread on Water')
    order by b.title = 'Bread on Water' desc, b.title)
  from public.books b where b.status = 'live' and b.title in ('Bread on Water', 'Ruth of Ibadan', 'The Alignment',
    'Still Waters, Lagos', 'A House Called Grace')));
select is(public.publish_shelf((select v from ids where k = 'trending')), 5, 'publish replaces the live rows');
select is((select item_id from public.shelf_items where section_id = (select v from ids where k = 'trending') and pinned),
  (select v from ids where k = 'bread'), 'pinned book is published pinned at the top');
select is((select count(*)::int from public.shelf_drafts), 0, 'publishing clears the draft');
reset role;
select ok(exists (select 1 from public.audit_log where action = 'shelf.publish'
  and actor_id = '00000000-0000-4000-b000-000000000003'), 'publish is audited');

-- rotate_trending (cron): pinned book keeps position 0; 2 unpinned out, 2 most read in.
select set_config('request.jwt.claims', '', true);
select public.rotate_trending();
select is((select position from public.shelf_items where section_id = (select v from ids where k = 'trending')
  and item_id = (select v from ids where k = 'bread')), 0, 'rotation keeps the pinned book in place');
select is((select count(*)::int from public.shelf_items where section_id = (select v from ids where k = 'trending')), 5,
  'rotation swaps two books for two');

-- ─── Read paths ─────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is(jsonb_path_query_array(public.get_home(), '$.sections[*].key'),
  '["trending","authors","new_arrivals","top10","coming_soon","recommended","genres"]', 'Home sections in order');
select is((select jsonb_agg(x -> 'prev_rank') from jsonb_array_elements(public.get_top10()) x
  where x ->> 'title' in ('Harmattan Letters', 'Still Waters, Lagos')),
  '[5, null]', 'Top 10 movement compares with last week (New when absent)');
select ok(not ((select id from public.books where title = 'Ruth of Ibadan') = any (public.get_recommendations())),
  'recommendations leave out books she unlocked');
select is((public.list_books() ->> 'count')::int, public.count_books(), 'list count matches count_books');
select is((select count(distinct x ->> 'id')::int from (
    select jsonb_array_elements(public.list_books(null, null, 'price', null, 4) -> 'items') x
    union all
    select jsonb_array_elements(public.list_books(null, null, 'price',
      public.list_books(null, null, 'price', null, 4) -> 'next', 4) -> 'items')) p), 8,
  'keyset pages do not repeat');
select ok(public.search('harmatan') -> 'books' @> jsonb_build_array(jsonb_build_object('title', 'Harmattan Letters')),
  'a typo still finds Harmattan Letters');
select ok((select bool_and(char_length(x ->> 'snippet') <= 120) from jsonb_array_elements(public.search('grace') -> 'books') x
  where x ->> 'snippet' is not null), 'snippets are at most 120 characters');
select is(public.get_search_home() -> 'trending' -> 0 ->> 'query', 'grace', 'trending searches ranked by searchers');

-- ─── Requests fulfilled on publish ──────────────────────────────────────────
reset role;
update public.books set status = 'unpublished' where id = (select v from ids where k = 'bread');
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-b000-000000000003');
select public.link_book_request(array(select id from public.book_requests where query_norm = 'things fall apart'),
  (select v from ids where k = 'bread'));
reset role;
update public.books set status = 'live' where id = (select v from ids where k = 'bread');
select is((select count(*)::int from public.notifications where kind = 'book_request_fulfilled'), 4,
  'publishing the linked book notifies each requester once');

select * from finish();
rollback;
