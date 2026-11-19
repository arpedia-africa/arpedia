-- Flow 07 · reading rooms: RLS on reading_rooms and room_member_progress, the code stays with
-- members, create limits (5 hosted, minors and Anyone), join_reading_room messages and throttle,
-- spoiler stamping, progress (never backwards), annotations locked until finish, host and staff
-- actions, leave hand-over and lifecycle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- Hana (host), Mo (member), Obi (outsider, author of the book), Kemi (17, minor), Sam (moderator).
insert into auth.users (id, email, raw_user_meta_data) values
  ('70000000-0000-4000-a000-000000000001', 'hana7@test.local', '{"full_name":"Hana Seven"}'),
  ('70000000-0000-4000-a000-000000000002', 'mo7@test.local', '{"full_name":"Mo Seven"}'),
  ('70000000-0000-4000-a000-000000000003', 'obi7@test.local', '{"full_name":"Obi Seven"}'),
  ('70000000-0000-4000-a000-000000000004', 'kemi7@test.local', '{"full_name":"Kemi Seven"}'),
  ('70000000-0000-4000-a000-000000000005', 'sam7@test.local', '{"full_name":"Sam Staff"}');
update auth.users set created_at = now() - interval '30 days' where email like '%7@test.local';
update public.profiles set date_of_birth = (current_date - interval '17 years')::date
 where id = '70000000-0000-4000-a000-000000000004';
insert into public.staff_roles (user_id, role) values ('70000000-0000-4000-a000-000000000005', 'moderator');

insert into public.books (id, author_id, title, status) values
  ('70000000-0000-4000-b000-000000000001', '70000000-0000-4000-a000-000000000003', 'Room Book', 'live'),
  ('70000000-0000-4000-b000-000000000002', '70000000-0000-4000-a000-000000000003', 'Unowned Book', 'live');
insert into public.entitlements (user_id, book_id, scope, source)
select u, '70000000-0000-4000-b000-000000000001', 'book', 'staff'
from unnest(array['70000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000002',
                  '70000000-0000-4000-a000-000000000004']::uuid[]) u;

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated', 'aal', 'aal2',
    'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
             'timestamp', extract(epoch from now() - interval '1 minute')::bigint)))::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
create temp table t_room (k text primary key, id uuid, code text);
grant all on t_room to authenticated, service_role;

set local role authenticated;

-- ─── create_reading_room ────────────────────────────────────────────────────
select pg_temp.as_user('70000000-0000-4000-a000-000000000001');
select throws_ok($$select public.create_reading_room('ab', '70000000-0000-4000-b000-000000000001')$$,
  '22023', 'room_name', 'name under 3 characters refused');
select throws_ok($$select public.create_reading_room(repeat('a', 41), '70000000-0000-4000-b000-000000000001')$$,
  '22023', 'room_name', 'name over 40 characters refused');
select throws_ok($$select public.create_reading_room('Not mine', '70000000-0000-4000-b000-000000000002')$$,
  '22023', 'book_not_in_library', 'a book outside my library is refused');
insert into t_room select 'a', (j ->> 'room_id')::uuid, j ->> 'code'
  from public.create_reading_room('  Grace readers 📚 ', '70000000-0000-4000-b000-000000000001', 'three_week') j;
select matches((select code from t_room where k = 'a'), '^[A-HJ-NP-Z2-9]{8}$', 'code is 8 characters without 0 O 1 I');
select is((select name from public.groups where id = (select id from t_room where k = 'a')), 'Grace readers 📚',
  'name is trimmed, emoji kept');
select is((select role::text from public.group_members where group_id = (select id from t_room where k = 'a')
           and user_id = auth.uid()), 'owner', 'creator is the host');
select is((select count(*)::int from public.room_member_progress where room_id = (select id from t_room where k = 'a')),
  1, 'host has a progress row');
select is((select visibility::text from public.groups where id = (select id from t_room where k = 'a')), 'private',
  'invite-code rooms are private groups');
select lives_ok($$select public.create_reading_room('Room two', '70000000-0000-4000-b000-000000000001')$$, 'room 2');
select lives_ok($$select public.create_reading_room('Room three', '70000000-0000-4000-b000-000000000001')$$, 'room 3');
select lives_ok($$select public.create_reading_room('Room four', '70000000-0000-4000-b000-000000000001')$$, 'room 4');
select lives_ok($$select public.create_reading_room('Room five', '70000000-0000-4000-b000-000000000001')$$, 'room 5');
select throws_ok($$select public.create_reading_room('Room six', '70000000-0000-4000-b000-000000000001')$$,
  '22023', 'host_limit', 'a sixth hosted room is refused');

