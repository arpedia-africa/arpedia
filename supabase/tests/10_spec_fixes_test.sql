-- Flow 10 · spec check 10-1: erasing an account also removes library rows, blocks, direct messages,
-- devices and notices (rule 37), while club messages stay (shown as "Former reader") and the other
-- person's side of a DM stays theirs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('10100000-0000-4000-a000-000000000001', 'gone@t101.local', '{"full_name":"Leaving Reader"}', now() - interval '60 days'),
  ('10100000-0000-4000-a000-000000000002', 'friend@t101.local', '{"full_name":"Friend"}', now() - interval '60 days'),
  ('10100000-0000-4000-a000-000000000003', 'au@t101.local', '{"full_name":"Author"}', now() - interval '90 days');
insert into public.books (id, author_id, title, status) values
  ('10100000-0000-4000-b000-000000000001', '10100000-0000-4000-a000-000000000003', 'Kept Book', 'live');
insert into public.saved_books (user_id, book_id) values ('10100000-0000-4000-a000-000000000001', '10100000-0000-4000-b000-000000000001');
insert into public.library_hidden (user_id, book_id) values ('10100000-0000-4000-a000-000000000001', '10100000-0000-4000-b000-000000000001');
insert into public.blocks (blocker_id, blocked_id) values
  ('10100000-0000-4000-a000-000000000001', '10100000-0000-4000-a000-000000000003'),
  ('10100000-0000-4000-a000-000000000002', '10100000-0000-4000-a000-000000000001');
insert into public.devices (user_id, name, public_key) values
  ('10100000-0000-4000-a000-000000000001', 'Phone', repeat('k', 120));
insert into public.notifications (user_id, kind, category, title) values
  ('10100000-0000-4000-a000-000000000001', 'test', 'books', 'A new book');
insert into public.groups (id, kind, name, visibility, owner_id) values
  ('10100000-0000-4000-d000-000000000001', 'dm', 'Gone and Friend', 'private', null),
  ('10100000-0000-4000-d000-000000000002', 'club', 'Book Club', 'public', '10100000-0000-4000-a000-000000000002');
insert into public.group_members (group_id, user_id) values
  ('10100000-0000-4000-d000-000000000001', '10100000-0000-4000-a000-000000000001'),
  ('10100000-0000-4000-d000-000000000001', '10100000-0000-4000-a000-000000000002'),
  ('10100000-0000-4000-d000-000000000002', '10100000-0000-4000-a000-000000000001');
insert into public.messages (id, group_id, sender_id, client_id, body) values
  ('10100000-0000-4000-e000-000000000001', '10100000-0000-4000-d000-000000000001', '10100000-0000-4000-a000-000000000001', gen_random_uuid(), 'My address is 12 Allen Avenue'),
  ('10100000-0000-4000-e000-000000000002', '10100000-0000-4000-d000-000000000001', '10100000-0000-4000-a000-000000000002', gen_random_uuid(), 'Thanks!'),
  ('10100000-0000-4000-e000-000000000003', '10100000-0000-4000-d000-000000000002', '10100000-0000-4000-a000-000000000001', gen_random_uuid(), 'Loved chapter 3');
insert into public.account_deletions (id, user_id, requested_via, requested_by)
values ('10100000-0000-4000-f000-000000000001', '10100000-0000-4000-a000-000000000001', 'app', '10100000-0000-4000-a000-000000000001');

select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select ok(public.erase_account('10100000-0000-4000-f000-000000000001'), 'erased');
select is((select count(*)::int from public.saved_books where user_id = '10100000-0000-4000-a000-000000000001')
        + (select count(*)::int from public.library_hidden where user_id = '10100000-0000-4000-a000-000000000001'), 0,
  'library rows are gone');
select is((select count(*)::int from public.blocks where '10100000-0000-4000-a000-000000000001' in (blocker_id, blocked_id)), 0,
  'blocks are gone both ways');
select is((select count(*)::int from public.messages where id = '10100000-0000-4000-e000-000000000001'), 0,
  'their direct messages are gone');
select is((select count(*)::int from public.group_members where group_id = '10100000-0000-4000-d000-000000000001'
           and user_id = '10100000-0000-4000-a000-000000000001'), 0, 'they leave the conversation');
select is((select count(*)::int from public.messages where id = '10100000-0000-4000-e000-000000000002'), 1,
  'the friend keeps their own message');
select is((select count(*)::int from public.messages where id = '10100000-0000-4000-e000-000000000003'), 1,
  'club messages stay (shown as Former reader)');
select is((select count(*)::int from public.devices where user_id = '10100000-0000-4000-a000-000000000001')
        + (select count(*)::int from public.notifications where user_id = '10100000-0000-4000-a000-000000000001'), 0,
  'devices and notices are gone');
set local role service_role;
select throws_ok($$ select public._erase_account_base('10100000-0000-4000-f000-000000000001') $$, '42501', null,
  'the unwrapped erase is not callable by the service role');
reset role;
select ok(not public.erase_account('10100000-0000-4000-f000-000000000001'), 'erasing again does nothing');

select * from finish();
rollback;
