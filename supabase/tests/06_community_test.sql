-- Flow 06 · community: RLS on messages, group_members, user_blocks; DMs; persist_messages
-- idempotency; get_group_access (locked, muted, banned, non-member); reports and blocks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- Ada (member), Bola (member), Cy (outsider), Dee (banned), Eve (DM partner of Ada), staff Sam.
insert into auth.users (id, email, raw_user_meta_data) values
  ('60000000-0000-4000-a000-000000000001', 'ada6@test.local', '{"full_name":"Ada Six"}'),
  ('60000000-0000-4000-a000-000000000002', 'bola6@test.local', '{"full_name":"Bola Six"}'),
  ('60000000-0000-4000-a000-000000000003', 'cy6@test.local', '{"full_name":"Cy Six"}'),
  ('60000000-0000-4000-a000-000000000004', 'dee6@test.local', '{"full_name":"Dee Six"}'),
  ('60000000-0000-4000-a000-000000000005', 'eve6@test.local', '{"full_name":"Eve Six"}'),
  ('60000000-0000-4000-a000-000000000006', 'sam6@test.local', '{"full_name":"Sam Staff"}');
insert into public.staff_roles (user_id, role) values ('60000000-0000-4000-a000-000000000006', 'moderator');

insert into public.groups (id, kind, name, visibility, owner_id) values
  ('60000000-0000-4000-d000-000000000001', 'club', 'Test Club', 'private', '60000000-0000-4000-a000-000000000001'),
  ('60000000-0000-4000-d000-000000000002', 'dm', 'Ada and Eve', 'private', null),
  ('60000000-0000-4000-d000-000000000003', 'club', 'Open Club', 'public', '60000000-0000-4000-a000-000000000002');
insert into public.group_members (group_id, user_id, role, banned_at) values
  ('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000001', 'owner', null),
  ('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000002', 'member', null),
  ('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000004', 'member', now()),
  ('60000000-0000-4000-d000-000000000002', '60000000-0000-4000-a000-000000000001', 'member', null),
  ('60000000-0000-4000-d000-000000000002', '60000000-0000-4000-a000-000000000005', 'member', null),
  ('60000000-0000-4000-d000-000000000003', '60000000-0000-4000-a000-000000000002', 'owner', null);

select is((select member_count from public.groups where id = '60000000-0000-4000-d000-000000000001'), 2,
  'member_count counts members, not banned rows');

-- ─── persist_messages (service role) ────────────────────────────────────────
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is((select jsonb_agg(e ->> 'status') from jsonb_array_elements(public.persist_messages(jsonb_build_array(
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000001', 'sender_id', '60000000-0000-4000-a000-000000000002',
      'client_id', '6c000000-0000-4000-8000-000000000001', 'body', 'Hello club'),
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000001', 'sender_id', '60000000-0000-4000-a000-000000000001',
      'client_id', '6c000000-0000-4000-8000-000000000002', 'body', 'Welcome Bola'),
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000002', 'sender_id', '60000000-0000-4000-a000-000000000005',
      'client_id', '6c000000-0000-4000-8000-000000000003', 'body', 'Private hello'),
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000001', 'sender_id', '60000000-0000-4000-a000-000000000003',
      'client_id', '6c000000-0000-4000-8000-000000000004', 'body', 'I am not a member'),
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000001', 'sender_id', '60000000-0000-4000-a000-000000000004',
      'client_id', '6c000000-0000-4000-8000-000000000005', 'body', 'I am banned'),
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000001', 'sender_id', '60000000-0000-4000-a000-000000000002',
      'client_id', '6c000000-0000-4000-8000-000000000006', 'body', 'bad word here', 'state', 'auto_hidden')
  ))) e),
  '["stored", "stored", "stored", "rejected", "rejected", "stored"]'::jsonb,
  'persist_messages stores members and rejects a non-member and a banned user');

select is((select public.persist_messages(jsonb_build_array(
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000001', 'sender_id', '60000000-0000-4000-a000-000000000002',
      'client_id', '6c000000-0000-4000-8000-000000000001', 'body', 'Hello club (retry)'))) -> 0 ->> 'status'),
  'duplicate', 'a retried client_id is a duplicate');
select is((select count(*)::int from public.messages where client_id = '6c000000-0000-4000-8000-000000000001'), 1,
  'a retry never posts twice');
select is((select body from public.messages where client_id = '6c000000-0000-4000-8000-000000000001'), 'Hello club',
  'the first send wins');
select is((select count(*)::int from public.reports where content_id =
    (select id from public.messages where client_id = '6c000000-0000-4000-8000-000000000006') and status = 'auto_hidden'),
  1, 'an auto-hidden message opens an automatic report');
select throws_ok($$ insert into public.messages (group_id, sender_id, client_id, body)
  values ('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000002', gen_random_uuid(), 'x') $$,
  '42501', null, 'the service role cannot insert messages directly');