select pg_temp.as_user('70000000-0000-4000-a000-000000000004');
select throws_ok($$select public.create_reading_room('Teen room', '70000000-0000-4000-b000-000000000001', 'free', 'anyone')$$,
  '22023', 'minor_anyone', 'minors cannot create Anyone rooms');
select lives_ok($$select public.create_reading_room('Teen room', '70000000-0000-4000-b000-000000000001')$$,
  'minors can create invite-code rooms');

-- ─── RLS: the code stays with members ───────────────────────────────────────
select pg_temp.as_user('70000000-0000-4000-a000-000000000002');
select is((select count(*)::int from public.reading_rooms), 0, 'non-member reads no rooms (and no codes)');
select is((select count(*)::int from public.room_member_progress), 0, 'non-member reads no progress');
select throws_ok($$select public.get_room((select id from t_room where k = 'a'))$$, 'P0002', null,
  'get_room is for members only');

-- ─── join_reading_room ──────────────────────────────────────────────────────
select is(public.join_reading_room('ZZZZ-ZZZZ') ->> 'status', 'not_found', 'wrong code: not found');
select is(public.join_reading_room(lower((select code from t_room where k = 'a')), false) ->> 'status', 'confirm',
  'lower case code finds the room and asks for consent');
select is((select count(*)::int from public.group_members where user_id = auth.uid()), 0, 'consent step does not join');
select is(public.join_reading_room(' ' || left((select code from t_room where k = 'a'), 4) || '-'
                                   || right((select code from t_room where k = 'a'), 4), true) ->> 'status',
  'joined', 'spaces and hyphens are ignored; confirmed join');
select is(public.join_reading_room((select code from t_room where k = 'a')) ->> 'status', 'member',
  'already a member: the room just opens');
select is((select count(*)::int from public.reading_rooms), 1, 'member reads the room');
select is((public.get_room((select id from t_room where k = 'a')) ->> 'code'),
  (select code from t_room where k = 'a'), 'members see the code');

-- Throttle: 10 wrong codes in an hour lock for 15 minutes (the 11th try).
select pg_temp.as_user('70000000-0000-4000-a000-000000000003');
select is((select count(*)::int from generate_series(1, 9) i
           where public.join_reading_room('WRONG' || lpad(i::text, 3, 'X')) ->> 'status' = 'not_found'), 9,
  'nine wrong codes: not found');
select is(public.join_reading_room('WRONGTEN') ->> 'status', 'too_many_tries', 'the tenth wrong code starts the wait');
select is(public.join_reading_room((select code from t_room where k = 'a')) ->> 'status', 'too_many_tries',
  'even the right code waits 15 minutes');
select ok((public.join_reading_room('ANYTHING') ->> 'retry_at')::timestamptz > now() + interval '14 minutes',
  'retry time is about 15 minutes away');

-- Ended and full rooms.
reset role;
update public.reading_rooms set max_members = 2 where group_id = (select id from t_room where k = 'a');
delete from public.room_code_attempts where user_id = '70000000-0000-4000-a000-000000000003';
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-a000-000000000003');
select is(public.join_reading_room((select code from t_room where k = 'a')) ->> 'status', 'full', 'full room');
reset role;
update public.reading_rooms set max_members = 100 where group_id = (select id from t_room where k = 'a');
set local role authenticated;

-- ─── Progress and spoilers ──────────────────────────────────────────────────
select pg_temp.as_user('70000000-0000-4000-a000-000000000001');
select is(jsonb_array_length(public.update_room_progress('70000000-0000-4000-b000-000000000001', 40, 8)), 5,
  'progress reaches every room with the book');
select is((select chapter_index from public.room_member_progress
           where room_id = (select id from t_room where k = 'a') and user_id = auth.uid()), 8, 'chapter stored');
select lives_ok($$select public.update_room_progress('70000000-0000-4000-b000-000000000001', 10, 2)$$, 'going back');
select is((select percent from public.room_member_progress
           where room_id = (select id from t_room where k = 'a') and user_id = auth.uid()), 40.00::numeric,
  'room progress never goes backwards');
