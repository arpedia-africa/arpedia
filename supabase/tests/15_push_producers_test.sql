-- Flow 15 · push producers (spec check 15-1, 06-1, 07-8, 08-9, 08-10): chat messages, author DM
-- replies, new author posts, room starts and room finishes each put a push on push_fanout, to the
-- right people, once.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Ada (author, club owner), Bola and Chidi (members), Dayo (follower who has the chat open).
insert into auth.users (id, email, raw_user_meta_data) values
  ('15a00000-0000-4000-a000-000000000001', 'ada@t15a.local', '{"full_name":"Ada Eze"}'),
  ('15a00000-0000-4000-a000-000000000002', 'bola@t15a.local', '{"full_name":"Bola Ade"}'),
  ('15a00000-0000-4000-a000-000000000003', 'chidi@t15a.local', '{"full_name":"Chidi Okafor"}'),
  ('15a00000-0000-4000-a000-000000000004', 'dayo@t15a.local', '{"full_name":"Dayo Bello"}');
insert into public.books (id, author_id, title, status) values
  ('15a00000-0000-4000-b000-000000000001', '15a00000-0000-4000-a000-000000000001', 'Harmattan', 'live');
insert into public.groups (id, kind, name, owner_id, visibility) values
  ('15a00000-0000-4000-c000-000000000001', 'club', 'Grace Readers', '15a00000-0000-4000-a000-000000000001', 'public'),
  ('15a00000-0000-4000-c000-000000000002', 'dm', 'Bola and Ada', '15a00000-0000-4000-a000-000000000001', 'private'),
  ('15a00000-0000-4000-c000-000000000003', 'room', 'Night owls', '15a00000-0000-4000-a000-000000000002', 'private');
insert into public.group_members (group_id, user_id, role) values
  ('15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000001', 'owner'),
  ('15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000002', 'member'),
  ('15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000003', 'member'),
  ('15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000004', 'member'),
  ('15a00000-0000-4000-c000-000000000002', '15a00000-0000-4000-a000-000000000001', 'owner'),
  ('15a00000-0000-4000-c000-000000000002', '15a00000-0000-4000-a000-000000000002', 'member'),
  ('15a00000-0000-4000-c000-000000000003', '15a00000-0000-4000-a000-000000000002', 'owner'),
  ('15a00000-0000-4000-c000-000000000003', '15a00000-0000-4000-a000-000000000003', 'member');