-- ─── get_group_access ───────────────────────────────────────────────────────
select is(public.get_group_access('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000002') ->> 'access',
  'ok', 'member: ok');
select is(public.get_group_access('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000003') ->> 'access',
  'not_member', 'outsider of a private group: not_member');
select is(public.get_group_access('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000004') ->> 'access',
  'banned', 'banned member: banned');
select is(public.get_group_access('60000000-0000-4000-d000-000000000003', '60000000-0000-4000-a000-000000000003') ->> 'access',
  'preview', 'outsider of a public group: preview');
reset role;
update public.groups set locked_until = now() + interval '1 hour' where id = '60000000-0000-4000-d000-000000000001';
select is(public.get_group_access('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000002') ->> 'post_block',
  'locked', 'locked group: post_block locked');
update public.groups set locked_until = null where id = '60000000-0000-4000-d000-000000000001';
update public.group_members set muted_until = now() + interval '1 day'
  where group_id = '60000000-0000-4000-d000-000000000001' and user_id = '60000000-0000-4000-a000-000000000002';
select is(public.get_group_access('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000002') ->> 'post_block',
  'muted', 'muted member: post_block muted');
select is((select public.persist_messages(jsonb_build_array(
    jsonb_build_object('group_id', '60000000-0000-4000-d000-000000000001', 'sender_id', '60000000-0000-4000-a000-000000000002',
      'client_id', gen_random_uuid(), 'body', 'while muted'))) -> 0 ->> 'reason'),
  'muted', 'persist re-checks the mute even if the DO cache is stale');
update public.group_members set muted_until = null
  where group_id = '60000000-0000-4000-d000-000000000001' and user_id = '60000000-0000-4000-a000-000000000002';
update public.groups set who_can_post = 'staff' where id = '60000000-0000-4000-d000-000000000001';
select is(public.get_group_access('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000002') ->> 'post_block',
  'staff_only', 'staff-only channel: post_block staff_only');
update public.groups set who_can_post = 'members' where id = '60000000-0000-4000-d000-000000000001';

-- ─── RLS as readers ─────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000001'), 0,
  'non-member reads no messages of a private group');
select is((select count(*)::int from public.group_members where group_id = '60000000-0000-4000-d000-000000000001'), 0,
  'non-member reads no members of a private group');
select throws_ok($$ select * from public.get_messages('60000000-0000-4000-d000-000000000001') $$,
  '42501', 'not_member', 'get_messages refuses a non-member of a private group');
select lives_ok($$ select * from public.get_messages('60000000-0000-4000-d000-000000000003') $$,
  'get_messages previews a public group for a non-member');
select throws_ok($$ select public.mark_read('60000000-0000-4000-d000-000000000001') $$,
  '42501', 'not_member', 'mark_read is member only');
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000002'), 0,
  'an outsider cannot read a DM');
select throws_ok($$ insert into public.messages (group_id, sender_id, client_id, body)
  values ('60000000-0000-4000-d000-000000000001', '60000000-0000-4000-a000-000000000003', gen_random_uuid(), 'x') $$,
  '42501', null, 'clients cannot insert messages');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000001'), 0,
  'a banned member reads no messages');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000001'), 2,
  'member reads the visible messages (not the auto-hidden one)');
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000002'), 1,
  'a DM member reads the DM');
select throws_ok($$ update public.group_members set role = 'owner'
  where group_id = '60000000-0000-4000-d000-000000000001' and user_id = '60000000-0000-4000-a000-000000000001' $$,
  '42501', null, 'members cannot change their role');
select lives_ok($$ update public.group_members set last_read_at = now()
  where group_id = '60000000-0000-4000-d000-000000000001' and user_id = '60000000-0000-4000-a000-000000000001' $$,
  'members update their own last_read_at');

-- Blocks: Ada blocks Bola → Bola's messages disappear for Ada only.
select is(public.block_user('60000000-0000-4000-a000-000000000002', '60000000-0000-4000-d000-000000000001') is not null,
  true, 'block_user returns the block date');
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000001'), 1,
  'a blocked person''s messages are hidden from the blocker');
select throws_ok($$ select public.block_user('60000000-0000-4000-a000-000000000006') $$,
  '42501', 'not_blockable', 'staff are never blockable');
select throws_ok($$ select public.block_user('60000000-0000-4000-a000-000000000001') $$,
  '42501', 'not_blockable', 'you cannot block yourself');
select is((select source_name from public.get_blocked()), 'Test Club', 'blocked list shows where it happened');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.user_blocks), 0, 'the blocked person cannot see the block');
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000001'), 2,
  'the blocked person still reads the group');

-- Report: Bola reports Ada's message; it disappears for Bola; a second report is refused.
select set_config('t.m2', (select id::text from public.messages
  where client_id = '6c000000-0000-4000-8000-000000000002'), true) is not null as remembered;
select ok(public.report_message(current_setting('t.m2')::uuid, 'harassment', 'Rude', false) like 'RPT-%',
  'report_message returns a reference');
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000001'), 1,
  'the reported message is hidden for the reporter');
