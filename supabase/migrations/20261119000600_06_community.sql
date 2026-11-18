-- Flow 06 · Community: groups, members, messages, reactions, pins, blocks, reports (the part flow 06
-- owns; flow 14 adds the queue), the inbox and chat RPCs, the Durable Object's service RPCs and the
-- staff channel RPCs. Messages are written only by the chat Durable Object through persist_messages.

create extension if not exists pg_trgm with schema extensions;

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.group_kind as enum ('official', 'club', 'author', 'readalong', 'room', 'dm');
create type public.group_visibility as enum ('public', 'followers', 'private');
create type public.group_who_can_post as enum ('members', 'staff', 'owner_and_followers');
create type public.group_role as enum ('owner', 'moderator', 'member');
create type public.message_kind as enum ('text', 'quote', 'system');
create type public.message_state as enum ('visible', 'auto_hidden', 'removed', 'deleted');
create type public.report_content_type as enum (
  'message', 'discussion_comment', 'review', 'post_comment', 'author_post', 'profile', 'book', 'dm'
);
create type public.report_reason as enum (
  'spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'copyright', 'spoilers',
  'impersonation', 'other'
);
create type public.report_severity as enum ('high', 'medium', 'low');
create type public.report_status as enum ('open', 'auto_hidden', 'resolved');
create type public.report_outcome as enum ('keep', 'removed', 'spoiler', 'actioned', 'dismissed');

-- Time-ordered uuid (v7): 48-bit Unix ms, then random. The Durable Object makes the same shape.
create function public.uuid7(p_at timestamptz default clock_timestamp()) returns uuid
language sql volatile set search_path = '' as $$
  select encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
              placing substring(int8send((extract(epoch from p_at) * 1000)::bigint) from 3)
              from 1 for 6),
      52, 1), 53, 1), 'hex')::uuid
$$;

-- ─── groups ─────────────────────────────────────────────────────────────────
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  kind public.group_kind not null,
  name text not null check (char_length(btrim(name)) between 3 and 60),
  description text check (char_length(description) <= 500),
  avatar_url text,
  owner_id uuid references public.profiles (id),
  book_id uuid references public.books (id),
  visibility public.group_visibility not null default 'public',
  who_can_post public.group_who_can_post not null default 'members',
  slow_mode_seconds int not null default 0 check (slow_mode_seconds between 0 and 3600),
  locked_until timestamptz,
  -- Staff "Mute channel" (24 hours): nobody but staff posts until then.
  muted_until timestamptz,
  muted_words text[] not null default '{}',
  weekly_book_id uuid references public.books (id),
  weekly_from_chapter int check (weekly_from_chapter > 0),
  weekly_to_chapter int check (weekly_to_chapter >= weekly_from_chapter),
  weekly_note text check (char_length(weekly_note) <= 120),
  member_count int not null default 0 check (member_count >= 0),
  -- Members with the chat open, reported by the group's Durable Object (Live = 2 or more).
  live_count int not null default 0 check (live_count >= 0),
  live_at timestamptz,
  last_message_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'dm' or visibility = 'private')
);
create index groups_kind_idx on public.groups (kind) where archived_at is null;
create index groups_search_idx on public.groups
  using gin ((name || ' ' || coalesce(description, '')) extensions.gin_trgm_ops)
  where visibility = 'public' and archived_at is null;
create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

-- ─── group_members ──────────────────────────────────────────────────────────
create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  notify_muted_until timestamptz,
  last_seen_at timestamptz,
  cost_ack_at timestamptz,
  -- Moderator or staff mute in this group (can read, can't post).
  muted_until timestamptz,
  muted_by uuid references public.profiles (id),
  -- Removed from this group by moderators: can't read, post or rejoin.
  banned_at timestamptz,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);
create unique index group_members_one_owner_idx on public.group_members (group_id) where role = 'owner';

-- member_count follows the rows (banned rows don't count); refresh_member_counts repairs drift.
create function public.group_members_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.groups g
       set member_count = (select count(*) from public.group_members m
                           where m.group_id = new.group_id and m.banned_at is null)
     where g.id = new.group_id;
  end if;
  if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.group_id <> new.group_id) then
    update public.groups g
       set member_count = (select count(*) from public.group_members m
                           where m.group_id = old.group_id and m.banned_at is null)
     where g.id = old.group_id;
  end if;
  return null;
end $$;
create trigger group_members_count after insert or delete or update of banned_at, group_id
  on public.group_members for each row execute function public.group_members_count();