create function pg_temp.pushes(p_type text) returns setof jsonb
language sql as $$
  select q.message from pgmq.q_push_fanout q
  where q.message ->> 'type' = p_type
    and (q.message #>> '{data,group_id}' like '15a00000-%' or q.message #>> '{data,actor_id}' like '15a00000-%')
  order by q.msg_id
$$;
create function pg_temp.to(m jsonb) returns text[]
language sql as $$ select array(select jsonb_array_elements_text(m -> 'user_ids') order by 1) $$;

-- ─── chat_pushes ────────────────────────────────────────────────────────────
-- Club: Chidi says hello, then Bola replies to Chidi and mentions Dayo; one hidden message.
insert into public.messages (id, group_id, sender_id, client_id, kind, body, reply_to_id, state, created_at) values
  ('15a00000-0000-4000-d000-000000000001', '15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000003',
   gen_random_uuid(), 'text', 'Hello all', null, 'visible', now() - interval '3 seconds'),
  ('15a00000-0000-4000-d000-000000000002', '15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000002',
   gen_random_uuid(), 'text', 'Agreed @dayo', '15a00000-0000-4000-d000-000000000001', 'visible', now() - interval '2 seconds'),
  ('15a00000-0000-4000-d000-000000000003', '15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000002',
   gen_random_uuid(), 'text', 'hidden words', null, 'auto_hidden', now() - interval '1 second'),
  ('15a00000-0000-4000-d000-000000000004', '15a00000-0000-4000-c000-000000000002', '15a00000-0000-4000-a000-000000000001',
   gen_random_uuid(), 'text', 'Thank you for reading!', null, 'visible', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"15a00000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.chat_pushes(array['15a00000-0000-4000-d000-000000000001'::uuid]) $$, '42501', null,
  'readers cannot make pushes');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(public.chat_pushes(array['15a00000-0000-4000-d000-000000000001', '15a00000-0000-4000-d000-000000000002',
                                   '15a00000-0000-4000-d000-000000000003', '15a00000-0000-4000-d000-000000000004']::uuid[],
                             array['15a00000-0000-4000-a000-000000000004']::uuid[]),
  2, 'one club push for the latest message and one DM reply (the first message mentions nobody, hidden ones never push)');
select is(pg_temp.to((select m from pg_temp.pushes('club_message') m limit 1)),
  array['15a00000-0000-4000-a000-000000000001', '15a00000-0000-4000-a000-000000000003', '15a00000-0000-4000-a000-000000000004'],
  'every member but the sender');
select is((select m from pg_temp.pushes('club_message') m limit 1) #> '{data,mention_ids}',
  '["15a00000-0000-4000-a000-000000000003", "15a00000-0000-4000-a000-000000000004"]'::jsonb,
  'the person replied to and the @mention are flagged');
select is((select m from pg_temp.pushes('club_message') m limit 1) #> '{data,open_ids}',
  '["15a00000-0000-4000-a000-000000000004"]'::jsonb, 'readers with the chat open are passed on');
select is((select m from pg_temp.pushes('club_message') m limit 1) #>> '{data,vars,sender}', 'Bola Ade', 'sender name');
select is((select m from pg_temp.pushes('club_message') m limit 1) #>> '{data,target,kind}', 'group', 'tap opens the group');
select is(pg_temp.to((select m from pg_temp.pushes('author_reply') m)),
  array['15a00000-0000-4000-a000-000000000002'], 'the author''s DM reply goes to the reader');

-- Two messages in a row: the mentioned reader gets the earlier one, the rest only the latest.
insert into public.messages (id, group_id, sender_id, client_id, kind, body, state, created_at) values
  ('15a00000-0000-4000-d000-000000000005', '15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000002',
   gen_random_uuid(), 'text', '@Chidi look', 'visible', now() + interval '1 second'),
  ('15a00000-0000-4000-d000-000000000006', '15a00000-0000-4000-c000-000000000001', '15a00000-0000-4000-a000-000000000002',
   gen_random_uuid(), 'text', 'anyone?', 'visible', now() + interval '2 seconds');
select is(public.chat_pushes(array['15a00000-0000-4000-d000-000000000005', '15a00000-0000-4000-d000-000000000006']::uuid[]),
  2, 'a mention push and a latest-message push');
select is(pg_temp.to((select m from pg_temp.pushes('club_message') m offset 1 limit 1)),
  array['15a00000-0000-4000-a000-000000000003'], 'the mention goes only to Chidi');
select is(pg_temp.to((select m from pg_temp.pushes('club_message') m offset 2 limit 1)),
  array['15a00000-0000-4000-a000-000000000001', '15a00000-0000-4000-a000-000000000004'],
  'the latest message goes to the others, never twice to Chidi');

-- ─── author_new_post ────────────────────────────────────────────────────────
insert into public.follows (follower_id, followee_id) values
  ('15a00000-0000-4000-a000-000000000002', '15a00000-0000-4000-a000-000000000001'),
  ('15a00000-0000-4000-a000-000000000003', '15a00000-0000-4000-a000-000000000001');
insert into public.author_posts (id, author_id, title, body, state) values
  ('15a00000-0000-4000-e000-000000000001', '15a00000-0000-4000-a000-000000000001', 'A new chapter', 'Body', 'draft');
select is((select count(*)::int from pg_temp.pushes('author_new_post')), 0, 'a draft pushes nothing');
update public.author_posts set state = 'published', published_at = now() where id = '15a00000-0000-4000-e000-000000000001';
select is(pg_temp.to((select m from pg_temp.pushes('author_new_post') m)),
  array['15a00000-0000-4000-a000-000000000002', '15a00000-0000-4000-a000-000000000003'], 'publishing pushes to followers');
select is((select m from pg_temp.pushes('author_new_post') m) #>> '{data,target,id}', '15a00000-0000-4000-e000-000000000001',
  'tap opens the post');
update public.author_posts set state = 'removed' where id = '15a00000-0000-4000-e000-000000000001';
update public.author_posts set state = 'published' where id = '15a00000-0000-4000-e000-000000000001';
select is((select count(*)::int from pg_temp.pushes('author_new_post')), 1, 'a post restored after moderation is not news');

-- ─── room_finished and room_starting ────────────────────────────────────────
insert into public.reading_rooms (group_id, book_id, host_id, code, state, starts_at, created_at) values
  ('15a00000-0000-4000-c000-000000000003', '15a00000-0000-4000-b000-000000000001', '15a00000-0000-4000-a000-000000000002',
   'ABCDEFGH', 'scheduled', now() + interval '10 minutes', now() - interval '1 day');
insert into public.room_member_progress (room_id, user_id, percent) values
  ('15a00000-0000-4000-c000-000000000003', '15a00000-0000-4000-a000-000000000002', 50),
  ('15a00000-0000-4000-c000-000000000003', '15a00000-0000-4000-a000-000000000003', 50);
update public.room_member_progress set percent = 100, finished_at = now()
 where room_id = '15a00000-0000-4000-c000-000000000003' and user_id = '15a00000-0000-4000-a000-000000000003';
update public.room_member_progress set percent = 100, finished_at = now()
 where room_id = '15a00000-0000-4000-c000-000000000003' and user_id = '15a00000-0000-4000-a000-000000000003';
select is(pg_temp.to((select m from pg_temp.pushes('room_finished') m)),
  array['15a00000-0000-4000-a000-000000000002'], 'finishing tells the other members, once');

select is(public.room_start_pushes(), 1, 'a room starting within 15 minutes is announced');
select is(pg_temp.to((select m from pg_temp.pushes('room_starting') m)),
  array['15a00000-0000-4000-a000-000000000003'], 'to members, not the host');
select is(public.room_start_pushes(), 0, 'only once');

select * from finish();
rollback;
