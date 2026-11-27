-- Flow 07 · spec check 07-15 and 07-19.
--   07-15: the Community inbox Read together card (flow 06 rule 6, flow 07 "Read together card")
--          gets its numbers from the reader's active rooms: members who read in the last 24 hours.
--   07-19: when staff end or cancel a room, its members are told (the admin toast says so). The
--          push waits out the 10-minute Undo, so an undone end tells nobody.

-- ─── 07-15: Read together ───────────────────────────────────────────────────
-- {reading_now, people [{id, name, avatar_url}] (latest 3), books [_room_book_card], rooms}.
-- Other members of the caller's live or scheduled rooms whose room progress moved in the last
-- 24 hours; banned members and people the caller blocked are left out.
create function public.get_read_together() returns jsonb
language sql stable security definer set search_path = '' as $$
  with mine as (
    select r.group_id, r.book_id
    from public.group_members m
    join public.reading_rooms r on r.group_id = m.group_id
    where m.user_id = auth.uid() and m.banned_at is null and r.state <> 'ended'
  ), readers as (
    select p.user_id, max(p.updated_at) as at
    from public.room_member_progress p
    join mine on mine.group_id = p.room_id
    join public.group_members gm on gm.group_id = p.room_id and gm.user_id = p.user_id and gm.banned_at is null
    join public.profiles pr on pr.id = p.user_id and pr.deleted_at is null
    where p.user_id <> auth.uid() and p.updated_at > now() - interval '24 hours'
      and not public.has_blocked(auth.uid(), p.user_id)
    group by p.user_id
  ), latest as (
    select * from readers order by at desc, user_id limit 3
  )
  select jsonb_build_object(
    'reading_now', (select count(*)::int from readers),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', l.user_id, 'name', public.sender_name(l.user_id),
                                                            'avatar_url', pr.avatar_url) order by l.at desc, l.user_id)
                        from latest l join public.profiles pr on pr.id = l.user_id), '[]'::jsonb),
    'books', coalesce((select jsonb_agg(public._room_book_card(b.book_id) order by b.book_id)
                       from (select distinct book_id from mine) b), '[]'::jsonb),
    'rooms', (select count(*)::int from mine))
$$;

revoke execute on function public.get_read_together() from public, anon;
grant execute on function public.get_read_together() to authenticated;

-- ─── 07-19: tell members when staff end or cancel a room ────────────────────
alter table public.reading_rooms add column end_notified_at timestamptz;
-- Rooms that ended before this change are not announced now.
update public.reading_rooms set end_notified_at = coalesce(ended_at, now()) where state = 'ended';

-- Every minute: rooms staff ended or cancelled more than 10 minutes ago (past Undo) and not yet
-- announced. A room that hadn't started yet was cancelled. Host ends, last-member ends and idle
-- ends are not announced (the host chose it, or nobody is left). Returns rooms announced.
create function public.room_end_pushes() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_to uuid[];
  v_n int := 0;
begin
  for r in
    update public.reading_rooms rr set end_notified_at = now()
     where rr.state = 'ended' and rr.end_notified_at is null
       and rr.ended_at <= now() - interval '10 minutes'
       and rr.ended_by is not null and rr.ended_by is distinct from rr.host_id
       and public._is_active_staff(rr.ended_by)
    returning rr.group_id, rr.starts_at > rr.ended_at as cancelled,
              (select g.name from public.groups g where g.id = rr.group_id) as name
  loop
    select array_agg(gm.user_id) into v_to from public.group_members gm
     where gm.group_id = r.group_id and gm.banned_at is null;
    if v_to is null then continue; end if;
    perform public.enqueue_push('account_notice', v_to, jsonb_build_object(
      'vars', jsonb_build_object(
        'title', case when r.cancelled then r.name || ' is cancelled' else r.name || ' has ended' end,
        'body', case when r.cancelled then 'Arpedia staff cancelled this reading room.'
                     else 'Arpedia staff ended this room. You can still read the chat.' end),
      'target', jsonb_build_object('kind', 'room', 'id', r.group_id), 'group_id', r.group_id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke execute on function public.room_end_pushes() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('room_end_pushes', '* * * * *', 'select public.room_end_pushes()');
  end if;
end $$;