select throws_ok($$select public.update_room_progress('70000000-0000-4000-b000-000000000001', 101, 2)$$,
  '22023', 'bad_progress', 'percent over 100 refused');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select jsonb_agg(e ->> 'status') from jsonb_array_elements(public.persist_messages(jsonb_build_array(
    jsonb_build_object('group_id', (select id from t_room where k = 'a'), 'sender_id', '70000000-0000-4000-a000-000000000001',
      'client_id', '7c000000-0000-4000-8000-000000000001', 'body', 'Chapter 8 twist!'),
    jsonb_build_object('group_id', (select id from t_room where k = 'a'), 'sender_id', '70000000-0000-4000-a000-000000000002',
      'client_id', '7c000000-0000-4000-8000-000000000002', 'body', 'Just started')))) e),
  '["stored", "stored"]'::jsonb, 'room messages persist through flow 06');
select is((select spoiler_chapter from public.messages where client_id = '7c000000-0000-4000-8000-000000000001'), 8,
  'message stamped with the sender''s chapter');
select is((select spoiler_chapter from public.messages where client_id = '7c000000-0000-4000-8000-000000000002'), 0,
  'no progress yet counts as chapter 0');
reset role;
set local role authenticated;
select pg_temp.as_user('70000000-0000-4000-a000-000000000002');
select is((select spoiler_chapter from public.get_room_messages((select id from t_room where k = 'a'))
           where body = 'Chapter 8 twist!'), 8, 'get_room_messages returns the spoiler chapter');

-- ─── Annotations lock ───────────────────────────────────────────────────────
select is((public.get_room_annotations((select id from t_room where k = 'a')) ->> 'locked')::boolean, true,
  'annotations locked before finishing');
select lives_ok($$select public.update_room_progress('70000000-0000-4000-b000-000000000001', 100, 20)$$, 'Mo finishes');
select isnt((select finished_at from public.room_member_progress
             where room_id = (select id from t_room where k = 'a') and user_id = auth.uid()), null, 'finished_at set');
select is((public.get_room_annotations((select id from t_room where k = 'a')) ->> 'locked')::boolean, false,
  'annotations unlock on finishing');

-- ─── Host actions ───────────────────────────────────────────────────────────
select throws_ok($$select public.set_room_lock((select id from t_room where k = 'a'), true)$$, '42501', 'not_host',
  'members cannot lock');
select pg_temp.as_user('70000000-0000-4000-a000-000000000001');
select lives_ok($$select public.mute_room_member((select id from t_room where k = 'a'),
  '70000000-0000-4000-a000-000000000002', now() + interval '1 hour')$$, 'host mutes for an hour');
reset role;
select is((select reason from public.post_block_for((select id from t_room where k = 'a'),
  '70000000-0000-4000-a000-000000000002')), 'muted', 'muted member cannot post');
set local role authenticated;
select lives_ok($$select public.set_room_lock((select id from t_room where k = 'a'), true)$$, 'host locks the chat');
select is((public.get_room((select id from t_room where k = 'a')) ->> 'locked')::boolean, true, 'room shows locked');

-- ─── Staff ──────────────────────────────────────────────────────────────────
select pg_temp.as_user('70000000-0000-4000-a000-000000000005');
select lives_ok($$select public.admin_get_room((select id from t_room where k = 'a'))$$, 'moderator opens the room');
select lives_ok($$select public.admin_room_action((select id from t_room where k = 'a'), 'join_silently')$$,
  'moderator joins silently');
select lives_ok($$select public.admin_room_action((select id from t_room where k = 'a'), 'end')$$, 'moderator ends');
select lives_ok($$select public.admin_room_action((select id from t_room where k = 'a'), 'undo_end')$$,
  'moderator undoes within 10 minutes');
reset role;
select is((select array_agg(action order by id) from public.audit_log
           where object_id = (select id::text from t_room where k = 'a')),
  array['room.view', 'room.join_silently', 'room.end', 'room.undo_end'], 'staff opens and actions are audited');
select is((select count(*)::int from public.group_members where group_id = (select id from t_room where k = 'a')),
  2, 'silent join adds no member');
set local role authenticated;

-- ─── Leave hands hosting over ───────────────────────────────────────────────
select pg_temp.as_user('70000000-0000-4000-a000-000000000001');
select lives_ok($$select public.leave_reading_room((select id from t_room where k = 'a'))$$, 'host leaves');
reset role;
select is((select host_id from public.reading_rooms where group_id = (select id from t_room where k = 'a')),
  '70000000-0000-4000-a000-000000000002'::uuid, 'the longest-standing member becomes host');

select * from finish();
rollback;
