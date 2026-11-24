-- Flow 15 · spec check 15-1 (with 06-1, 07-8, 08-9, 08-10): producers for the push types nothing
-- enqueued. Each one calls enqueue_push, so the push-dispatcher applies push types, preferences,
-- group mutes, blocks, author batching, quiet hours and the in-app feed as for every push.
--   club_message  chat messages (the chat Durable Object calls chat_pushes after persisting)
--   author_reply  the author answering in a paid DM thread (same path)
--   author_new_post  a post goes live (trigger on author_posts)
--   room_starting 15 minutes before a scheduled reading room (cron, room_start_pushes)
--   room_finished a room member finishes the book (trigger on room_member_progress)
-- note_reply has no producer yet: notes can't be shared or replied to (04-10, 07-4).

-- ─── Chat: club_message and author_reply ────────────────────────────────────
-- Called by the chat DO with the ids it just stored (status stored, state visible) and the
-- members who have this chat open (they aren't pushed, rule 5). Per group in the batch:
-- readers mentioned (@first name) or replied to get a push for that message; everyone else gets
-- one push for the latest message (the device folds a group's pushes into one notification).
-- In a DM thread (kind dm) only the author can post through the DO: the reader gets author_reply.
create function public.chat_pushes(p_message_ids uuid[], p_open uuid[] default '{}') returns int
language plpgsql security definer set search_path = '' as $$
declare
  m record;
  v_targets uuid[];
  v_mentions uuid[];
  v_pushed uuid[];
  v_last uuid;
  v_n int := 0;
begin
  perform public._require_service('chat_pushes');
  for m in
    select x.id, x.group_id, x.sender_id, coalesce(x.body, x.quote ->> 'text', '') preview,
           r.sender_id reply_sender, g.kind, g.name group_name, g.owner_id,
           public.sender_name(x.sender_id) sender,
           row_number() over (partition by x.group_id order by x.created_at desc, x.id desc) = 1 is_last
    from public.messages x
    join public.groups g on g.id = x.group_id and g.archived_at is null
    left join public.messages r on r.id = x.reply_to_id
    where x.id = any(coalesce(p_message_ids, '{}')) and x.state = 'visible' and x.kind <> 'system'
    order by x.group_id, x.created_at, x.id
  loop
    if m.kind = 'dm' then
      if m.sender_id is distinct from m.owner_id then continue; end if;
      select array_agg(gm.user_id) into v_targets from public.group_members gm
       where gm.group_id = m.group_id and gm.user_id <> m.sender_id and gm.banned_at is null;
      if v_targets is null then continue; end if;
      perform public.enqueue_push('author_reply', v_targets, jsonb_build_object(
        'vars', jsonb_build_object('author', public._author_pen_name(m.sender_id), 'preview', m.preview),
        'target', jsonb_build_object('kind', 'group', 'id', m.group_id),
        'group_id', m.group_id, 'actor_id', m.sender_id, 'open_ids', to_jsonb(coalesce(p_open, '{}'))));
      v_n := v_n + 1;
      continue;
    end if;

    if v_last is distinct from m.group_id then
      v_last := m.group_id;
      v_pushed := '{}';
    end if;
    -- Mentions: "@Amaka" matches members whose first name is Amaka; a reply mentions its author.
    select coalesce(array_agg(gm.user_id order by gm.user_id), '{}') into v_mentions from public.group_members gm
     where gm.group_id = m.group_id and gm.user_id <> m.sender_id and gm.banned_at is null
       and (gm.user_id = m.reply_sender
            or (position('@' in m.preview) > 0
                and m.preview ilike '%@' || split_part(public.sender_name(gm.user_id), ' ', 1) || '%'));
    if m.is_last then
      select array_agg(gm.user_id) into v_targets from public.group_members gm
       where gm.group_id = m.group_id and gm.user_id <> m.sender_id and gm.banned_at is null
         and not gm.user_id = any(v_pushed);
    else
      v_targets := nullif(array(select u from unnest(v_mentions) u where not u = any(v_pushed)), '{}');
    end if;
    if v_targets is null then continue; end if;
    perform public.enqueue_push('club_message', v_targets, jsonb_build_object(
      'vars', jsonb_build_object('group_name', m.group_name, 'sender', m.sender, 'preview', m.preview),
      'target', jsonb_build_object('kind', case when m.kind = 'room' then 'room' else 'group' end, 'id', m.group_id),
      'group_id', m.group_id, 'actor_id', m.sender_id,
      'mention_ids', to_jsonb(v_mentions), 'open_ids', to_jsonb(coalesce(p_open, '{}'))));
    v_pushed := v_pushed || v_targets;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ─── author_new_post: a post goes live ──────────────────────────────────────
-- Only the first publish (published_at newly set): a post restored after moderation isn't news.
create function public.author_post_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_fans uuid[];
begin
  if new.state <> 'published' or new.published_at is null
     or (tg_op = 'UPDATE' and old.published_at is not null) then
    return null;
  end if;
  select array_agg(f.follower_id) into v_fans from (
    select fo.follower_id from public.follows fo
    where fo.followee_id = new.author_id and fo.follower_id <> new.author_id limit 10000) f;
  if v_fans is not null then
    perform public.enqueue_push('author_new_post', v_fans, jsonb_build_object(
      'vars', jsonb_build_object('author', public._author_pen_name(new.author_id), 'preview', new.title),
      'target', jsonb_build_object('kind', 'post', 'id', new.id), 'actor_id', new.author_id));
  end if;
  return null;
end $$;
create trigger author_posts_push after insert or update of state, published_at on public.author_posts
  for each row execute function public.author_post_push();

-- ─── room_finished: a member finishes the room's book ───────────────────────
create function public.room_finished_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_to uuid[];
begin
  if old.finished_at is not null or new.finished_at is null then return null; end if;
  select g.name, b.title into r from public.reading_rooms rr
    join public.groups g on g.id = rr.group_id join public.books b on b.id = rr.book_id
   where rr.group_id = new.room_id and rr.state <> 'ended';
  if not found then return null; end if;
  select array_agg(gm.user_id) into v_to from public.group_members gm
   where gm.group_id = new.room_id and gm.user_id <> new.user_id and gm.banned_at is null;
  if v_to is not null then
    perform public.enqueue_push('room_finished', v_to, jsonb_build_object(
      'vars', jsonb_build_object('sender', public.sender_name(new.user_id), 'book_title', r.title,
                                 'room_name', r.name),
      'target', jsonb_build_object('kind', 'room', 'id', new.room_id),
      'group_id', new.room_id, 'actor_id', new.user_id));
  end if;
  return null;
end $$;
create trigger room_member_progress_finished_push after update of finished_at on public.room_member_progress
  for each row execute function public.room_finished_push();

-- ─── room_starting: 15 minutes before a scheduled room ──────────────────────
alter table public.reading_rooms add column start_notified_at timestamptz;

-- Every minute. Rooms scheduled less than 15 minutes ahead at creation are never told
-- "starts in 15 minutes"; the host isn't told about their own room.
create function public.room_start_pushes() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_to uuid[];
  v_n int := 0;
begin
  for r in
    update public.reading_rooms rr set start_notified_at = now()
     where rr.state = 'scheduled' and rr.start_notified_at is null
       and rr.starts_at > now() and rr.starts_at <= now() + interval '15 minutes'
       and rr.starts_at - rr.created_at > interval '15 minutes'
    returning rr.group_id, rr.host_id
  loop
    select array_agg(gm.user_id) into v_to from public.group_members gm
     where gm.group_id = r.group_id and gm.user_id is distinct from r.host_id and gm.banned_at is null;
    if v_to is null then continue; end if;
    perform public.enqueue_push('room_starting', v_to, jsonb_build_object(
      'vars', jsonb_build_object('room_name', (select g.name from public.groups g where g.id = r.group_id)),
      'target', jsonb_build_object('kind', 'room', 'id', r.group_id), 'group_id', r.group_id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('room_start_pushes', '* * * * *', 'select public.room_start_pushes()');
  end if;
end $$;

revoke execute on function public.chat_pushes(uuid[], uuid[]), public.author_post_push(),
  public.room_finished_push(), public.room_start_pushes() from public, anon, authenticated;
grant execute on function public.chat_pushes(uuid[], uuid[]) to service_role;
