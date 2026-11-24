-- Flow 07 · spec check 07-2: every reading room is private. An "Anyone" room is still listed and
-- joinable (list_open_rooms, join_open_room) but a non-member can't read its messages
-- (get_messages) and the Durable Object gets no read-only preview (get_group_access).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('70200000-0000-4000-a000-000000000001', 'host@t72.local', '{"full_name":"Host"}', now() - interval '30 days'),
  ('70200000-0000-4000-a000-000000000002', 'out@t72.local', '{"full_name":"Outsider"}', now() - interval '30 days'),
  ('70200000-0000-4000-a000-000000000003', 'au@t72.local', '{"full_name":"Author"}', now() - interval '90 days');
insert into public.books (id, author_id, title, status) values
  ('70200000-0000-4000-b000-000000000001', '70200000-0000-4000-a000-000000000003', 'Open Book', 'live');
insert into public.entitlements (user_id, book_id, scope, source) values
  ('70200000-0000-4000-a000-000000000001', '70200000-0000-4000-b000-000000000001', 'book', 'staff'),
  ('70200000-0000-4000-a000-000000000002', '70200000-0000-4000-b000-000000000001', 'book', 'staff');

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;

select pg_temp.as_user('70200000-0000-4000-a000-000000000001');
select set_config('t.room', (public.create_reading_room('Open readers', '70200000-0000-4000-b000-000000000001',
  'free', 'anyone') ->> 'room_id'), true) is not null as created;

select pg_temp.as_owner();
select is((select visibility::text from public.groups where id = current_setting('t.room')::uuid), 'private',
  'an Anyone room is private');
insert into public.messages (group_id, sender_id, client_id, body)
values (current_setting('t.room')::uuid, '70200000-0000-4000-a000-000000000001', gen_random_uuid(), 'Chapter 9 twist!');
select is(public.get_group_access(current_setting('t.room')::uuid, '70200000-0000-4000-a000-000000000002') ->> 'access',
  'not_member', 'the room socket gives a non-member no preview');
update public.groups set visibility = 'public' where id = current_setting('t.room')::uuid;
select is((select visibility::text from public.groups where id = current_setting('t.room')::uuid), 'private',
  'a room can''t be made public again');

select pg_temp.as_user('70200000-0000-4000-a000-000000000002');
select throws_ok($$ select * from public.get_messages(current_setting('t.room')::uuid) $$,
  '42501', 'not_member', 'a non-member can''t read the room''s messages');
select ok(exists (select 1 from public.list_open_rooms() where room_id = current_setting('t.room')::uuid),
  'the Anyone room is still listed');
select is(public.join_open_room(current_setting('t.room')::uuid, true) ->> 'status', 'joined',
  'and anyone can still join it');
select is((select count(*)::int from public.get_messages(current_setting('t.room')::uuid)), 1,
  'a member reads the messages');

select pg_temp.as_owner();
select is((select count(*)::int from public.groups where kind = 'room' and visibility = 'public'), 0,
  'no room anywhere is public');

select * from finish();
rollback;
