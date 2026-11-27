-- Flow 07 · spec check 07-15 (Read together numbers) and 07-19 (members are told when staff end
-- or cancel a room, once the 10-minute Undo has passed).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 1 me · 2 friend reading today · 3 friend who read 2 days ago · 4 someone I blocked · 5 author
-- · 6 staff · 7 member of a room that ended.
insert into auth.users (id, email, raw_user_meta_data, created_at)
select ('70150000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t715.local',
       jsonb_build_object('full_name', (array['Me', 'Friend Today', 'Friend Old', 'Blocked', 'Author', 'Staff', 'Gone'])[n]),
       now() - interval '30 days'
from generate_series(1, 7) n;
insert into public.staff_roles (user_id, role) values ('70150000-0000-4000-a000-000000000006', 'moderator');
insert into public.user_blocks (blocker_id, blocked_id) values
  ('70150000-0000-4000-a000-000000000001', '70150000-0000-4000-a000-000000000004');
insert into public.books (id, author_id, title, status) values
  ('70150000-0000-4000-b000-000000000001', '70150000-0000-4000-a000-000000000005', 'Room Book', 'live'),
  ('70150000-0000-4000-b000-000000000002', '70150000-0000-4000-a000-000000000005', 'Other Book', 'live');

-- Rooms: 1 live (mine) · 2 ended (mine) · 3 live, staff end · 4 scheduled, staff cancel
-- · 5 live, staff end 2 minutes ago · 6 live, host end.
insert into public.groups (id, kind, name, owner_id, book_id, visibility)
select ('70150000-0000-4000-f000-00000000000' || n)::uuid, 'room', 'Room number ' || n,
       '70150000-0000-4000-a000-000000000001', ('70150000-0000-4000-b000-00000000000' || case when n = 2 then 2 else 1 end)::uuid,
       'private'
from generate_series(1, 6) n;
insert into public.reading_rooms (group_id, book_id, host_id, code, starts_at, state)
select ('70150000-0000-4000-f000-00000000000' || n)::uuid,
       ('70150000-0000-4000-b000-00000000000' || case when n = 2 then 2 else 1 end)::uuid,
       '70150000-0000-4000-a000-000000000001', 'TQRM' || chr(64 + n) || 'BCD',
       case when n = 4 then now() + interval '1 day' else now() - interval '1 day' end,
       case when n = 4 then 'scheduled' else 'live' end::public.room_state
from generate_series(1, 6) n;
insert into public.group_members (group_id, user_id, role)
select ('70150000-0000-4000-f000-00000000000' || r)::uuid, ('70150000-0000-4000-a000-00000000000' || u)::uuid,
       case when u = 1 then 'owner' else 'member' end::public.group_role
from (values (1, 1), (1, 2), (1, 3), (1, 4), (2, 1), (2, 7), (3, 1), (3, 2), (4, 1), (4, 3), (5, 1), (6, 1), (6, 2)) v(r, u);
insert into public.room_member_progress (room_id, user_id, percent, chapter_index, updated_at) values
  ('70150000-0000-4000-f000-000000000001', '70150000-0000-4000-a000-000000000001', 20, 2, now()),
  ('70150000-0000-4000-f000-000000000001', '70150000-0000-4000-a000-000000000002', 40, 4, now() - interval '1 hour'),
  ('70150000-0000-4000-f000-000000000001', '70150000-0000-4000-a000-000000000003', 10, 1, now() - interval '2 days'),
  ('70150000-0000-4000-f000-000000000001', '70150000-0000-4000-a000-000000000004', 30, 3, now()),
  ('70150000-0000-4000-f000-000000000002', '70150000-0000-4000-a000-000000000007', 90, 9, now());
update public.reading_rooms set state = 'ended', ended_at = now() - interval '1 day'
 where group_id = '70150000-0000-4000-f000-000000000002';

-- ─── 07-15 ──────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"70150000-0000-4000-a000-000000000001","role":"authenticated"}', true);
create temporary table rt as select public.get_read_together() as j;
select is((select (j ->> 'reading_now')::int from rt), 1,
  'one friend read today (not me, not someone I blocked, not a 2-day-old read, not an ended room)');
select is((select j -> 'people' -> 0 ->> 'name' from rt), 'Friend Today', 'and the card shows who');
select is((select (j ->> 'rooms')::int from rt), 5, 'five of my rooms are live or scheduled');
select is((select jsonb_array_length(j -> 'books') from rt), 1, 'one book across them, once');
select is((select j -> 'books' -> 0 ->> 'title' from rt), 'Room Book', 'the ended room''s book is left out');
select set_config('request.jwt.claims', '', true);

-- ─── 07-19 ──────────────────────────────────────────────────────────────────
update public.reading_rooms set end_notified_at = now() where state = 'ended' and end_notified_at is null;
update public.reading_rooms
   set state = 'ended', ended_at = now() - case when group_id = '70150000-0000-4000-f000-000000000005'
                                              then interval '2 minutes' else interval '11 minutes' end,
       ended_by = case when group_id = '70150000-0000-4000-f000-000000000006'
                       then '70150000-0000-4000-a000-000000000001' else '70150000-0000-4000-a000-000000000006' end::uuid
 where group_id in ('70150000-0000-4000-f000-000000000003', '70150000-0000-4000-f000-000000000004',
                    '70150000-0000-4000-f000-000000000005', '70150000-0000-4000-f000-000000000006');

select is(public.room_end_pushes(), 2, 'staff end and cancel past the Undo window are announced');
select is(public.room_end_pushes(), 0, 'once');
create temporary table pushed as
  select message from pgmq.q_push_fanout where message -> 'data' ->> 'group_id' like '70150000-%';
select is((select message -> 'data' -> 'vars' ->> 'title' from pushed
           where message -> 'data' ->> 'group_id' = '70150000-0000-4000-f000-000000000003'),
  'Room number 3 has ended', 'an ended room says so');
select is((select message -> 'data' -> 'vars' ->> 'title' from pushed
           where message -> 'data' ->> 'group_id' = '70150000-0000-4000-f000-000000000004'),
  'Room number 4 is cancelled', 'a room that had not started is cancelled');
select ok((select message -> 'user_ids' @> '["70150000-0000-4000-a000-000000000001", "70150000-0000-4000-a000-000000000002"]'::jsonb
           from pushed where message -> 'data' ->> 'group_id' = '70150000-0000-4000-f000-000000000003'),
  'the host and the readers are told');
select is((select count(*)::int from pushed where message -> 'data' ->> 'group_id' in
            ('70150000-0000-4000-f000-000000000005', '70150000-0000-4000-f000-000000000006')), 0,
  'not inside the Undo window, and not when the host ended it');
update public.reading_rooms set ended_at = now() - interval '11 minutes'
 where group_id = '70150000-0000-4000-f000-000000000005';
select is(public.room_end_pushes(), 1, 'the recent one is announced after its Undo window');

select * from finish();
rollback;
