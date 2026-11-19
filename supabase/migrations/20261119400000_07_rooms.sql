-- Flow 07 · Reading rooms (docs/prd/07-reading-rooms.md).
-- A room is a flow 06 group (`groups.kind = 'room'`) plus `reading_rooms`. Chat, reactions, reports
-- and blocks are flow 06's. The host is the group's `owner` (shown as "Host").
-- Tables of flows not merged yet (`reading_progress` from flow 03, `annotations` from flow 04) are
-- used behind `to_regclass()` checks: PL/pgSQL plans a statement only when it runs, and the trigger
-- and policy on them are created only when the table exists (a fresh reset on main has both).

create type public.room_pace as enum ('free', 'three_week', 'one_day');
create type public.room_join_policy as enum ('code', 'anyone');
create type public.room_state as enum ('scheduled', 'live', 'ended');

-- ─── reading_rooms ──────────────────────────────────────────────────────────
create table public.reading_rooms (
  group_id uuid primary key references public.groups (id) on delete cascade,
  book_id uuid not null references public.books (id),
  host_id uuid references public.profiles (id) on delete set null,
  -- Alphabet without 0 O 1 I (rule 11 accepts any A–Z 0–9 typed; these never match).
  code char(8) not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  pace public.room_pace not null default 'free',
  join_policy public.room_join_policy not null default 'code',
  starts_at timestamptz not null default now(),
  state public.room_state not null default 'live',
  max_members int not null default 100 check (max_members between 2 and 10000),
  -- "Arpedia staff locked the chat" vs the host's lock (groups.locked_until holds the lock itself).
  locked_by_staff boolean not null default false,
  -- The chat lock before an end, so a staff Undo restores a host's lock too.
  locked_before_end timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles (id) on delete set null,
  transcript_purge_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((state = 'ended') = (ended_at is not null))
);
create index reading_rooms_host_idx on public.reading_rooms (host_id) where state <> 'ended';
create index reading_rooms_book_idx on public.reading_rooms (book_id) where state <> 'ended';
create index reading_rooms_state_idx on public.reading_rooms (state, starts_at);

