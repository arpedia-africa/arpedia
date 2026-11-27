-- Flow 07 · spec check 07-9: create_reading_room checks the name against muted words.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('70900000-0000-4000-a000-000000000001', 'host@t79.local', '{"full_name":"Host"}', now() - interval '30 days'),
  ('70900000-0000-4000-a000-000000000002', 'au@t79.local', '{"full_name":"Author"}', now() - interval '90 days');
insert into public.books (id, author_id, title, status) values
  ('70900000-0000-4000-b000-000000000001', '70900000-0000-4000-a000-000000000002', 'Name Book', 'live');
insert into public.entitlements (user_id, book_id, scope, source) values
  ('70900000-0000-4000-a000-000000000001', '70900000-0000-4000-b000-000000000001', 'book', 'staff');
delete from public.automod_words;
insert into public.automod_words (text, is_phrase, category, scope, action) values
  ('rubbishword', false, 'harassment', 'everywhere', 'hide_and_report'),
  ('blurword', false, 'sexual', 'everywhere', 'blur'),
  ('mildword', false, 'abuse', 'everywhere', 'warn'),
  ('chatword', false, 'spam', 'chat_dms', 'hide'),
  ('reviewword', false, 'spam', 'reviews', 'hide');

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

select pg_temp.as_user('70900000-0000-4000-a000-000000000001');
select throws_ok($$ select public.create_reading_room('The rubbishword club', '70900000-0000-4000-b000-000000000001') $$,
  '22023', 'name_blocked', 'a Hide-and-report word blocks the name');
select throws_ok($$ select public.create_reading_room('RUBB1SHWORD readers', '70900000-0000-4000-b000-000000000001') $$,
  '22023', 'name_blocked', 'letter swaps and capitals don''t get past it');
select throws_ok($$ select public.create_reading_room('Blurword nights', '70900000-0000-4000-b000-000000000001') $$,
  '22023', 'name_blocked', 'a Blur word blocks the name (a name can''t be blurred)');
select throws_ok($$ select public.create_reading_room('Chatword room', '70900000-0000-4000-b000-000000000001') $$,
  '22023', 'name_blocked', 'chat-and-DM words apply to room names');
select throws_ok($$ select public.create_reading_room('rr', '70900000-0000-4000-b000-000000000001') $$,
  '22023', 'room_name', 'a too-short name still says room_name');

select ok(public.create_reading_room('Mildword readers', '70900000-0000-4000-b000-000000000001') ->> 'room_id' is not null,
  'a Warn word is allowed');
select ok(public.create_reading_room('Reviewword readers', '70900000-0000-4000-b000-000000000001') ->> 'room_id' is not null,
  'a reviews-only word is allowed');
select ok(public.create_reading_room('Grace readers', '70900000-0000-4000-b000-000000000001') ->> 'room_id' is not null,
  'a clean name creates the room');

select pg_temp.as_owner();
select is((select count(*)::int from public.reading_rooms r
           where r.host_id = '70900000-0000-4000-a000-000000000001'), 3,
  'refused names create no room');

select * from finish();
rollback;