select throws_ok($$ select public.report_message(current_setting('t.m2')::uuid, 'spam') $$,
  '23505', 'already_reported', 'one report per person per message');

-- The Worker passes the group it routed to; a message from another group is refused before any write.
select throws_ok($$ select public.react((select id from public.messages
    where client_id = '6c000000-0000-4000-8000-000000000003'), '🔥', '60000000-0000-4000-d000-0000000000ff') $$,
  'P0002', 'not_found', 'react refuses a message from another group');

-- Delete: only the sender; text kept for the open report.
select throws_ok($$ select public.delete_message((select id from public.messages
    where client_id = '6c000000-0000-4000-8000-000000000003')) $$,
  '42501', 'not_allowed', 'nobody deletes someone else''s message');
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok($$ select public.delete_message((select id from public.messages
    where client_id = '6c000000-0000-4000-8000-000000000002')) $$, 'the sender deletes their own message');
reset role;
select is((select r.body from public.message_retained r join public.messages m on m.id = r.message_id
    where m.client_id = '6c000000-0000-4000-8000-000000000002'), 'Welcome Bola',
  'a deleted message with an open report keeps its text for moderators');

-- A sender can't turn a moderator's removal into their own delete.
update public.messages set state = 'removed', state_changed_at = now()
 where client_id = '6c000000-0000-4000-8000-000000000003';
select set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub',
  (select sender_id from public.messages where client_id = '6c000000-0000-4000-8000-000000000003'))::text, true);
set local role authenticated;
select throws_ok($$ select public.delete_message((select id from public.messages
    where client_id = '6c000000-0000-4000-8000-000000000003')) $$,
  '42501', 'not_allowed', 'a removed message can''t be deleted by its sender');
reset role;
select is((select state::text from public.messages where client_id = '6c000000-0000-4000-8000-000000000003'),
  'removed', 'the removal stands');

-- Helpers with a free user argument stay server-side; policies use the caller-bound ones.
select ok(not has_function_privilege('authenticated', 'public.has_blocked(uuid, uuid)', 'execute'),
  'readers can''t ask whether someone blocked them');
select ok(not has_function_privilege('authenticated', 'public.is_group_member(uuid, uuid)', 'execute'),
  'readers can''t probe other people''s memberships');
select ok(has_function_privilege('authenticated', 'public.am_group_member(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.i_blocked(uuid)', 'execute'),
  'caller-bound helpers are available to policies');

-- Staff lock and mute change one field each, so a stale page can't undo the other.
update public.groups set muted_until = now() + interval '1 day' where id = '60000000-0000-4000-d000-000000000001';
select set_config('request.jwt.claims', jsonb_build_object('sub', '60000000-0000-4000-a000-000000000006',
  'role', 'authenticated', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
  'timestamp', extract(epoch from now())::bigint)))::text, true);
set local role authenticated;
select lives_ok($$ select public.admin_set_channel_state('60000000-0000-4000-d000-000000000001', 'lock',
    now() + interval '1 hour') $$, 'a moderator locks the chat');
reset role;
select ok((select locked_until > now() and muted_until > now() from public.groups
    where id = '60000000-0000-4000-d000-000000000001'), 'locking keeps the existing channel mute');

-- A removed message's text is out of reach of a direct table read.
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.messages where group_id = '60000000-0000-4000-d000-000000000002'), 0,
  'members can''t read a removed message from the table');

-- mark_read with a live message the DO hasn't written yet uses the time inside its uuid7.
reset role;
update public.group_members set last_read_at = now() - interval '1 day'
 where group_id = '60000000-0000-4000-d000-000000000001' and user_id = '60000000-0000-4000-a000-000000000001';
set local role authenticated;
select lives_ok($$ select public.mark_read('60000000-0000-4000-d000-000000000001',
    public.uuid7(now() - interval '1 hour')) $$, 'mark_read takes a message not yet in Postgres');
reset role;
select ok((select last_read_at between now() - interval '61 minutes' and now() - interval '59 minutes'
    from public.group_members where group_id = '60000000-0000-4000-d000-000000000001'
      and user_id = '60000000-0000-4000-a000-000000000001'), 'read up to that message''s send time');

-- Leaving and rejoining doesn't clear a moderator's mute.
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.join_group('60000000-0000-4000-d000-000000000003');
reset role;
update public.group_members set muted_until = now() + interval '1 day'
 where group_id = '60000000-0000-4000-d000-000000000003' and user_id = '60000000-0000-4000-a000-000000000003';
set local role authenticated;
select public.leave_group('60000000-0000-4000-d000-000000000003');
select public.join_group('60000000-0000-4000-d000-000000000003');
reset role;
select ok((select muted_until > now() from public.group_members
    where group_id = '60000000-0000-4000-d000-000000000003' and user_id = '60000000-0000-4000-a000-000000000003'),
  'a mute survives leaving and rejoining');

select * from finish();
rollback;
