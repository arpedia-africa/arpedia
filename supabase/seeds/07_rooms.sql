-- ─── Flow 07 · reading rooms ────────────────────────────────────────────────
-- Rooms as on s-rooms / s-room (admin) and s-rooms / s-room (app): two live, one scheduled, one
-- ended. Ngozi (a000-…01) is in both live rooms, so the app has rooms to show.
-- Room group ids: 00000000-0000-4000-f070-00000000000N. Books: c000-…0N (seed.sql).
-- a000-…01 Ngozi · 02 Ifeoma · 03 Tolu · 04 Kemi · 05 Chioma · 06 Musa · 07 Emeka · 08 Adaeze · 09 Halima
create temporary table seed_rooms (n int, name text, book int, host text, code text, pace public.room_pace,
  starts interval, ended interval);
insert into seed_rooms values
  (1, 'Ruth of Ibadan, chapter 9',     2, 'a000-000000000003', 'RUTH9X4K', 'three_week', interval '3 hours', null),
  (2, 'Harmattan evening read',        1, 'a000-000000000002', 'HARM27QP', 'free',       interval '2 hours', null),
  (3, 'Seven Bridges, Jos night read', 5, 'a000-000000000006', 'JSBR48HD', 'one_day',    interval '-8 hours', null),
  (4, 'A House Called Grace, finale',  3, 'a000-000000000004', 'GRAC9ZAB', 'free',       interval '20 days', interval '26 hours');

insert into public.groups (id, kind, name, owner_id, book_id, visibility, locked_until, created_at)
select ('00000000-0000-4000-f070-' || lpad(n::text, 12, '0'))::uuid, 'room', name,
       ('00000000-0000-4000-' || host)::uuid, ('00000000-0000-4000-c000-' || lpad(book::text, 12, '0'))::uuid,
       'private', case when ended is not null then 'infinity'::timestamptz end,
       now() - greatest(starts, interval '1 day')
from seed_rooms;

insert into public.reading_rooms (group_id, book_id, host_id, code, pace, join_policy, starts_at, state,
  ended_at, transcript_purge_at, last_activity_at, created_at)
select ('00000000-0000-4000-f070-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-c000-' || lpad(book::text, 12, '0'))::uuid, ('00000000-0000-4000-' || host)::uuid,
       code, pace, 'code', now() - starts,
       case when ended is not null then 'ended' when starts < interval '0' then 'scheduled' else 'live' end::public.room_state,
       now() - ended, now() - ended + interval '90 days', now() - coalesce(ended, interval '5 minutes'),
       now() - greatest(starts, interval '1 day')
from seed_rooms;

-- (room, member, percent, chapter, finished days ago)
create temporary table seed_room_members (n int, u text, pct numeric, ch int, fin int);
insert into seed_room_members values
  (1, 'a000-000000000003', 100, 18, 2), (1, 'a000-000000000001', 72, 13, null), (1, 'a000-000000000005', 92, 16, null),
  (1, 'a000-000000000009', 100, 18, 1), (1, 'a000-000000000007', 34, 6, null), (1, 'a000-000000000008', 58, 10, null),
  (2, 'a000-000000000002', 100, 14, 20), (2, 'a000-000000000001', 40, 6, null), (2, 'a000-000000000006', 21, 3, null),
  (3, 'a000-000000000006', 0, 0, null), (3, 'a000-000000000003', 0, 0, null), (3, 'a000-000000000004', 0, 0, null),
  (4, 'a000-000000000004', 100, 12, 3), (4, 'a000-000000000005', 100, 12, 2), (4, 'a000-000000000009', 75, 9, null);

-- Seeded readers are created at reset time, so the 7-day new-account rule would stop every
-- non-host from posting in a room. Make the room members established accounts.
update auth.users u set created_at = least(u.created_at, now() - interval '30 days')
where u.id in (select ('00000000-0000-4000-' || m.u)::uuid from seed_room_members m);

insert into public.group_members (group_id, user_id, role, joined_at, last_read_at)
select ('00000000-0000-4000-f070-' || lpad(m.n::text, 12, '0'))::uuid, ('00000000-0000-4000-' || m.u)::uuid,
       case when m.u = r.host then 'owner' else 'member' end::public.group_role,
       now() - greatest(r.starts, interval '1 day') + make_interval(mins => row_number() over (partition by m.n order by m.u)::int),
       now() - interval '1 hour'
from seed_room_members m join seed_rooms r on r.n = m.n;

insert into public.room_member_progress (room_id, user_id, percent, chapter_index, finished_at, updated_at)
select ('00000000-0000-4000-f070-' || lpad(n::text, 12, '0'))::uuid, ('00000000-0000-4000-' || u)::uuid,
       pct, ch, now() - make_interval(days => fin), now() - interval '20 minutes'
from seed_room_members;

-- (room, sender, minutes ago, body). Spoiler chapters come from the sender's progress (trigger).
create temporary table seed_room_messages (n int, u text, ago int, body text);
insert into seed_room_messages values
  (1, 'a000-000000000005', 47, 'Chapter 9 is where it turns. Take your time with it.'),
  (1, 'a000-000000000001', 44, 'I''m at 13 now. Please no spoilers past that!'),
  (1, 'a000-000000000009', 41, 'The letter at the end of chapter 17 though 😭'),
  (1, 'a000-000000000007', 30, 'Just started chapter 6, this room is moving fast'),
  (1, 'a000-000000000003', 12, 'Welcome Emeka! We meet here again on Sunday evening.'),
  (2, 'a000-000000000002', 90, 'Thank you for reading with me. Ask me anything as you go.'),
  (2, 'a000-000000000001', 60, 'Chapter 6 made me call my mother.'),
  (4, 'a000-000000000004', 1700, 'We finished! Thank you all for reading with me.'),
  (4, 'a000-000000000005', 1650, 'Best ending this year. See you in the next room.');

insert into public.messages (id, group_id, sender_id, client_id, kind, body, created_at)
select public.uuid7(now() - make_interval(mins => ago)), ('00000000-0000-4000-f070-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-' || u)::uuid, gen_random_uuid(), 'text', body, now() - make_interval(mins => ago)
from seed_room_messages;
update public.groups g set last_message_at = (select max(created_at) from public.messages m where m.group_id = g.id)
where g.kind = 'room';

drop table seed_rooms, seed_room_members, seed_room_messages;