create table public.room_member_progress (
  room_id uuid not null references public.reading_rooms (group_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  percent numeric(5, 2) not null default 0 check (percent between 0 and 100),
  chapter_index int not null default 0 check (chapter_index >= 0),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_member_progress_user_idx on public.room_member_progress (user_id);

-- Host and staff mutes for the room (history and "rest of the room"); the live mute is
-- group_members.muted_until, which flow 06's post_block_for and the Durable Object enforce.
create table public.room_members_muted (
  room_id uuid not null references public.reading_rooms (group_id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  until timestamptz not null,
  muted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.room_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now(),
  success boolean not null
);
create index room_code_attempts_user_idx on public.room_code_attempts (user_id, attempted_at desc);

-- ─── Helpers ────────────────────────────────────────────────────────────────
create function public._room_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alpha constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select string_agg(substr(v_alpha, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from public.reading_rooms where code = v_code);
  end loop;
  return v_code;
end $$;

-- Rule 11: any case, spaces and hyphens ignored.
create function public.normalise_room_code(p_code text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'))
$$;

-- The caller's reading position in a book: (percent, chapter, finished_at). Zeros without
-- flow 03's reading_progress.
create function public._book_progress(p_user uuid, p_book uuid,
                                      out percent numeric, out chapter int, out finished_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  percent := 0; chapter := 0; finished_at := null;
  if to_regclass('public.reading_progress') is not null then
    execute 'select greatest(rp.percent, rp.max_percent), rp.chapter_ord, rp.finished_at
               from public.reading_progress rp where rp.user_id = $1 and rp.book_id = $2'
      into percent, chapter, finished_at using p_user, p_book;
    percent := coalesce(percent, 0); chapter := coalesce(chapter, 0);
  end if;
end $$;

-- Rule 6: books in the user's library, each once: unlocked (entitlements) or started (progress).
create function public._in_library(p_user uuid, p_book uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v boolean := false;
begin
  if exists (select 1 from public.entitlements e
             where e.user_id = p_user and e.book_id = p_book and e.revoked_at is null) then
    return true;
  end if;
  if to_regclass('public.reading_progress') is not null then
    execute 'select exists (select 1 from public.reading_progress where user_id = $1 and book_id = $2)'
      into v using p_user, p_book;
  end if;
  return v;
end $$;

create function public.is_room_host(p_room uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m
                 where m.group_id = p_room and m.user_id = p_user and m.role = 'owner'
                   and m.banned_at is null)
$$;

create function public._book_card(p_book uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', b.id, 'title', b.title, 'cover_key', (select v.cover_key from public.book_revisions v where v.id = b.current_revision_id), 'status', b.status,
    'author_name', (select p.full_name from public.profiles p where p.id = b.author_id),
    'chapter_count', (select count(*)::int from public.chapters c
                      where c.revision_id = b.current_revision_id and c.kind = 'chapter'))
  from public.books b where b.id = p_book
$$;

-- Rule 22: chapters behind the room's pace (0 when on pace, free pace or not started).
create function public._room_behind(r public.reading_rooms, p_chapter int) returns int
language sql stable set search_path = '' as $$
  select case
    when r.pace = 'free' or r.state <> 'live' or r.starts_at > now() then 0
    else greatest(0,
      (case r.pace
         when 'one_day' then floor(extract(epoch from now() - r.starts_at) / 86400)::int
         else floor(extract(epoch from now() - r.starts_at) / (7 * 86400) * 3)::int end)
      - coalesce(p_chapter, 0))
  end
$$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.reading_rooms enable row level security;
alter table public.room_member_progress enable row level security;
alter table public.room_members_muted enable row level security;
alter table public.room_code_attempts enable row level security;

-- Members (and community staff) read their rooms; nobody else sees a room's code.
create policy reading_rooms_select on public.reading_rooms for select to authenticated
  using ((select public.am_group_member(group_id)) or (select public.is_community_staff()));
create policy room_member_progress_select on public.room_member_progress for select to authenticated
  using ((select public.am_group_member(room_id)) or (select public.is_community_staff()));
create policy room_members_muted_select on public.room_members_muted for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_room_host(room_id))
         or (select public.is_community_staff()));
-- room_code_attempts: no policy (RPCs only).

revoke all on public.reading_rooms, public.room_member_progress, public.room_members_muted,
  public.room_code_attempts from anon, authenticated;
grant select on public.reading_rooms, public.room_member_progress, public.room_members_muted
  to authenticated;

-- ─── Progress ───────────────────────────────────────────────────────────────
-- Writes the user's progress into every live (or scheduled) room they're in with this book.
-- Never goes backwards: room progress is how far they've reached. Returns the rooms touched.
create function public._sync_room_progress(p_user uuid, p_book uuid, p_percent numeric,
                                           p_chapter int, p_finished_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_out jsonb;
begin
  with up as (
    update public.room_member_progress p
       set percent = greatest(p.percent, least(greatest(coalesce(p_percent, 0), 0), 100)),
           chapter_index = greatest(p.chapter_index, coalesce(p_chapter, 0)),
           finished_at = coalesce(p.finished_at,
                                  case when p_percent >= 100 then coalesce(p_finished_at, now())
                                       else p_finished_at end),
           updated_at = now()
      from public.reading_rooms r
     where r.group_id = p.room_id and r.book_id = p_book and r.state <> 'ended'
       and p.user_id = p_user
       and (select b.status from public.books b where b.id = p_book) = 'live'
    returning p.room_id, p.percent, p.chapter_index, p.finished_at
  ), touch as (
    update public.reading_rooms r set last_activity_at = now()
      from up where r.group_id = up.room_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('room_id', room_id, 'percent', percent,
                                               'chapter', chapter_index, 'finished', finished_at is not null)),
                  '[]'::jsonb)
    into v_out from up;
  return v_out;
end $$;

-- Called by the api Worker's progress-sync (with the reader's JWT) after a synced page turn.
create function public.update_room_progress(p_book uuid, p_percent numeric, p_chapter int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 or coalesce(p_chapter, 0) < 0 then
    raise exception 'bad_progress' using errcode = '22023';
  end if;
  -- Never ahead of the reader's own synced position (flow 03/04 reading_progress), so nobody
  -- can claim 100% to unlock room annotations early. Until that table exists, the value is taken.
  if to_regclass('public.reading_progress') is not null then
    select least(p_percent, bp.percent), least(coalesce(p_chapter, 0), bp.chapter)
      into p_percent, p_chapter from public._book_progress(auth.uid(), p_book) bp;
  end if;
  return public._sync_room_progress(auth.uid(), p_book, p_percent, p_chapter);
end $$;

-- Offline progress that syncs later (flow 03/04 write reading_progress): rooms follow it.
create function public.reading_progress_to_rooms() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._sync_room_progress(new.user_id, new.book_id, greatest(new.percent, new.max_percent),
                                     new.chapter_ord, new.finished_at);
  return null;
end $$;

do $$
begin
  if to_regclass('public.reading_progress') is not null then
    execute 'create trigger reading_progress_to_rooms after insert or update on public.reading_progress
               for each row execute function public.reading_progress_to_rooms()';
  end if;
end $$;

-- Rule 18: every room message is stamped with the sender's chapter in the room's book (a quote
-- from a later chapter counts). Members with no progress are chapter 0.
create function public.room_message_spoiler() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.spoiler_chapter is null and new.sender_id is not null
     and exists (select 1 from public.reading_rooms r where r.group_id = new.group_id) then
    new.spoiler_chapter := greatest(
      coalesce((select p.chapter_index from public.room_member_progress p
                where p.room_id = new.group_id and p.user_id = new.sender_id), 0),
      case when new.quote ->> 'chapter' ~ '^[0-9]{1,6}$' then (new.quote ->> 'chapter')::int else 0 end);
  end if;
  return new;
end $$;
create trigger messages_room_spoiler before insert on public.messages
  for each row execute function public.room_message_spoiler();

-- ─── Reader RPCs ────────────────────────────────────────────────────────────
-- Rules 5–10.
create function public.create_reading_room(p_name text, p_book uuid,
                                           p_pace public.room_pace default 'free',
                                           p_join_policy public.room_join_policy default 'code',
                                           p_starts_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_code text;
  v_start timestamptz := greatest(coalesce(p_starts_at, now()), now());
  v_prog record;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 3 and 40 then
    raise exception 'room_name' using errcode = '22023';
  end if;
  if not exists (select 1 from public.books b where b.id = p_book and b.status = 'live')
     or not public._in_library(uid, p_book) then
    raise exception 'book_not_in_library' using errcode = '22023';
  end if;
  if p_join_policy = 'anyone' and public.is_minor(uid) then
    raise exception 'minor_anyone' using errcode = '22023';
  end if;
  -- Rule 10, serialised per host so two taps can't make a sixth room.
  perform pg_advisory_xact_lock(hashtext('room_host:' || uid::text));
  if (select count(*) from public.reading_rooms r where r.host_id = uid and r.state <> 'ended') >= 5 then
    raise exception 'host_limit' using errcode = '22023';
  end if;
  if (select count(*) from public.group_members m join public.reading_rooms r on r.group_id = m.group_id
      where m.user_id = uid and m.banned_at is null and r.state <> 'ended') >= 20 then
    raise exception 'room_limit' using errcode = '22023';
  end if;

  insert into public.groups (kind, name, owner_id, book_id, visibility)
  values ('room', v_name, uid, p_book, case when p_join_policy = 'anyone' then 'public' else 'private' end::public.group_visibility)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, uid, 'owner');
  v_code := public._room_code();
  insert into public.reading_rooms (group_id, book_id, host_id, code, pace, join_policy, starts_at, state)
  values (v_id, p_book, uid, v_code, p_pace, p_join_policy, v_start,
          case when v_start > now() + interval '1 minute' then 'scheduled' else 'live' end::public.room_state);
  select * into v_prog from public._book_progress(uid, p_book);
  insert into public.room_member_progress (room_id, user_id, percent, chapter_index, finished_at)
  values (v_id, uid, v_prog.percent, v_prog.chapter, v_prog.finished_at);
  return jsonb_build_object('room_id', v_id, 'code', v_code);
end $$;

-- Rules 11–15. Never raises for a wrong code (the failed attempt must be kept for the throttle):
-- returns {status: 'not_found' | 'ended' | 'full' | 'room_limit' | 'too_many_tries' | 'minor',
-- retry_at?} or, without p_confirm, {status: 'confirm', room_id, name, book_title,
-- blocked_member} for the consent sheet, or {status: 'member', room_id} when already in it.
-- With p_confirm it joins: {status: 'joined', room_id}.
create function public.join_reading_room(p_code text, p_confirm boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_code text := public.normalise_room_code(p_code);
  r public.reading_rooms;
  m public.group_members;
  v_fails int;
  v_last timestamptz;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('room_code:' || uid::text));
  select count(*), max(attempted_at) into v_fails, v_last from public.room_code_attempts
   where user_id = uid and not success and attempted_at > now() - interval '1 hour';
  if v_fails >= 10 and v_last > now() - interval '15 minutes' then
    return jsonb_build_object('status', 'too_many_tries', 'retry_at', v_last + interval '15 minutes');
  end if;

  select * into r from public.reading_rooms where code = v_code;
  if r.group_id is not null then
    select * into m from public.group_members where group_id = r.group_id and user_id = uid;
  end if;
  -- Removed members get the same answer as a wrong code (rule 13).
  if r.group_id is null or m.banned_at is not null then
    insert into public.room_code_attempts (user_id, success) values (uid, false);
    return case when v_fails + 1 >= 10
      then jsonb_build_object('status', 'too_many_tries', 'retry_at', now() + interval '15 minutes')
      else jsonb_build_object('status', 'not_found') end;
  end if;
  insert into public.room_code_attempts (user_id, success) values (uid, true);
  if m.user_id is not null then
    return jsonb_build_object('status', 'member', 'room_id', r.group_id);
  end if;
  return public._join_room(r, p_confirm);
end $$;

-- Shared by code and Discover joins (the caller is checked by the wrapper).
create function public._join_room(r public.reading_rooms, p_confirm boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  v_prog record;
begin
  -- Locked, so two joins at once can't both take the last place.
  select * into g from public.groups where id = r.group_id for update;
  if r.state = 'ended' or g.archived_at is not null then
    return jsonb_build_object('status', 'ended');
  end if;
  if g.member_count >= r.max_members then
    return jsonb_build_object('status', 'full');
  end if;
  if (select count(*) from public.group_members m join public.reading_rooms x on x.group_id = m.group_id
      where m.user_id = uid and m.banned_at is null and x.state <> 'ended') >= 20 then
    return jsonb_build_object('status', 'room_limit');
  end if;
  if not p_confirm then
    return jsonb_build_object(
      'status', 'confirm', 'room_id', r.group_id, 'name', g.name,
      'book_title', (select b.title from public.books b where b.id = r.book_id),
      'member_count', g.member_count,
      'blocked_member', exists (select 1 from public.group_members x
                                where x.group_id = r.group_id and x.banned_at is null
                                  and public.has_blocked(uid, x.user_id)));
  end if;
  insert into public.group_members (group_id, user_id, role, muted_until, muted_by)
  select r.group_id, uid, 'member', mu.until, mu.muted_by
    from (select 1) one
    left join public.room_members_muted mu on mu.room_id = r.group_id and mu.user_id = uid and mu.until > now()
  on conflict (group_id, user_id) do nothing;
  select * into v_prog from public._book_progress(uid, r.book_id);
  insert into public.room_member_progress (room_id, user_id, percent, chapter_index, finished_at)
  values (r.group_id, uid, v_prog.percent, v_prog.chapter, v_prog.finished_at)
  on conflict (room_id, user_id) do nothing;
  update public.reading_rooms set last_activity_at = now() where group_id = r.group_id;
  return jsonb_build_object('status', 'joined', 'room_id', r.group_id);
end $$;

-- Rule 8: "Anyone" rooms join from Discover without the code. Minors can't join them.
create function public.join_open_room(p_room uuid, p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.reading_rooms;
  m public.group_members;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.reading_rooms where group_id = p_room and join_policy = 'anyone';
  select * into m from public.group_members where group_id = p_room and user_id = uid;
  if r.group_id is null or m.banned_at is not null then
    return jsonb_build_object('status', 'not_found');
  elsif m.user_id is not null then
    return jsonb_build_object('status', 'member', 'room_id', r.group_id);
  elsif public.is_minor(uid) then
    return jsonb_build_object('status', 'minor');
  end if;
  return public._join_room(r, p_confirm);
end $$;

-- Read-alongs in Discover (rule 8): live and scheduled "Anyone" rooms, never the code.
create function public.list_open_rooms(p_book uuid default null, p_limit int default 30, p_offset int default 0)
returns table (room_id uuid, name text, book jsonb, member_count int, finished_count int,
               state public.room_state, starts_at timestamptz, joined boolean)
language sql stable security definer set search_path = '' as $$
  select r.group_id, g.name, public._book_card(r.book_id), g.member_count,
         (select count(*)::int from public.room_member_progress p
          where p.room_id = r.group_id and p.finished_at is not null),
         r.state, r.starts_at, public.is_group_member(r.group_id, auth.uid())
  from public.reading_rooms r join public.groups g on g.id = r.group_id
  where auth.uid() is not null and r.join_policy = 'anyone' and r.state <> 'ended'
    and g.archived_at is null and (p_book is null or r.book_id = p_book)
    and not public.is_minor(auth.uid())
  order by g.member_count desc, r.last_activity_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50) offset greatest(coalesce(p_offset, 0), 0)
$$;

-- Rule 20 and 23: anyone can leave; a leaving host hands hosting to the longest-standing member;
-- the last one out ends the room.
create function public.leave_reading_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  m public.group_members;
  v_next uuid;
begin
  select * into m from public.group_members where group_id = p_room and user_id = uid;
  if m.user_id is null or m.banned_at is not null
     or not exists (select 1 from public.reading_rooms where group_id = p_room) then
    raise exception 'not_member' using errcode = 'insufficient_privilege';
  end if;
  delete from public.group_members where group_id = p_room and user_id = uid;
  delete from public.room_member_progress where room_id = p_room and user_id = uid;
  if m.role = 'owner' then
    select x.user_id into v_next from public.group_members x
     where x.group_id = p_room and x.banned_at is null
     order by x.joined_at, x.user_id limit 1;
    if v_next is null then
      update public.reading_rooms
         set state = 'ended', ended_at = now(), ended_by = uid, host_id = null,
             transcript_purge_at = now() + interval '90 days'
       where group_id = p_room and state <> 'ended';
      update public.groups set locked_until = 'infinity', owner_id = null where id = p_room;
    else
      update public.group_members set role = 'owner', muted_until = null, muted_by = null
       where group_id = p_room and user_id = v_next;
      update public.reading_rooms set host_id = v_next where group_id = p_room;
      update public.groups set owner_id = v_next where id = p_room;
    end if;
  end if;
end $$;

-- Rule 20: host mutes a member for 1 hour, 24 hours or the rest of the room ('infinity');
-- null unmutes. Staff use admin_room_action.
create function public.mute_room_member(p_room uuid, p_user uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_room_host(p_room) then
    raise exception 'not_host' using errcode = 'insufficient_privilege';
  end if;
  perform public._mute_room_member(p_room, p_user, p_until);
end $$;

create function public._mute_room_member(p_room uuid, p_user uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_until is not null and p_until <= now() then
    raise exception 'bad until' using errcode = '22023';
  end if;
  if public.is_room_host(p_room, p_user) then
    raise exception 'cannot_mute_host' using errcode = '22023';
  end if;
  update public.group_members set muted_until = p_until, muted_by = case when p_until is null then null else auth.uid() end
   where group_id = p_room and user_id = p_user and banned_at is null;
  if not found then raise exception 'not_member' using errcode = 'P0002'; end if;
  if p_until is null then
    delete from public.room_members_muted where room_id = p_room and user_id = p_user;
  else
    insert into public.room_members_muted (room_id, user_id, until, muted_by)
    values (p_room, p_user, p_until, auth.uid())
    on conflict (room_id, user_id) do update set until = excluded.until, muted_by = excluded.muted_by,
                                                 created_at = now();
  end if;
end $$;

-- Rule 20: host locks or unlocks the chat (a staff lock can't be lifted by the host).
create function public.set_room_lock(p_room uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reading_rooms;
begin
  if not public.is_room_host(p_room) then
    raise exception 'not_host' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.reading_rooms where group_id = p_room;
  if r.state = 'ended' then raise exception 'room_ended' using errcode = '22023'; end if;
  if r.locked_by_staff then raise exception 'staff_locked' using errcode = 'insufficient_privilege'; end if;
  update public.groups set locked_until = case when p_locked then 'infinity'::timestamptz end where id = p_room;
end $$;

create function public._end_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.reading_rooms
     set state = 'ended', ended_at = now(), ended_by = auth.uid(),
         transcript_purge_at = now() + interval '90 days',
         locked_before_end = (select g.locked_until from public.groups g where g.id = p_room)
   where group_id = p_room and state <> 'ended';
  if not found then raise exception 'room_ended' using errcode = '22023'; end if;
  update public.groups set locked_until = 'infinity' where id = p_room;
end $$;

-- Rule 21: the host ends the room; chat goes read-only, progress stays visible.
create function public.end_reading_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_room_host(p_room) then
    raise exception 'not_host' using errcode = 'insufficient_privilege';
  end if;
  perform public._end_room(p_room);
end $$;

-- s-rooms (rules 2–4): my rooms, unread first then by activity; ended ones flagged for the fold.
create function public.get_my_rooms()
returns table (room_id uuid, name text, book jsonb, member_count int, finished_count int,
               state public.room_state, starts_at timestamptz, last_activity_at timestamptz,
               my_percent numeric, unread boolean, is_host boolean)
language sql stable security definer set search_path = '' as $$
  select r.group_id, g.name, public._book_card(r.book_id), g.member_count,
         (select count(*)::int from public.room_member_progress p
          where p.room_id = r.group_id and p.finished_at is not null),
         r.state, r.starts_at, greatest(r.last_activity_at, coalesce(g.last_message_at, r.last_activity_at)),
         coalesce(mp.percent, 0),
         coalesce(g.last_message_at > m.last_read_at, false),
         m.role = 'owner'
  from public.group_members m
  join public.reading_rooms r on r.group_id = m.group_id
  join public.groups g on g.id = r.group_id
  left join public.room_member_progress mp on mp.room_id = r.group_id and mp.user_id = m.user_id
  where m.user_id = auth.uid() and m.banned_at is null
  order by (r.state = 'ended'), coalesce(g.last_message_at > m.last_read_at, false) desc,
           greatest(r.last_activity_at, coalesce(g.last_message_at, r.last_activity_at)) desc
$$;

-- s-room header and composer state (rules 16–24). Members only (staff use admin_get_room).
create function public.get_room(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.reading_rooms;
  g public.groups;
  me public.room_member_progress;
  v_block record;
  v_large boolean;
begin
  select * into r from public.reading_rooms where group_id = p_room;
  if r.group_id is null or not public.is_group_member(p_room, uid) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into g from public.groups where id = p_room;
  select * into me from public.room_member_progress where room_id = p_room and user_id = uid;
  select * into v_block from public.post_block_for(p_room, uid);
  v_large := g.member_count > 100;
  return jsonb_build_object(
    'id', r.group_id, 'name', g.name, 'code', r.code, 'book', public._book_card(r.book_id),
    'pace', r.pace, 'join_policy', r.join_policy, 'state', r.state, 'starts_at', r.starts_at,
    'ended_at', r.ended_at, 'host_id', r.host_id, 'is_host', r.host_id = uid,
    'member_count', g.member_count,
    'finished_count', (select count(*)::int from public.room_member_progress p
                       where p.room_id = p_room and p.finished_at is not null),
    'large', v_large,
    'my_percent', coalesce(me.percent, 0), 'my_chapter', coalesce(me.chapter_index, 0),
    'my_finished', me.finished_at is not null, 'progress_updated_at', me.updated_at,
    'behind', public._room_behind(r, me.chapter_index),
    'locked', g.locked_until > now() and r.state <> 'ended', 'locked_by_staff', r.locked_by_staff,
    'post_block', v_block.reason, 'post_block_until', v_block.until,
    'new_account', coalesce((select u.created_at > now() - interval '7 days' from auth.users u where u.id = uid), true),
    'last_read_at', (select m.last_read_at from public.group_members m where m.group_id = p_room and m.user_id = uid),
    -- Header: the viewer first, then by progress (hidden for rooms over 100).
    'header', case when v_large then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'name', public.sender_name(m.user_id),
               'avatar_url', pf.avatar_url, 'percent', coalesce(p.percent, 0),
               'finished', p.finished_at is not null)
             order by m.user_id = uid desc, coalesce(p.percent, 0) desc, m.joined_at)
      from public.group_members m
      left join public.profiles pf on pf.id = m.user_id
      left join public.room_member_progress p on p.room_id = p_room and p.user_id = m.user_id
      where m.group_id = p_room and m.banned_at is null), '[]'::jsonb) end
  );
end $$;

-- Members tab (rule 20), 50 at a time.
create function public.get_room_members(p_room uuid, p_offset int default 0)
returns table (user_id uuid, name text, avatar_url text, is_host boolean, percent numeric,
               finished_at timestamptz, muted_until timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if not (public.is_group_member(p_room, uid)
          and exists (select 1 from public.reading_rooms rr where rr.group_id = p_room)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return query
    select m.user_id, public.sender_name(m.user_id), pf.avatar_url, m.role = 'owner',
           coalesce(p.percent, 0), p.finished_at,
           case when public.is_room_host(p_room, uid) or m.user_id = uid then m.muted_until end,
           m.user_id = uid
    from public.group_members m
    left join public.profiles pf on pf.id = m.user_id
    left join public.room_member_progress p on p.room_id = p_room and p.user_id = m.user_id
    where m.group_id = p_room and m.banned_at is null
    order by m.role = 'owner' desc, m.user_id = uid desc, coalesce(p.percent, 0) desc, m.joined_at
    limit 50 offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- Chat history with each message's spoiler chapter (rule 18). The app hides a message whose
-- spoiler_chapter is ahead of my_chapter from get_room.
create function public.get_room_messages(p_room uuid, p_before timestamptz default null,
                                         p_before_id uuid default null, p_limit int default 50)
returns table (
  id uuid, group_id uuid, sender_id uuid, sender_name text, sender_avatar text,
  sender_is_author boolean, kind public.message_kind, body text, quote jsonb, reply_to_id uuid,
  reply_to jsonb, state public.message_state, created_at timestamptz, reactions jsonb,
  my_reaction text, pinned boolean, spoiler_chapter int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.reading_rooms rr where rr.group_id = p_room) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- No public preview: only members (not removed) and community staff read a room's chat.
  if not (public.is_group_member(p_room, auth.uid()) or public.is_community_staff()) then
    raise exception 'not_member' using errcode = 'insufficient_privilege';
  end if;
  return query
    select x.*, coalesce(msg.spoiler_chapter, 0)
    from public.get_messages(p_room, p_before, p_before_id, p_limit) x
    join public.messages msg on msg.id = x.id;
end $$;

-- Annotations tab (rule 19): locked until the caller finishes; then members' shared highlights
-- and notes on this book (flow 04 annotations with shared_group_id = the room), minus blocked people.
create function public.get_room_annotations(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.reading_rooms;
  me public.room_member_progress;
  v_rows jsonb := '[]'::jsonb;
begin
  select * into r from public.reading_rooms where group_id = p_room;
  if r.group_id is null or not public.is_group_member(p_room, uid) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into me from public.room_member_progress where room_id = p_room and user_id = uid;
  if me.finished_at is null then
    return jsonb_build_object('locked', true, 'percent', coalesce(me.percent, 0), 'items', '[]'::jsonb);
  end if;
  if to_regclass('public.annotations') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'user_id', a.user_id, 'name', public.sender_name(a.user_id),
               'kind', a.kind, 'color', a.color, 'quote', a.quote, 'note', a.note_text,
               'chapter_uid', a.chapter_uid, 'created_at', a.created_at)
             order by a.created_at desc), '[]'::jsonb)
      from public.annotations a
      where a.shared_group_id = $1 and a.book_id = $2 and a.deleted_at is null
        and a.kind in ('highlight', 'note')
        and public.is_group_member($1, a.user_id)
        and not public.has_blocked($3, a.user_id)
    $q$ into v_rows using p_room, r.book_id, uid;
  end if;
  return jsonb_build_object('locked', false, 'percent', me.percent, 'items', v_rows);
end $$;

-- RLS backstop for rule 19: room-shared annotations are readable by members who finished.
create function public.can_read_room_annotation(p_room uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.room_member_progress p
                 join public.group_members m on m.group_id = p.room_id and m.user_id = p.user_id
                 where p.room_id = p_room and p.user_id = auth.uid() and p.finished_at is not null
                   and m.banned_at is null)
$$;

do $$
begin
  if to_regclass('public.annotations') is not null then
    execute $p$
      create policy annotations_room_shared on public.annotations for select to authenticated
        using (shared_group_id is not null and deleted_at is null
               and (select public.can_read_room_annotation(shared_group_id))
               and not public.i_blocked(user_id))
    $p$;
  end if;
end $$;

-- ─── Admin (screens rooms, room) ────────────────────────────────────────────
-- Moderator and Super admin act; Support and Analyst read the list only.
create function public.room_staff(p_edit boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_mfa_ok() and public.is_staff_any(
    case when p_edit then array['moderator']::public.staff_role[]
         else array['moderator', 'support', 'analyst']::public.staff_role[] end)
$$;

create function public.admin_list_rooms(p_tab text default 'live', p_q text default null,
                                        p_limit int default 50, p_offset int default 0)
returns table (room_id uuid, name text, book_title text, host_name text, member_count int,
               live_count int, state public.room_state, starts_at timestamptz, ended_at timestamptz,
               code text, open_reports int, total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not public.room_staff(false) then
    raise exception 'Not allowed: rooms' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.group_id, g.name, b.title, public.sender_name(r.host_id), g.member_count,
           case when g.live_at > now() - interval '5 minutes' then g.live_count else 0 end,
           r.state, r.starts_at, r.ended_at, r.code::text,
           (select count(*)::int from public.reports rp where rp.group_id = r.group_id and rp.status <> 'resolved'),
           count(*) over ()
    from public.reading_rooms r
    join public.groups g on g.id = r.group_id
    join public.books b on b.id = r.book_id
    where case coalesce(p_tab, 'live')
            when 'scheduled' then r.state = 'scheduled'
            when 'ended' then r.state = 'ended' and r.ended_at > now() - interval '90 days'
            else r.state = 'live' end
      and (v_q is null or g.name ilike '%' || v_q || '%' or b.title ilike '%' || v_q || '%'
           or r.code = public.normalise_room_code(v_q))
    order by case when p_tab = 'scheduled' then r.starts_at end asc,
             coalesce(r.ended_at, r.last_activity_at) desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function public.admin_room_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.room_staff(false) then
    raise exception 'Not allowed: rooms' using errcode = 'insufficient_privilege';
  end if;
  return (select jsonb_build_object(
    'live', count(*) filter (where state = 'live'),
    'scheduled', count(*) filter (where state = 'scheduled'),
    'ended', count(*) filter (where state = 'ended' and ended_at > now() - interval '90 days'))
    from public.reading_rooms);
end $$;

-- Every open of a room page by staff is audited (RLS in plain words).
create function public.admin_get_room(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.reading_rooms;
  g public.groups;
begin
  if not public.room_staff(true) then
    raise exception 'Not allowed: rooms' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.reading_rooms where group_id = p_room;
  if r.group_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into g from public.groups where id = p_room;
  perform public.write_audit('community', 'room.view', 'room', p_room::text, g.name, 'Opened the room');
  return jsonb_build_object(
    'id', r.group_id, 'name', g.name, 'code', r.code, 'book', public._book_card(r.book_id),
    'host_id', r.host_id, 'host_name', public.sender_name(r.host_id),
    'pace', r.pace, 'join_policy', r.join_policy, 'state', r.state, 'starts_at', r.starts_at,
    'ended_at', r.ended_at, 'ended_by_name', case when r.ended_by is not null then public.sender_name(r.ended_by) end,
    'locked', g.locked_until > now() and r.state <> 'ended', 'locked_by_staff', r.locked_by_staff,
    'member_count', g.member_count,
    'live_count', case when g.live_at > now() - interval '5 minutes' then g.live_count else 0 end,
    'open_reports', (select count(*) from public.reports rp where rp.group_id = p_room and rp.status <> 'resolved'),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'name', public.sender_name(m.user_id), 'avatar_url', pf.avatar_url,
               'is_host', m.role = 'owner', 'percent', coalesce(p.percent, 0), 'chapter', coalesce(p.chapter_index, 0),
               'finished_at', p.finished_at, 'muted_until', m.muted_until, 'last_seen_at', m.last_seen_at)
             order by m.role = 'owner' desc, coalesce(p.percent, 0) desc, m.joined_at)
      from public.group_members m
      left join public.profiles pf on pf.id = m.user_id
      left join public.room_member_progress p on p.room_id = p_room and p.user_id = m.user_id
      where m.group_id = p_room and m.banned_at is null), '[]'::jsonb)
  );
end $$;

-- Staff actions: join_silently (watch, logged, host not told), lock / unlock, end, undo_end
-- (within 10 minutes of a staff end), cancel (scheduled), mute (p_user, p_until).
create function public.admin_room_action(p_room uuid, p_action text, p_user uuid default null,
                                         p_until timestamptz default null, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.reading_rooms;
  g public.groups;
  v_summary text;
begin
  if not public.room_staff(true) then
    raise exception 'Not allowed: rooms' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.reading_rooms where group_id = p_room for update;
  if r.group_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into g from public.groups where id = p_room;
  case p_action
    when 'join_silently' then
      v_summary := 'Joined the room silently';
    when 'transcript' then
      v_summary := 'Downloaded the transcript';
    when 'lock' then
      if r.state = 'ended' then raise exception 'room_ended' using errcode = '22023'; end if;
      update public.groups set locked_until = 'infinity' where id = p_room;
      update public.reading_rooms set locked_by_staff = true where group_id = p_room;
      v_summary := 'Locked the chat';
    when 'unlock' then
      if r.state = 'ended' then raise exception 'room_ended' using errcode = '22023'; end if;
      update public.groups set locked_until = null where id = p_room;
      update public.reading_rooms set locked_by_staff = false where group_id = p_room;
      v_summary := 'Unlocked the chat';
    when 'end', 'cancel' then
      if p_action = 'cancel' and r.state <> 'scheduled' then
        raise exception 'not_scheduled' using errcode = '22023';
      end if;
      perform public._end_room(p_room);
      v_summary := case p_action when 'cancel' then 'Cancelled the room' else 'Ended the room' end;
    when 'undo_end' then
      if r.state <> 'ended' or r.ended_at < now() - interval '10 minutes'
         or r.ended_by is distinct from auth.uid() then
        raise exception 'undo_expired' using errcode = '22023';
      end if;
      update public.reading_rooms
         set state = case when starts_at > now() then 'scheduled' else 'live' end::public.room_state,
             ended_at = null, ended_by = null, transcript_purge_at = null, locked_before_end = null
       where group_id = p_room;
      update public.groups set locked_until = r.locked_before_end where id = p_room;
      v_summary := 'Undid ending the room';
    when 'mute' then
      perform public._mute_room_member(p_room, p_user, p_until);
      v_summary := case when p_until is null then 'Unmuted ' else 'Muted ' end || public.sender_name(p_user) || ' in this room';
    else
      raise exception 'bad action' using errcode = '22023';
  end case;
  perform public.write_audit('community', 'room.' || p_action, 'room', p_room::text, g.name, v_summary,
                             null, case when p_user is null then null
                                        else jsonb_build_object('user_id', p_user, 'until', p_until) end,
                             p_reason);
  return jsonb_build_object('ok', true);
end $$;

-- ─── Lifecycle ──────────────────────────────────────────────────────────────
-- Every minute: scheduled rooms go live at starts_at; rooms idle for 30 days end.
create function public.room_lifecycle() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.reading_rooms set state = 'live', last_activity_at = now()
   where state = 'scheduled' and starts_at <= now();
  with idle as (
    update public.reading_rooms r
       set state = 'ended', ended_at = now(), transcript_purge_at = now() + interval '90 days'
     where r.state = 'live'
       and greatest(r.last_activity_at,
                    coalesce((select g.last_message_at from public.groups g where g.id = r.group_id), r.last_activity_at))
           < now() - interval '30 days'
    returning r.group_id
  )
  update public.groups g set locked_until = 'infinity' from idle where g.id = idle.group_id;
  delete from public.room_code_attempts where attempted_at < now() - interval '24 hours';
end $$;

-- Daily: messages of rooms ended 90 days ago go, except ones attached to a report.
create function public.purge_room_transcripts() returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  delete from public.messages x
   using public.reading_rooms r
   where r.group_id = x.group_id and r.state = 'ended' and r.transcript_purge_at < now()
     and not exists (select 1 from public.reports rp where rp.content_type = 'message' and rp.content_id = x.id);
  get diagnostics v = row_count;
  return v;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('room_lifecycle', '* * * * *', 'select public.room_lifecycle()');
    perform cron.schedule('purge_room_transcripts', '45 2 * * *', 'select public.purge_room_transcripts()');
  end if;
end $$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke execute on function
  public._room_code(), public._book_progress(uuid, uuid), public._in_library(uuid, uuid),
  public._book_card(uuid), public._room_behind(public.reading_rooms, int),
  public._sync_room_progress(uuid, uuid, numeric, int, timestamptz),
  public.reading_progress_to_rooms(), public.room_message_spoiler(),
  public._join_room(public.reading_rooms, boolean), public._mute_room_member(uuid, uuid, timestamptz),
  public._end_room(uuid), public.room_lifecycle(), public.purge_room_transcripts()
  from public, anon, authenticated;

revoke execute on function
  public.normalise_room_code(text), public.update_room_progress(uuid, numeric, int),
  public.create_reading_room(text, uuid, public.room_pace, public.room_join_policy, timestamptz),
  public.join_reading_room(text, boolean), public.join_open_room(uuid, boolean),
  public.list_open_rooms(uuid, int, int), public.leave_reading_room(uuid),
  public.mute_room_member(uuid, uuid, timestamptz), public.set_room_lock(uuid, boolean),
  public.end_reading_room(uuid), public.get_my_rooms(), public.get_room(uuid),
  public.get_room_members(uuid, int), public.get_room_messages(uuid, timestamptz, uuid, int),
  public.get_room_annotations(uuid), public.can_read_room_annotation(uuid), public.room_staff(boolean),
  public.admin_list_rooms(text, text, int, int), public.admin_room_counts(), public.admin_get_room(uuid),
  public.admin_room_action(uuid, text, uuid, timestamptz, text), public.is_room_host(uuid, uuid)
  from public, anon;

grant execute on function
  public.normalise_room_code(text), public.update_room_progress(uuid, numeric, int),
  public.create_reading_room(text, uuid, public.room_pace, public.room_join_policy, timestamptz),
  public.join_reading_room(text, boolean), public.join_open_room(uuid, boolean),
  public.list_open_rooms(uuid, int, int), public.leave_reading_room(uuid),
  public.mute_room_member(uuid, uuid, timestamptz), public.set_room_lock(uuid, boolean),
  public.end_reading_room(uuid), public.get_my_rooms(), public.get_room(uuid),
  public.get_room_members(uuid, int), public.get_room_messages(uuid, timestamptz, uuid, int),
  public.get_room_annotations(uuid), public.can_read_room_annotation(uuid), public.room_staff(boolean),
  public.admin_list_rooms(text, text, int, int), public.admin_room_counts(), public.admin_get_room(uuid),
  public.admin_room_action(uuid, text, uuid, timestamptz, text), public.is_room_host(uuid, uuid)
  to authenticated;

grant execute on function public.update_room_progress(uuid, numeric, int),
  public.room_lifecycle(), public.purge_room_transcripts()
  to service_role;

-- ─── Room chat extra: new accounts read and react but don't post ────────────
-- Flow 06's post_block_for is the one place both the Durable Object (get_group_access) and
-- persist_messages ask "may this person post?". Rooms wrap it rather than copy it, so 06's rules
-- stay in one body: everything 06 blocks comes first, then accounts under 7 days in a room
-- ('new_account'; the composer says "New accounts can post after 7 days.").
alter function public.post_block_for(uuid, uuid) rename to _post_block_for_base;

create function public.post_block_for(p_group uuid, p_user uuid)
returns table (reason text, until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v record;
begin
  select * into v from public._post_block_for_base(p_group, p_user) limit 1;
  if v.reason is not null then
    return query select v.reason, v.until;
  elsif exists (select 1 from public.groups g where g.id = p_group and g.kind = 'room')
        and not exists (select 1 from public.group_members m
                        where m.group_id = p_group and m.user_id = p_user and m.role = 'owner')
        and coalesce((select u.created_at > now() - interval '7 days' from auth.users u where u.id = p_user), true)
  then
    return query select 'new_account'::text, (select u.created_at + interval '7 days' from auth.users u
                                               where u.id = p_user);
  end if;
end $$;

revoke execute on function public.post_block_for(uuid, uuid), public._post_block_for_base(uuid, uuid)
  from public, anon, authenticated;