-- ─── messages ───────────────────────────────────────────────────────────────
create table public.messages (
  id uuid primary key default public.uuid7(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  client_id uuid not null,
  kind public.message_kind not null default 'text',
  body text check (body is null or char_length(body) between 1 and 2000),
  quote jsonb,
  reply_to_id uuid references public.messages (id) on delete set null,
  state public.message_state not null default 'visible',
  spoiler_chapter int,
  cost_credits int not null default 0 check (cost_credits >= 0),
  ledger_id bigint references public.credit_ledger (id),
  created_at timestamptz not null default now(),
  state_changed_at timestamptz,
  check (kind <> 'quote' or quote is not null),
  check (state in ('deleted', 'removed') or body is not null or kind = 'quote')
);
create unique index messages_client_idx on public.messages (sender_id, client_id);
create index messages_group_idx on public.messages (group_id, created_at desc, id desc);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

-- Text of deleted or removed messages that have an open report, kept 30 days for moderators.
create table public.message_retained (
  message_id uuid primary key references public.messages (id) on delete cascade,
  body text not null,
  purge_at timestamptz not null default (now() + interval '30 days')
);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '🔥')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.message_pins (
  group_id uuid not null references public.groups (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  pinned_by uuid references public.profiles (id),
  pinned_at timestamptz not null default now(),
  primary key (group_id, message_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  source_group_id uuid references public.groups (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- ─── reports (flow 14 builds the queue and decisions on top) ────────────────
create sequence public.report_ref_seq;
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique
    default ('RPT-' || extract(year from now())::int || '-' || nextval('public.report_ref_seq')),
  reporter_id uuid references public.profiles (id) on delete set null,
  content_type public.report_content_type not null,
  content_id uuid not null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  group_id uuid references public.groups (id) on delete set null,
  book_id uuid references public.books (id),
  reason public.report_reason not null,
  details text check (char_length(details) <= 500),
  severity public.report_severity not null,
  status public.report_status not null default 'open',
  outcome public.report_outcome,
  snapshot jsonb,
  assignee_id uuid references public.profiles (id),
  escalated_at timestamptz,
  due_at timestamptz not null,
  first_action_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
-- One report per reader per item (automatic reports have no reporter).
create unique index reports_once_idx on public.reports (reporter_id, content_type, content_id)
  where reporter_id is not null;
create index reports_open_idx on public.reports (status, due_at) where status <> 'resolved';
create index reports_group_idx on public.reports (group_id) where group_id is not null;

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- The caller's live membership (not banned). Security definer so policies can call it without
-- recursing into group_members RLS.
create function public.is_group_member(p_group uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m
                 where m.group_id = p_group and m.user_id = p_user and m.banned_at is null)
$$;

-- Owner or moderator of the group.
create function public.is_group_mod(p_group uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members m
                 where m.group_id = p_group and m.user_id = p_user and m.banned_at is null
                   and m.role in ('owner', 'moderator'))
$$;

-- Staff who read non-DM groups for moderation: Moderator and Super admin.
create function public.is_community_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_staff('moderator')
$$;

-- Admin console: Moderator, Operations admin and Super admin edit; Analyst and Support read.
create function public.community_admin(p_edit boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_mfa_ok() and public.is_staff_any(
    case when p_edit then array['moderator', 'operations_admin']::public.staff_role[]
         else array['moderator', 'operations_admin', 'analyst', 'support']::public.staff_role[] end)
$$;

create function public.require_community_admin(p_edit boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.community_admin(p_edit) then
    raise exception 'Not allowed: community' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- True when `p_viewer` blocked `p_user`.
create function public.has_blocked(p_viewer uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from public.user_blocks b where b.blocker_id = p_viewer and b.blocked_id = p_user)
$$;

-- Display name of a sender as readers see it.
create function public.sender_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_user is null then 'Deleted user'
    when exists (select 1 from public.staff_roles s where s.user_id = p_user and s.active) then 'Arpedia Team'
    else coalesce((select nullif(p.full_name, '') from public.profiles p
                   where p.id = p_user and p.deleted_at is null), 'Deleted user')
  end
$$;

-- Under 18 from date of birth (Q1/Q2: 16 and 17 year olds get the minor rules).
create function public.is_minor(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.date_of_birth > (current_date - interval '18 years')::date
                   from public.profiles p where p.id = p_user), false)
$$;

-- Severity and response time for a report reason (rule 28: 24 hours serious, 3 days others).
create function public.report_severity_for(p_reason public.report_reason) returns public.report_severity
language sql immutable set search_path = '' as $$
  select case
    when p_reason in ('hate', 'sexual', 'violence', 'self_harm') then 'high'::public.report_severity
    when p_reason in ('harassment', 'impersonation', 'copyright') then 'medium'::public.report_severity
    else 'low'::public.report_severity
  end
$$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_retained enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_pins enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

-- groups: public groups (Discover, preview), groups I'm in, non-DM groups for community staff.
create policy groups_select on public.groups for select to authenticated
  using (
    (visibility = 'public' and archived_at is null)
    or (select public.is_group_member(id))
    or (kind <> 'dm' and (select public.is_community_staff()))
  );

-- group_members: rows of groups I'm in (minus banned rows of others), non-DM for staff.
create policy group_members_select on public.group_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (banned_at is null and (select public.is_group_member(group_id)))
    or ((select public.is_community_staff())
        and exists (select 1 from public.groups g where g.id = group_id and g.kind <> 'dm'))
  );
-- Members change only their own read/mute/seen times (column grants below).
create policy group_members_update_own on public.group_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- messages: members (and community staff for non-DM groups); never auto-hidden ones, never
-- from people I blocked, never ones I reported. Public previews go through get_messages.
create policy messages_select on public.messages for select to authenticated
  using (
    (
      ((select public.is_group_member(group_id))
       and state <> 'auto_hidden'
       and not public.has_blocked((select auth.uid()), sender_id)
       and not exists (select 1 from public.reports r
                       where r.reporter_id = (select auth.uid()) and r.content_type = 'message'
                         and r.content_id = messages.id))
      or ((select public.is_community_staff())
          and exists (select 1 from public.groups g where g.id = group_id and g.kind <> 'dm'))
    )
  );

create policy message_retained_select on public.message_retained for select to authenticated
  using ((select public.is_community_staff()));

create policy message_reactions_select on public.message_reactions for select to authenticated
  using (
    exists (select 1 from public.messages m where m.id = message_id)
    and not public.has_blocked((select auth.uid()), user_id)
  );

create policy message_pins_select on public.message_pins for select to authenticated
  using ((select public.is_group_member(group_id)) or (select public.is_community_staff()));

-- user_blocks: only my own rows; the blocked person can't see that a row exists.
create policy user_blocks_select on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

-- reports: reporters read their own; never reports about them. Moderators read all (flow 14).
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_community_staff()));

revoke all on public.groups, public.group_members, public.messages, public.message_retained,
  public.message_reactions, public.message_pins, public.user_blocks, public.reports
  from anon, authenticated;
grant select on public.groups, public.group_members, public.messages, public.message_retained,
  public.message_reactions, public.message_pins, public.user_blocks, public.reports
  to authenticated;
grant update (last_read_at, notify_muted_until, last_seen_at) on public.group_members to authenticated;
-- The service role (Workers, the chat Durable Object) writes messages only through
-- persist_messages, so the idempotency and state checks can't be skipped.
revoke insert, update, delete, truncate on public.messages from service_role;

-- ─── Reader RPCs ────────────────────────────────────────────────────────────
-- Shared shape of one inbox row for `p_user`.
create function public.inbox_rows_for(p_user uuid)
returns table (
  group_id uuid, kind public.group_kind, name text, avatar_url text, other_user_id uuid,
  is_author boolean, last_sender text, last_body text, last_kind public.message_kind,
  last_state public.message_state, last_from_author boolean, last_at timestamptz,
  unread_count int, live boolean, muted boolean, member_count int, role public.group_role
)
language sql stable security definer set search_path = '' as $$
  select g.id, g.kind,
         case when g.kind = 'dm' then public.sender_name(o.user_id) else g.name end,
         case when g.kind = 'dm' then op.avatar_url else g.avatar_url end,
         o.user_id,
         coalesce(g.kind = 'dm' and op.is_author, false),
         case when lm.id is null then null
              when lm.sender_id = p_user then 'You'
              when public.sender_name(lm.sender_id) in ('Arpedia Team', 'Deleted user') then public.sender_name(lm.sender_id)
              else split_part(public.sender_name(lm.sender_id), ' ', 1) end,
         lm.body, lm.kind, lm.state,
         coalesce(lm.sender_id = g.owner_id and g.kind in ('author', 'dm') and lp.is_author, false),
         coalesce(lm.created_at, m.joined_at),
         (select count(*)::int from public.messages x
          where x.group_id = g.id and x.created_at > m.last_read_at and x.state = 'visible'
            and x.sender_id is distinct from p_user and not public.has_blocked(p_user, x.sender_id)),
         coalesce(g.live_count >= 2 and g.live_at > now() - interval '5 minutes' and g.member_count <= 10000, false),
         coalesce(m.notify_muted_until > now(), false),
         g.member_count, m.role
  from public.group_members m
  join public.groups g on g.id = m.group_id and g.archived_at is null
  left join lateral (select gm.user_id from public.group_members gm
                     where g.kind = 'dm' and gm.group_id = g.id and gm.user_id <> p_user limit 1) o on true
  left join public.profiles op on op.id = o.user_id
  left join lateral (
    select x.id, x.sender_id, x.kind, x.state, x.created_at,
           case when x.state = 'visible' then x.body end as body
    from public.messages x
    where x.group_id = g.id and x.state <> 'auto_hidden'
      and not public.has_blocked(p_user, x.sender_id)
      and not exists (select 1 from public.reports r where r.reporter_id = p_user
                        and r.content_type = 'message' and r.content_id = x.id)
    order by x.created_at desc, x.id desc limit 1) lm on true
  left join public.profiles lp on lp.id = lm.sender_id
  where m.user_id = p_user and m.banned_at is null
    and not (g.kind = 'dm' and public.has_blocked(p_user, o.user_id))
$$;

-- The caller's inbox: filter all | unread | groups, newest activity first, keyset on last_at.
create function public.get_inbox(p_filter text default 'all', p_limit int default 50,
                                 p_cursor timestamptz default null)
returns table (
  group_id uuid, kind public.group_kind, name text, avatar_url text, other_user_id uuid,
  is_author boolean, last_sender text, last_body text, last_kind public.message_kind,
  last_state public.message_state, last_from_author boolean, last_at timestamptz,
  unread_count int, live boolean, muted boolean, member_count int, role public.group_role
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_filter not in ('all', 'unread', 'groups') then
    raise exception 'bad filter' using errcode = '22023';
  end if;
  return query
    select r.* from public.inbox_rows_for(auth.uid()) r
    where (p_filter <> 'unread' or r.unread_count > 0)
      and (p_filter <> 'groups' or r.kind <> 'dm')
      and (p_cursor is null or r.last_at < p_cursor)
    order by r.last_at desc, r.group_id
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end $$;

-- Filter counts (conversations, not messages) and the Community tab badge (unread, not muted).
create function public.get_inbox_counts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'all', count(*),
    'unread', count(*) filter (where r.unread_count > 0),
    'groups', count(*) filter (where r.kind <> 'dm'),
    'tab', count(*) filter (where r.unread_count > 0 and not r.muted),
    'muted_unread', count(*) filter (where r.unread_count > 0 and r.muted))
  from public.inbox_rows_for(auth.uid()) r
  where auth.uid() is not null
$$;

create function public.mark_all_read() returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  update public.group_members set last_read_at = now()
   where user_id = auth.uid() and banned_at is null;
  get diagnostics v = row_count;
  return v;
end $$;

-- Mark read up to a message (never moves backwards); with no message, up to now.
create function public.mark_read(p_group uuid, p_up_to uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  if not public.is_group_member(p_group) then
    raise exception 'not_member' using errcode = 'insufficient_privilege';
  end if;
  if p_up_to is null then
    v_at := now();
  else
    select created_at into v_at from public.messages where id = p_up_to and group_id = p_group;
    if v_at is null then return; end if;
  end if;
  update public.group_members set last_read_at = greatest(last_read_at, v_at)
   where group_id = p_group and user_id = auth.uid();
end $$;

-- Why the caller can't post right now (null = can post). Slow mode is enforced live by the DO.
create function public.post_block_for(p_group uuid, p_user uuid)
returns table (reason text, until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.groups;
  m public.group_members;
  v_staff boolean := exists (select 1 from public.staff_roles s where s.user_id = p_user and s.active);
begin
  select * into g from public.groups where id = p_group;
  select * into m from public.group_members where group_id = p_group and user_id = p_user;
  if g.id is null or g.archived_at is not null then
    return query select 'archived', null::timestamptz;
  elsif m.user_id is null then
    return query select 'not_member', null::timestamptz;
  elsif m.banned_at is not null then
    return query select 'banned', null::timestamptz;
  elsif m.muted_until > now() then
    return query select 'muted', m.muted_until;
  elsif g.locked_until > now() and not v_staff then
    return query select 'locked', g.locked_until;
  elsif g.muted_until > now() and not v_staff then
    return query select 'channel_muted', g.muted_until;
  elsif g.who_can_post = 'staff' and not v_staff and m.role = 'member' then
    return query select 'staff_only', null::timestamptz;
  elsif g.who_can_post = 'owner_and_followers' and m.role = 'member' and not v_staff then
    -- Followers (flow 08) post too; until follows exist, owner and moderators only.
    return query select 'owner_only', null::timestamptz;
  elsif g.kind = 'dm' and exists (select 1 from public.group_members o
                                  where o.group_id = p_group and o.user_id <> p_user
                                    and public.has_blocked(o.user_id, p_user)) then
    return query select 'blocked', null::timestamptz;
  end if;
end $$;

-- Chat header, pinned weekly reading and the composer state.
create function public.get_group(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  m public.group_members;
  v_block record;
  v_blocked_here int;
begin
  select * into g from public.groups where id = p_group;
  if g.id is null
     or not (public.is_group_member(p_group)
             or (g.visibility = 'public' and g.archived_at is null)
             or (g.kind <> 'dm' and public.is_community_staff())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into m from public.group_members where group_id = p_group and user_id = uid and banned_at is null;
  select * into v_block from public.post_block_for(p_group, uid);
  select count(*) into v_blocked_here from public.group_members x
   where x.group_id = p_group and x.banned_at is null and public.has_blocked(uid, x.user_id);

  return jsonb_build_object(
    'id', g.id, 'kind', g.kind,
    'name', case when g.kind = 'dm' then
              (select public.sender_name(o.user_id) from public.group_members o
               where o.group_id = g.id and o.user_id <> uid limit 1) else g.name end,
    'description', g.description, 'avatar_url', g.avatar_url, 'owner_id', g.owner_id,
    'visibility', g.visibility, 'who_can_post', g.who_can_post,
    'slow_mode_seconds', g.slow_mode_seconds, 'member_count', g.member_count,
    'live_count', case when g.member_count > 10000 then 0 else g.live_count end,
    'is_member', m.user_id is not null, 'role', m.role,
    'notify_muted_until', m.notify_muted_until, 'last_read_at', m.last_read_at,
    'post_block', v_block.reason, 'post_block_until', v_block.until,
    'blocked_here', case when g.member_count <= 3 then v_blocked_here else 0 end,
    'weekly', case when g.weekly_book_id is null then null else jsonb_build_object(
      'book_id', g.weekly_book_id,
      'title', (select b.title from public.books b where b.id = g.weekly_book_id),
      'from', g.weekly_from_chapter, 'to', g.weekly_to_chapter, 'note', g.weekly_note) end,
    'pins', coalesce((select jsonb_agg(p.message_id order by p.pinned_at desc)
                      from public.message_pins p where p.group_id = g.id), '[]'::jsonb)
  );
end $$;

-- History, newest first: members get everything they can see; non-members of public groups get
-- a read-only preview of the last 20. Keyset paging on (created_at, id).
create function public.get_messages(p_group uuid, p_before timestamptz default null,
                                    p_before_id uuid default null, p_limit int default 50)
returns table (
  id uuid, group_id uuid, sender_id uuid, sender_name text, sender_avatar text,
  sender_is_author boolean, kind public.message_kind, body text, quote jsonb, reply_to_id uuid,
  reply_to jsonb, state public.message_state, created_at timestamptz, reactions jsonb,
  my_reaction text, pinned boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  v_member boolean;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  select * into g from public.groups x where x.id = p_group;
  v_member := public.is_group_member(p_group, uid);
  if g.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  elsif not v_member then
    if g.kind <> 'dm' and public.is_community_staff() then
      null;
    elsif g.visibility = 'public' and g.archived_at is null then
      if p_before is not null then return; end if;  -- preview has no older pages
      v_limit := least(v_limit, 20);
    else
      raise exception 'not_member' using errcode = 'insufficient_privilege';
    end if;
  end if;

  return query
    select x.id, x.group_id, x.sender_id, public.sender_name(x.sender_id), sp.avatar_url,
           coalesce(x.sender_id = g.owner_id and sp.is_author, false),
           x.kind,
           case when x.state = 'visible' then x.body end,
           case when x.state = 'visible' then x.quote end,
           x.reply_to_id,
           case when r.id is null then null else jsonb_build_object(
             'id', r.id, 'sender_name', public.sender_name(r.sender_id),
             'state', case when public.has_blocked(uid, r.sender_id) then 'blocked' else r.state::text end,
             'body', case when r.state = 'visible' and not public.has_blocked(uid, r.sender_id)
                          then left(coalesce(r.body, r.quote ->> 'text'), 140) end) end,
           x.state, x.created_at,
           coalesce((select jsonb_object_agg(t.emoji, t.n) from (
                       select rx.emoji, count(*) n from public.message_reactions rx
                       where rx.message_id = x.id and not public.has_blocked(uid, rx.user_id)
                       group by rx.emoji) t), '{}'::jsonb),
           (select rx.emoji from public.message_reactions rx where rx.message_id = x.id and rx.user_id = uid),
           exists (select 1 from public.message_pins p where p.message_id = x.id)
    from public.messages x
    left join public.profiles sp on sp.id = x.sender_id
    left join public.messages r on r.id = x.reply_to_id
    where x.group_id = p_group
      and x.state <> 'auto_hidden'
      and not public.has_blocked(uid, x.sender_id)
      and not exists (select 1 from public.reports rp where rp.reporter_id = uid
                        and rp.content_type = 'message' and rp.content_id = x.id)
      and (p_before is null or (x.created_at, x.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by x.created_at desc, x.id desc
    limit v_limit;
end $$;

create function public.join_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  m public.group_members;
begin
  select * into g from public.groups where id = p_group;
  if g.id is null or g.archived_at is not null or g.visibility <> 'public'
     or g.kind not in ('official', 'club', 'author', 'readalong') then
    raise exception 'not_joinable' using errcode = 'insufficient_privilege';
  end if;
  select * into m from public.group_members where group_id = p_group and user_id = uid;
  if m.banned_at is not null then
    raise exception 'banned' using errcode = 'insufficient_privilege';
  elsif m.user_id is null then
    insert into public.group_members (group_id, user_id, role) values (p_group, uid, 'member');
  end if;
end $$;

create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.group_members;
begin
  select * into m from public.group_members where group_id = p_group and user_id = auth.uid();
  if m.user_id is null or m.banned_at is not null then return; end if;
  if m.role = 'owner' then
    raise exception 'owner_cannot_leave' using errcode = 'insufficient_privilege';
  end if;
  if (select kind from public.groups where id = p_group) = 'dm' then
    raise exception 'dm_cannot_leave' using errcode = 'insufficient_privilege';
  end if;
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
end $$;

-- Mute push and the unread number until `p_until` (null = unmute; 'infinity' = until I turn it back on).
create function public.set_group_mute(p_group uuid, p_until timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_until is not null and p_until <= now() then
    raise exception 'bad until' using errcode = '22023';
  end if;
  update public.group_members set notify_muted_until = p_until
   where group_id = p_group and user_id = auth.uid() and banned_at is null;
  if not found then raise exception 'not_member' using errcode = 'insufficient_privilege'; end if;
end $$;

-- One reaction per person per message; the same emoji again (or null) removes it.
-- Returns the message's group and new counts, for the chat Worker to push to the DO.
create function public.react(p_message uuid, p_emoji text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  x public.messages;
  v_old text;
begin
  select * into x from public.messages where id = p_message;
  if x.id is null or x.state <> 'visible' or not public.is_group_member(x.group_id, uid) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select emoji into v_old from public.message_reactions where message_id = p_message and user_id = uid;
  if p_emoji is null or p_emoji = v_old then
    delete from public.message_reactions where message_id = p_message and user_id = uid;
  else
    insert into public.message_reactions (message_id, user_id, emoji) values (p_message, uid, p_emoji)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
  return jsonb_build_object('group_id', x.group_id, 'message_id', x.id,
    'reactions', coalesce((select jsonb_object_agg(t.emoji, t.n) from (
       select emoji, count(*) n from public.message_reactions where message_id = x.id group by emoji) t),
     '{}'::jsonb));
end $$;

create function public.pin_message(p_group uuid, p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_group_mod(p_group) or public.is_community_staff()) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.messages where id = p_message and group_id = p_group and state = 'visible') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform 1 from public.groups where id = p_group for update;
  if exists (select 1 from public.message_pins where group_id = p_group and message_id = p_message) then
    return;
  end if;
  if (select count(*) from public.message_pins where group_id = p_group) >= 3 then
    raise exception 'pin_limit' using errcode = '23514';
  end if;
  insert into public.message_pins (group_id, message_id, pinned_by) values (p_group, p_message, auth.uid());
end $$;

create function public.unpin_message(p_group uuid, p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.is_group_mod(p_group) or public.is_community_staff()) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  delete from public.message_pins where group_id = p_group and message_id = p_message;
end $$;

-- Sender deletes their own message: "This message was deleted" for everyone. The text is kept
-- 30 days only when the message has an open report.
create function public.delete_message(p_message uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.messages;
begin
  select * into x from public.messages where id = p_message for update;
  if x.id is null or x.sender_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  if x.state = 'deleted' then
    return jsonb_build_object('group_id', x.group_id, 'message_id', x.id);
  end if;
  if x.body is not null and exists (select 1 from public.reports r where r.content_type = 'message'
                                      and r.content_id = x.id and r.status <> 'resolved') then
    insert into public.message_retained (message_id, body) values (x.id, x.body)
    on conflict (message_id) do nothing;
  end if;
  update public.messages set state = 'deleted', body = null, quote = null, state_changed_at = now()
   where id = x.id;
  delete from public.message_pins where message_id = x.id;
  return jsonb_build_object('group_id', x.group_id, 'message_id', x.id);
end $$;

-- Block a person (staff and yourself can't be blocked). `p_at` restores the original date on Undo.
create function public.block_user(p_user uuid, p_source_group uuid default null,
                                  p_at timestamptz default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  if auth.uid() is null or p_user is null or p_user = auth.uid()
     or exists (select 1 from public.staff_roles s where s.user_id = p_user and s.active) then
    raise exception 'not_blockable' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id, source_group_id, created_at)
  values (auth.uid(), p_user,
          case when public.is_group_member(p_source_group) then p_source_group end,
          least(coalesce(p_at, now()), now()))
  on conflict (blocker_id, blocked_id) do nothing;
  -- Flow 08 adds: unfollow the author and hide pending DM threads.
  select created_at into v_at from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
  return v_at;
end $$;

-- Returns the removed row's details so Undo can restore them.
create function public.unblock_user(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.user_blocks;
begin
  delete from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user returning * into b;
  if b.blocker_id is null then return null; end if;
  return jsonb_build_object('user_id', b.blocked_id, 'source_group_id', b.source_group_id, 'created_at', b.created_at);
end $$;

create function public.get_blocked()
returns table (user_id uuid, full_name text, avatar_url text, created_at timestamptz,
               source_group_id uuid, source_kind public.group_kind, source_name text)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, public.sender_name(b.blocked_id), p.avatar_url, b.created_at,
         b.source_group_id, g.kind, g.name
  from public.user_blocks b
  left join public.profiles p on p.id = b.blocked_id
  left join public.groups g on g.id = b.source_group_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

-- Report a message (flow 14 adds the other content types). Hides it for the reporter; one report
-- per item ("already_reported"). Optionally blocks the sender in the same step.
create function public.report_message(p_message uuid, p_reason public.report_reason,
                                      p_details text default null, p_also_block boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  x public.messages;
  g public.groups;
  v_sev public.report_severity := public.report_severity_for(p_reason);
  v_ref text;
begin
  select * into x from public.messages where id = p_message;
  if x.id is null or x.state = 'auto_hidden' or not public.is_group_member(x.group_id, uid) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if x.sender_id = uid then
    raise exception 'own_message' using errcode = 'insufficient_privilege';
  end if;
  if char_length(p_details) > 500 then
    raise exception 'details too long' using errcode = '22001';
  end if;
  select * into g from public.groups where id = x.group_id;
  begin
    insert into public.reports (reporter_id, content_type, content_id, reported_user_id, group_id,
                                reason, details, severity, due_at, snapshot)
    values (uid, case when g.kind = 'dm' then 'dm' else 'message' end::public.report_content_type,
            x.id, x.sender_id, x.group_id, p_reason, nullif(btrim(p_details), ''), v_sev,
            now() + case when v_sev = 'high' then interval '24 hours' else interval '3 days' end,
            jsonb_build_object('body', x.body, 'quote', x.quote, 'sender_name', public.sender_name(x.sender_id),
                               'group_name', g.name, 'created_at', x.created_at))
    returning ref into v_ref;
  exception when unique_violation then
    raise exception 'already_reported' using errcode = '23505';
  end;
  if p_also_block and x.sender_id is not null
     and not exists (select 1 from public.staff_roles s where s.user_id = x.sender_id and s.active) then
    perform public.block_user(x.sender_id, x.group_id);
  end if;
  return v_ref;
end $$;

-- Discover: public groups by name/description (2+ characters), type all | groups | authors |
-- readalongs | official. Live and joined flags for the card.
create function public.search_communities(p_q text default null, p_type text default 'all',
                                          p_limit int default 30, p_offset int default 0)
returns table (id uuid, kind public.group_kind, name text, description text, avatar_url text,
               member_count int, live boolean, joined boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if v_q is not null and char_length(v_q) < 2 then v_q := null; end if;
  return query
    select g.id, g.kind, g.name, g.description, g.avatar_url, g.member_count,
           coalesce(g.live_count >= 2 and g.live_at > now() - interval '5 minutes' and g.member_count <= 10000, false),
           public.is_group_member(g.id)
    from public.groups g
    where g.visibility = 'public' and g.archived_at is null
      and g.kind in ('official', 'club', 'author', 'readalong')
      and (coalesce(p_type, 'all') = 'all'
           or (p_type = 'groups' and g.kind = 'club') or (p_type = 'authors' and g.kind = 'author')
           or (p_type = 'readalongs' and g.kind = 'readalong') or (p_type = 'official' and g.kind = 'official'))
      and (v_q is null
           or (g.name || ' ' || coalesce(g.description, '')) ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
           or extensions.word_similarity(v_q, g.name || ' ' || coalesce(g.description, '')) > 0.4)
    order by (v_q is not null and g.name ilike v_q || '%') desc, g.member_count desc, g.name
    limit least(greatest(coalesce(p_limit, 30), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;

-- ─── Durable Object (service role) RPCs ─────────────────────────────────────
-- What the group's Durable Object caches for a user (60 s): ok | not_member | banned | archived
-- (+ preview for public groups), the post block, slow mode, new-account flag and who they blocked.
create function public.get_group_access(p_group uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.groups;
  m public.group_members;
  v_block record;
  v_access text;
begin
  select * into g from public.groups where id = p_group;
  select * into m from public.group_members where group_id = p_group and user_id = p_user;
  v_access := case
    when g.id is null or g.archived_at is not null then 'archived'
    when m.banned_at is not null then 'banned'
    when m.user_id is not null then 'ok'
    when g.kind <> 'dm' and exists (select 1 from public.staff_roles s where s.user_id = p_user and s.active
                                     and s.role in ('moderator', 'super_admin')) then 'staff'
    when g.visibility = 'public' then 'preview'
    else 'not_member' end;
  select * into v_block from public.post_block_for(p_group, p_user);
  return jsonb_build_object(
    'access', v_access,
    'role', m.role,
    'kind', g.kind,
    'is_staff', exists (select 1 from public.staff_roles s where s.user_id = p_user and s.active),
    'post_block', v_block.reason, 'post_block_until', v_block.until,
    'slow_mode_seconds', coalesce(g.slow_mode_seconds, 0),
    'new_account', coalesce((select u.created_at > now() - interval '7 days' from auth.users u where u.id = p_user), true),
    'muted_words', coalesce(to_jsonb(g.muted_words), '[]'::jsonb),
    'member_count', coalesce(g.member_count, 0),
    'blocked', coalesce((select jsonb_agg(b.blocked_id) from public.user_blocks b where b.blocker_id = p_user), '[]'::jsonb),
    'sender_name', public.sender_name(p_user),
    'sender_avatar', (select p.avatar_url from public.profiles p where p.id = p_user),
    'sender_is_author', coalesce(p_user = g.owner_id and (select p.is_author from public.profiles p where p.id = p_user), false)
  );
end $$;

-- A shared highlight needs access to that text: a preview chapter (free) or an unlock.
create function public.can_quote(p_user uuid, p_book uuid, p_chapter int) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.books b
    join public.chapters c on c.revision_id = b.current_revision_id and c.ord = p_chapter
    where b.id = p_book and b.status = 'live'
      and (c.price_credits = 0
           or exists (select 1 from public.entitlements e where e.user_id = p_user and e.book_id = b.id
                        and e.revoked_at is null
                        and (e.scope = 'book' or e.chapter_uid = c.chapter_uid))))
$$;

-- Write a batch from a Durable Object. Idempotent on (sender_id, client_id): a retried batch
-- returns the stored ids. Re-checks membership and posting rights, since the DO's cache may be
-- stale. Each item: {id, group_id, sender_id, client_id, kind, body, quote, reply_to_id, state,
-- created_at}. auto_hidden items also open an automatic report.
-- Returns [{client_id, sender_id, id, status: stored | duplicate | rejected, reason?}].
create function public.persist_messages(p_batch jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  v_out jsonb := '[]'::jsonb;
  v_id uuid;
  v_sender uuid;
  v_group uuid;
  v_client uuid;
  v_state public.message_state;
  v_block record;
  v_body text;
  v_at timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'persist_messages: service only' using errcode = 'insufficient_privilege';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_batch, '[]'::jsonb)) loop
    v_sender := (it ->> 'sender_id')::uuid;
    v_group := (it ->> 'group_id')::uuid;
    v_client := (it ->> 'client_id')::uuid;
    v_state := coalesce(it ->> 'state', 'visible')::public.message_state;
    v_body := nullif(btrim(it ->> 'body'), '');
    v_at := least(coalesce((it ->> 'created_at')::timestamptz, now()), now());

    select id into v_id from public.messages where sender_id = v_sender and client_id = v_client;
    if v_id is not null then
      v_out := v_out || jsonb_build_object('client_id', v_client, 'sender_id', v_sender, 'id', v_id, 'status', 'duplicate');
      continue;
    end if;

    select * into v_block from public.post_block_for(v_group, v_sender);
    if v_block.reason is not null then
      -- Not a member any more, banned, muted, or the chat closed: never stored.
      v_out := v_out || jsonb_build_object('client_id', v_client, 'sender_id', v_sender, 'status', 'rejected', 'reason', v_block.reason);
      continue;
    end if;

    insert into public.messages (id, group_id, sender_id, client_id, kind, body, quote, reply_to_id, state, created_at)
    values (coalesce((it ->> 'id')::uuid, public.uuid7(v_at)), v_group, v_sender, v_client,
            coalesce(it ->> 'kind', 'text')::public.message_kind, v_body, it -> 'quote',
            (select r.id from public.messages r where r.id = (it ->> 'reply_to_id')::uuid and r.group_id = v_group),
            v_state, v_at)
    on conflict (sender_id, client_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.messages where sender_id = v_sender and client_id = v_client;
      v_out := v_out || jsonb_build_object('client_id', v_client, 'sender_id', v_sender, 'id', v_id, 'status', 'duplicate');
      continue;
    end if;

    if v_state = 'auto_hidden' then
      insert into public.reports (reporter_id, content_type, content_id, reported_user_id, group_id, reason,
                                  details, severity, status, due_at, snapshot)
      values (null, 'message', v_id, v_sender, v_group, coalesce(it ->> 'rule_reason', 'other')::public.report_reason,
              'Hidden automatically by a safety rule', 'low', 'auto_hidden', now() + interval '3 days',
              jsonb_build_object('body', v_body, 'sender_name', public.sender_name(v_sender)));
    else
      update public.groups set last_message_at = greatest(coalesce(last_message_at, v_at), v_at) where id = v_group;
    end if;
    v_out := v_out || jsonb_build_object('client_id', v_client, 'sender_id', v_sender, 'id', v_id, 'status', 'stored');
  end loop;
  return v_out;
end $$;

-- Presence from the Durable Object: how many members have the chat open (Live = 2 or more).
create function public.set_live_count(p_group uuid, p_count int) returns void
language sql security definer set search_path = '' as $$
  update public.groups set live_count = greatest(p_count, 0), live_at = now() where id = p_group
$$;

-- The user's last socket on the group closed.
create function public.touch_last_seen(p_group uuid, p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.group_members set last_seen_at = now() where group_id = p_group and user_id = p_user
$$;

-- ─── Staff (admin console) RPCs ─────────────────────────────────────────────
-- Channels list: everything but DMs and reading rooms, with 7-day messages, open reports and status.
create function public.admin_list_channels(p_kind text default null, p_status text default null,
                                           p_reports boolean default null, p_q text default null)
returns table (id uuid, kind public.group_kind, name text, owner_id uuid, owner_name text,
               who_can_post public.group_who_can_post, visibility public.group_visibility,
               member_count int, messages_7d int, open_reports int, status text,
               locked_until timestamptz, muted_until timestamptz, created_at timestamptz,
               slow_mode_seconds int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_community_admin(false);
  return query
    select * from (
      select g.id as gid, g.kind as gkind, g.name as gname, g.owner_id as oid,
             public.sender_name(g.owner_id) as oname, g.who_can_post as wcp, g.visibility as vis,
             g.member_count as mc,
             (select count(*)::int from public.messages x where x.group_id = g.id
                and x.created_at > now() - interval '7 days') as m7,
             (select count(*)::int from public.reports r where r.group_id = g.id and r.status <> 'resolved') as reps,
             case when g.locked_until > now() then 'locked'
                  when coalesce(g.last_message_at, g.created_at) < now() - interval '7 days' then 'quiet'
                  else 'active' end as st,
             g.locked_until as lu, g.muted_until as mu, g.created_at as ca, g.slow_mode_seconds as sm
      from public.groups g
      where g.kind in ('official', 'club', 'author', 'readalong') and g.archived_at is null
        and (p_kind is null or g.kind::text = p_kind)
        and (p_q is null or g.name ilike '%' || p_q || '%' or public.sender_name(g.owner_id) ilike '%' || p_q || '%')
    ) t
    where (p_status is null or t.st = p_status)
      and (p_reports is null or (t.reps > 0) = p_reports)
    order by t.m7 desc, t.mc desc, t.gname;
end $$;

-- The four numbers on the Community page.
create function public.admin_community_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  perform public.require_community_admin(false);
  return jsonb_build_object(
    'channels', (select count(*) from public.groups where kind in ('official', 'club', 'author', 'readalong') and archived_at is null),
    'official', (select count(*) from public.groups where kind = 'official' and archived_at is null),
    'author', (select count(*) from public.groups where kind = 'author' and archived_at is null),
    'rooms_live', (select count(*) from public.groups where kind = 'room' and archived_at is null
                     and live_count >= 1 and live_at > now() - interval '5 minutes'),
    'rooms_readers', (select coalesce(sum(live_count), 0) from public.groups where kind = 'room' and archived_at is null
                        and live_at > now() - interval '5 minutes'),
    'messages_today', (select count(*) from public.messages where created_at >= v_today),
    'messages_last_week', (select count(*) from public.messages
                           where created_at >= v_today - interval '7 days'
                             and created_at < now() - interval '7 days'),
    'muted', (select count(*) from public.group_members where muted_until > now()),
    'muted_ending_week', (select count(*) from public.group_members
                          where muted_until > now() and muted_until < now() + interval '7 days')
  );
end $$;

create function public.admin_create_official_channel(p_name text, p_description text,
  p_who_can_post public.group_who_can_post default 'staff',
  p_visibility public.group_visibility default 'public') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.require_community_admin(true);
  insert into public.groups (kind, name, description, owner_id, who_can_post, visibility)
  values ('official', btrim(p_name), nullif(btrim(p_description), ''), auth.uid(), p_who_can_post, p_visibility)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, auth.uid(), 'owner');
  perform public.write_audit('community', 'channel.create', 'group', v_id::text, btrim(p_name),
    'Created official channel', null,
    jsonb_build_object('who_can_post', p_who_can_post, 'visibility', p_visibility));
  return v_id;
end $$;

-- Channel detail: settings, members (role, messages, joined) and flagged messages.
create function public.admin_get_channel(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g public.groups;
begin
  perform public.require_community_admin(false);
  select * into g from public.groups where id = p_group and kind <> 'dm';
  if g.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'group', to_jsonb(g) - 'live_count' - 'live_at' || jsonb_build_object(
      'owner_name', public.sender_name(g.owner_id),
      'members_week', (select count(*) from public.group_members m where m.group_id = g.id
                         and m.banned_at is null and m.joined_at > now() - interval '7 days'),
      'messages_7d', (select count(*) from public.messages x where x.group_id = g.id and x.created_at > now() - interval '7 days'),
      'posters_7d', (select count(distinct x.sender_id) from public.messages x where x.group_id = g.id
                       and x.created_at > now() - interval '7 days'),
      'open_reports', (select count(*) from public.reports r where r.group_id = g.id and r.status <> 'resolved'),
      'oldest_report_at', (select min(r.created_at) from public.reports r where r.group_id = g.id and r.status <> 'resolved'),
      'moderators', coalesce((select jsonb_agg(public.sender_name(m.user_id) order by m.joined_at)
                              from public.group_members m where m.group_id = g.id and m.role = 'moderator'
                                and m.banned_at is null), '[]'::jsonb)),
    'pins', coalesce((select jsonb_agg(jsonb_build_object(
        'message_id', p.message_id, 'body', coalesce(x.body, x.quote ->> 'text'),
        'sender_name', public.sender_name(x.sender_id), 'pinned_at', p.pinned_at) order by p.pinned_at)
      from public.message_pins p join public.messages x on x.id = p.message_id where p.group_id = g.id), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'name', public.sender_name(m.user_id), 'role', m.role, 'joined_at', m.joined_at,
        'muted_until', m.muted_until, 'banned_at', m.banned_at,
        'messages', (select count(*) from public.messages x where x.group_id = g.id and x.sender_id = m.user_id))
        order by m.role, m.joined_at)
      from (select * from public.group_members where group_id = g.id order by role, joined_at limit 200) m), '[]'::jsonb),
    'flagged', coalesce((select jsonb_agg(jsonb_build_object(
        'report_id', r.id, 'ref', r.ref, 'message_id', r.content_id, 'reason', r.reason, 'severity', r.severity,
        'status', r.status, 'sender_name', r.snapshot ->> 'sender_name', 'body', r.snapshot ->> 'body',
        'created_at', r.created_at) order by r.created_at desc)
      from (select * from public.reports where group_id = g.id and status <> 'resolved'
            order by created_at desc limit 50) r), '[]'::jsonb)
  );
end $$;

-- Change visibility, who can post, slow mode or muted words (owner stays the author).
create function public.admin_update_channel(p_group uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
  v_after public.groups;
begin
  perform public.require_community_admin(true);
  select * into g from public.groups where id = p_group and kind <> 'dm' for update;
  if g.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.groups set
    visibility = coalesce((p_patch ->> 'visibility')::public.group_visibility, visibility),
    who_can_post = coalesce((p_patch ->> 'who_can_post')::public.group_who_can_post, who_can_post),
    slow_mode_seconds = coalesce((p_patch ->> 'slow_mode_seconds')::int, slow_mode_seconds),
    muted_words = case when p_patch ? 'muted_words' then
      array(select distinct lower(btrim(w)) from jsonb_array_elements_text(p_patch -> 'muted_words') w
            where btrim(w) <> '') else muted_words end,
    name = coalesce(nullif(btrim(p_patch ->> 'name'), ''), name),
    description = case when p_patch ? 'description' then nullif(btrim(p_patch ->> 'description'), '') else description end
  where id = p_group returning * into v_after;
  perform public.write_audit('community', 'channel.update', 'group', g.id::text, g.name, 'Changed channel settings',
    jsonb_build_object('visibility', g.visibility, 'who_can_post', g.who_can_post,
                       'slow_mode_seconds', g.slow_mode_seconds, 'muted_words', g.muted_words),
    jsonb_build_object('visibility', v_after.visibility, 'who_can_post', v_after.who_can_post,
                       'slow_mode_seconds', v_after.slow_mode_seconds, 'muted_words', v_after.muted_words),
    p_reason);
end $$;

-- Lock chat (until a time, or null to unlock) and mute the channel (24 hours, or null).
create function public.admin_set_channel_state(p_group uuid, p_lock_until timestamptz, p_mute_until timestamptz,
                                               p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  perform public.require_community_admin(true);
  select * into g from public.groups where id = p_group and kind <> 'dm' for update;
  if g.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.groups set locked_until = p_lock_until, muted_until = p_mute_until where id = p_group;
  perform public.write_audit('community', 'channel.state', 'group', g.id::text, g.name,
    case when p_lock_until > now() then 'Locked chat' when p_mute_until > now() then 'Muted channel'
         else 'Opened chat' end,
    jsonb_build_object('locked_until', g.locked_until, 'muted_until', g.muted_until),
    jsonb_build_object('locked_until', p_lock_until, 'muted_until', p_mute_until), p_reason);
end $$;

create function public.admin_mute_member(p_group uuid, p_user uuid, p_until timestamptz,
                                         p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.group_members;
begin
  perform public.require_community_admin(true);
  select * into m from public.group_members where group_id = p_group and user_id = p_user for update;
  if m.user_id is null then raise exception 'not_member' using errcode = 'P0002'; end if;
  if m.role = 'owner' and p_until is not null then
    raise exception 'owner_cannot_be_muted' using errcode = 'insufficient_privilege';
  end if;
  update public.group_members set muted_until = p_until, muted_by = auth.uid()
   where group_id = p_group and user_id = p_user;
  perform public.write_audit('community', case when p_until > now() then 'member.mute' else 'member.unmute' end,
    'group_member', p_group::text || ':' || p_user::text, public.sender_name(p_user),
    case when p_until > now() then 'Muted member' else 'Unmuted member' end,
    jsonb_build_object('muted_until', m.muted_until), jsonb_build_object('muted_until', p_until), p_reason);
end $$;

-- ─── Jobs ───────────────────────────────────────────────────────────────────
create function public.refresh_member_counts() returns void
language sql security definer set search_path = '' as $$
  update public.groups g set member_count = c.n
  from (select g2.id, (select count(*) from public.group_members m
                       where m.group_id = g2.id and m.banned_at is null)::int n
        from public.groups g2) c
  where c.id = g.id and g.member_count <> c.n
$$;

create function public.purge_deleted_messages() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.message_retained where purge_at < now();
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('refresh_member_counts', '15 2 * * *', 'select public.refresh_member_counts()');
    perform cron.schedule('purge_deleted_messages', '30 2 * * *', 'select public.purge_deleted_messages()');
  end if;
end $$;

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Supabase grants every new function to anon and authenticated: take this flow's back, then
-- grant only what each caller needs.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
      'uuid7', 'group_members_count', 'is_group_member', 'is_group_mod', 'is_community_staff',
      'community_admin', 'require_community_admin', 'has_blocked', 'sender_name', 'is_minor',
      'report_severity_for', 'inbox_rows_for', 'get_inbox', 'get_inbox_counts', 'mark_all_read',
      'mark_read', 'post_block_for', 'get_group', 'get_messages', 'join_group', 'leave_group',
      'set_group_mute', 'react', 'pin_message', 'unpin_message', 'delete_message', 'block_user',
      'unblock_user', 'get_blocked', 'report_message', 'search_communities', 'get_group_access',
      'can_quote', 'persist_messages', 'set_live_count', 'touch_last_seen', 'admin_list_channels',
      'admin_create_official_channel', 'admin_get_channel', 'admin_update_channel',
      'admin_set_channel_state', 'admin_mute_member', 'admin_community_stats', 'refresh_member_counts',
      'purge_deleted_messages'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function
  public.get_inbox(text, int, timestamptz), public.get_inbox_counts(), public.mark_all_read(),
  public.mark_read(uuid, uuid), public.get_group(uuid),
  public.get_messages(uuid, timestamptz, uuid, int), public.join_group(uuid), public.leave_group(uuid),
  public.set_group_mute(uuid, timestamptz), public.react(uuid, text), public.pin_message(uuid, uuid),
  public.unpin_message(uuid, uuid), public.delete_message(uuid),
  public.block_user(uuid, uuid, timestamptz), public.unblock_user(uuid), public.get_blocked(),
  public.report_message(uuid, public.report_reason, text, boolean),
  public.search_communities(text, text, int, int),
  public.admin_list_channels(text, text, boolean, text),
  public.admin_create_official_channel(text, text, public.group_who_can_post, public.group_visibility),
  public.admin_get_channel(uuid), public.admin_update_channel(uuid, jsonb, text), public.admin_community_stats(),
  public.admin_set_channel_state(uuid, timestamptz, timestamptz, text),
  public.admin_mute_member(uuid, uuid, timestamptz, text),
  -- used inside RLS policies
  public.is_group_member(uuid, uuid), public.is_community_staff(), public.has_blocked(uuid, uuid)
  to authenticated;

-- Durable Object and Worker only.
grant execute on function public.get_group_access(uuid, uuid), public.persist_messages(jsonb),
  public.set_live_count(uuid, int), public.touch_last_seen(uuid, uuid), public.can_quote(uuid, uuid, int),
  public.refresh_member_counts(), public.purge_deleted_messages()
  to service_role;
