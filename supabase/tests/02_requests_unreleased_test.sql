-- Flow 02 · spec check 02-12 (staff link a requested query to a book; requesters are told once it
-- is live) and 02-13 ("Show unreleased books" puts scheduled books in search, labelled Coming soon).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'session_id', '20000000-0000-4000-f000-' || right(uid, 12), 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- ─── 02-13: Night Bus to Kano (seed) is scheduled ───────────────────────────
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is(jsonb_array_length(public.search('night bus kano') -> 'books'), 0,
  'scheduled books stay out of search while the setting is off');
select ok(not (public.suggest('night bus') @> '[{"title":"Night Bus to Kano"}]'), 'and out of suggestions');

reset role;
update public.search_settings set show_unreleased = true;
set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-000000000001');
select is(public.search('night bus kano') #>> '{books,0,title}', 'Night Bus to Kano',
  'with the setting on, search finds the scheduled book');
select is((public.search('night bus kano') #>> '{books,0,coming_soon}')::boolean, true, 'labelled Coming soon');
select is(public.search('night bus kano') -> 'top', 'null'::jsonb,
  'a Coming soon book is never the top result (it has no preview to read yet)');
select ok(public.suggest('night bus') @> '[{"type":"book","title":"Night Bus to Kano","coming_soon":true}]',
  'suggestions include it, flagged');
select is((public.search('grace') #>> '{books,0,coming_soon}')::boolean, false, 'released books are not flagged');
select throws_ok($$select * from public.search_catalog$$, '42501', null, 'readers cannot read the view directly');

-- ─── 02-12: link a query ────────────────────────────────────────────────────
reset role;
insert into public.book_requests (user_id, query_norm, status) values
  ('00000000-0000-4000-a000-000000000001', 'qzv lost river', 'open'),
  ('00000000-0000-4000-a000-000000000002', 'qzv lost river', 'wishlist');
delete from public.notifications where kind = 'book_request_fulfilled';

set local role authenticated;
select pg_temp.as_user('00000000-0000-4000-b000-000000000004');
select throws_ok($$select public.link_book_request_query('qzv lost river', '00000000-0000-4000-c200-000000000001')$$,
  '42501', null, 'a Moderator cannot link requests');

select pg_temp.as_user('00000000-0000-4000-b000-000000000002');
select is(public.link_book_request_query('QZV Lost River', '00000000-0000-4000-c200-000000000001'), 2,
  'an Operations admin links every open and wishlisted request for the query');
reset role;
select is((select count(*)::int from public.notifications where kind = 'book_request_fulfilled'), 0,
  'nobody is told while the book is not live');
update public.books set status = 'live' where id = '00000000-0000-4000-c200-000000000001';
select is((select count(*)::int from public.notifications where kind = 'book_request_fulfilled'), 2,
  'publishing it tells each requester once');
select is((select count(*)::int from public.audit_log where action = 'request.link'
  and object_id = '00000000-0000-4000-c200-000000000001'), 1, 'the link is audited');

select * from finish();
rollback;
