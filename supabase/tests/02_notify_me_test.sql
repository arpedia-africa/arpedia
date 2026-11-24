-- Flow 02/05 · spec check 02-15 (Notify me fills coming_soon_notify, bumps notify_count, tells
-- waiting readers on release) and 05-3 (the book shows in Saved with its date).
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Seed: Night Bus to Kano (c200-…001) is scheduled with a coming-soon entry (notify_count 312),
-- by Musa (a000-…006). Ngozi (a000-…001) and Emeka (a000-…007) are readers.
create temp table pushes_before as
  select count(*)::int as n from pgmq.q_push_fanout where message ->> 'type' = 'book_released';
grant select on pushes_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(public.notify_me_on('00000000-0000-4000-c200-000000000001'), false, 'not waiting before the tap');
select is(public.notify_me('00000000-0000-4000-c200-000000000001'), true, 'Notify me turns on');
select is(public.notify_me_on('00000000-0000-4000-c200-000000000001'), true, 'and the book page can read it');
select lives_ok($$select public.notify_me('00000000-0000-4000-c200-000000000001')$$, 'a second tap is harmless');
select is((select notify_count from public.coming_soon_entries where book_id = '00000000-0000-4000-c200-000000000001'),
  313, 'notify_count goes up once');
select is((select (x -> 'shelves' ->> 'saved')::boolean from jsonb_array_elements(public.get_library('saved') -> 'items') x
  where x ->> 'book_id' = '00000000-0000-4000-c200-000000000001'), true, 'the book is in Saved');
select isnt((select x ->> 'coming_soon_at' from jsonb_array_elements(public.get_library('saved') -> 'items') x
  where x ->> 'book_id' = '00000000-0000-4000-c200-000000000001'), null, 'with its release date');
select throws_ok($$select public.notify_me((select id from public.books where status = 'live' limit 1))$$,
  'P0001', 'not_available', 'only coming-soon books take Notify me');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000007","role":"authenticated"}', true);
select is(public.notify_me('00000000-0000-4000-c200-000000000001'), true, 'a second reader waits too');
select is(public.notify_me('00000000-0000-4000-c200-000000000001', false), false, 'and changes their mind');
select is((select notify_count from public.coming_soon_entries where book_id = '00000000-0000-4000-c200-000000000001'),
  313, 'turning it off takes the count back down');
select throws_ok($$insert into public.coming_soon_notify (entry_id, user_id)
  select id, '00000000-0000-4000-a000-000000000007' from public.coming_soon_entries limit 1$$, '42501', null,
  'readers cannot write coming_soon_notify directly');

-- Release: only Ngozi is still waiting (Emeka turned it off).
reset role;
update public.books set status = 'live' where id = '00000000-0000-4000-c200-000000000001';
select is((select count(*)::int from pgmq.q_push_fanout where message ->> 'type' = 'book_released')
  - (select n from pushes_before), 1, 'release sends one push batch');
select is((select message -> 'user_ids' from pgmq.q_push_fanout where message ->> 'type' = 'book_released'
  order by msg_id desc limit 1), '["00000000-0000-4000-a000-000000000001"]'::jsonb, 'to the readers still waiting');
update public.books set status = 'scheduled' where id = '00000000-0000-4000-c200-000000000001';
update public.books set status = 'live' where id = '00000000-0000-4000-c200-000000000001';
select is((select count(*)::int from pgmq.q_push_fanout where message ->> 'type' = 'book_released')
  - (select n from pushes_before), 1, 'a re-release does not tell them twice');

select * from finish();
rollback;
