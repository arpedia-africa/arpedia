-- Flow 08 · Authors: follow, author profile, posts and comments, paid private messages.
--
-- Reuses: flow 03's `follows` (the spec's `author_follows`: follower_id, followee_id = author),
-- flow 06's `groups` (kind 'author' = the community, kind 'dm' = a reader–author thread with
-- owner_id = the author), `group_members.cost_ack_at`, `messages.cost_credits` / `ledger_id`,
-- `user_blocks`; flow 03/09's `spend_credits` (reason 'message', author earning per credit).
-- Author approval and profile fields (pen name, location, suspended) are flow 11's
-- `author_profiles`, read through to_regclass so this migration doesn't need it.

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.post_state as enum ('draft', 'published', 'removed');
create type public.comment_state as enum ('visible', 'auto_hidden', 'removed', 'deleted');

-- ─── Config ─────────────────────────────────────────────────────────────────
insert into public.app_config (key, value) values
  ('author_message_cost_credits', '5'),
  ('author_message_max_chars', '1000'),
  -- Paid messages per reader per day across all authors (flow 14's daily DM limit).
  ('author_message_daily_limit', '50')
on conflict (key) do nothing;

-- ─── Follows: the author reads counts only (default Q4) ─────────────────────
drop policy follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated
  using (follower_id = (select auth.uid()));

-- ─── author_stats ───────────────────────────────────────────────────────────
create table public.author_stats (
  author_id uuid primary key references public.profiles (id) on delete cascade,
  follower_count int not null default 0 check (follower_count >= 0),
  reader_count int not null default 0 check (reader_count >= 0),
  avg_rating numeric(2, 1),
  rating_count int not null default 0 check (rating_count >= 0),
  median_reply_hours numeric,
  reply_sample_size int not null default 0 check (reply_sample_size >= 0),
  updated_at timestamptz not null default now()
);

create function public._follows_count_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_author uuid := coalesce(new.followee_id, old.followee_id);
begin
  -- A follow removed by the followee's profile cascade must not re-create their stats row.
  if not exists (select 1 from public.profiles where id = v_author) then
    return null;
  end if;
  insert into public.author_stats (author_id, follower_count)
  values (v_author, (select count(*) from public.follows where followee_id = v_author))
  on conflict (author_id) do update
    set follower_count = excluded.follower_count, updated_at = now();
  return null;
end $$;
create trigger follows_count after insert or delete on public.follows
  for each row execute function public._follows_count_trigger();

-- ─── author_posts ───────────────────────────────────────────────────────────
create table public.author_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(body) between 1 and 5000),
  state public.post_state not null default 'draft',
  like_count int not null default 0 check (like_count >= 0),
  comment_count int not null default 0 check (comment_count >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (state <> 'published' or published_at is not null)
);
create index author_posts_author_idx on public.author_posts (author_id, published_at desc)
  where state = 'published';
create trigger author_posts_updated_at before update on public.author_posts
  for each row execute function public.set_updated_at();

create table public.post_likes (
  post_id uuid not null references public.author_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.author_posts (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  -- One level deep: a reply to a reply attaches to the same parent.
  parent_id uuid references public.post_comments (id) on delete cascade,
  client_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  state public.comment_state not null default 'visible',
  created_at timestamptz not null default now(),
  state_changed_at timestamptz
);
create unique index post_comments_client_idx on public.post_comments (user_id, client_id);
create index post_comments_post_idx on public.post_comments (post_id, created_at, id) where parent_id is null;
create index post_comments_parent_idx on public.post_comments (parent_id, created_at) where parent_id is not null;
create index post_comments_user_idx on public.post_comments (user_id, created_at desc);

create function public._post_counts_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_post uuid := coalesce(new.post_id, old.post_id);
begin
  if tg_table_name = 'post_likes' then
    update public.author_posts
       set like_count = (select count(*) from public.post_likes where post_id = v_post)
     where id = v_post;
  else
    update public.author_posts
       set comment_count = (select count(*) from public.post_comments
                            where post_id = v_post and state = 'visible')
     where id = v_post;
  end if;
  return null;
end $$;
create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public._post_counts_trigger();
create trigger post_comments_count after insert or delete or update of state on public.post_comments
  for each row execute function public._post_counts_trigger();

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- Flow 11's author profile fields (pen_name, bio, photo_url, location, status), or {} before it exists.
create function public._author_extra(p_author uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if to_regclass('public.author_profiles') is not null then
    execute 'select to_jsonb(a) from public.author_profiles a where a.user_id = $1' into v using p_author;
  end if;
  return coalesce(v, '{}'::jsonb);
end $$;

-- active | suspended | gone (deleted account) | not_author.
create function public._author_state(p_author uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = p_author;
  if p.id is null or p.deleted_at is not null then
    return case when p.id is null then 'not_author' else 'gone' end;
  elsif not p.is_author then
    return 'not_author';
  elsif public._author_extra(p_author) ->> 'status' = 'suspended' then
    return 'suspended';
  end if;
  return 'active';
end $$;

create function public._author_name(p_author uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(public._author_extra(p_author) ->> 'pen_name'), ''),
                  nullif(btrim(p.full_name), ''), 'Author')
  from public.profiles p where p.id = p_author
$$;

-- Reply-time label (rule 23): only with 5+ replies in the last 30 days.
create function public._reply_label(p_author uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when s.reply_sample_size < 5 or s.median_reply_hours is null then null
              when s.median_reply_hours < 24 then 'within a day'
              else 'within a few days' end
  from public.author_stats s where s.author_id = p_author
$$;

-- The caller's DM thread with an author (kind 'dm', owner = the author), if any.
create function public._author_dm(p_reader uuid, p_author uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select g.id from public.groups g
  join public.group_members r on r.group_id = g.id and r.user_id = p_reader
  where g.kind = 'dm' and g.owner_id = p_author and g.archived_at is null
  order by g.created_at limit 1
$$;

-- Why the reader can't message the author (null = can): blocked (the reader blocked them),
-- author_unavailable (the author blocked the reader, suspended, gone), own_profile.
create function public._dm_block(p_reader uuid, p_author uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_reader = p_author then 'own_profile'
    when public.has_blocked(p_reader, p_author) then 'blocked'
    when public._author_state(p_author) <> 'active' then 'author_unavailable'
    when public.has_blocked(p_author, p_reader) then 'author_unavailable'
  end
$$;

-- Links and phone numbers (rule 16, spam): blocked for accounts under 7 days old.
create function public._has_link_or_phone(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select p_text ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|ng|net|org|io|me|co|africa|link|ly)\M)'
      -- Phone numbers only (Nigerian 0803… / 234803… or +country), not any long number.
      or regexp_replace(p_text, '[\s().-]', '', 'g') ~ '(\+\d{10,14}|(^|\D)(234|0)[789][01]\d{8}(\D|$))'
$$;

create function public._is_new_account(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.created_at > now() - interval '7 days' from auth.users u where u.id = p_user), true)
$$;

-- ─── Posting rules in chat (replaces flow 06's post_block_for) ──────────────
-- Same as flow 06 plus: followers may post in 'owner_and_followers' groups, and in a reader–author
-- DM only the author posts through the chat path; the reader's paid messages go through
-- send_author_message (so the Durable Object can never store a free one). Flow 14 (#16) also
-- replaces this function; whichever merges second keeps both sets of rules.
create or replace function public.post_block_for(p_group uuid, p_user uuid)
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
  elsif g.who_can_post = 'owner_and_followers' and m.role = 'member' and not v_staff
        and not exists (select 1 from public.follows f
                        where f.follower_id = p_user and f.followee_id = g.owner_id) then
    return query select 'owner_only', null::timestamptz;
  elsif g.kind = 'dm' and exists (select 1 from public.group_members o
                                  where o.group_id = p_group and o.user_id <> p_user
                                    and public.has_blocked(o.user_id, p_user)) then
    return query select 'blocked', null::timestamptz;
  elsif g.kind = 'dm' and g.owner_id is not null and p_user <> g.owner_id then
    return query select 'paid_only', null::timestamptz;
  elsif g.kind = 'dm' and g.owner_id = p_user and public._author_state(p_user) <> 'active' then
    return query select 'author_unavailable', null::timestamptz;
  end if;
end $$;

-- Blocking an author also unfollows them (both ways); the DM thread hides through has_blocked.
create or replace function public.block_user(p_user uuid, p_source_group uuid default null,
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
  delete from public.follows
   where (follower_id = auth.uid() and followee_id = p_user)
      or (follower_id = p_user and followee_id = auth.uid());
  select created_at into v_at from public.user_blocks where blocker_id = auth.uid() and blocked_id = p_user;
  return v_at;
end $$;

-- ─── Follow ─────────────────────────────────────────────────────────────────
create function public._set_author_follow(p_author uuid, p_follow boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
begin
  if p_follow then
    if p_author = v_user then
      perform public._raise('own_profile');
    end if;
    if public._author_state(p_author) = 'not_author' then
      perform public._raise('not_found');
    end if;
    if public.has_blocked(v_user, p_author) or public.has_blocked(p_author, v_user) then
      perform public._raise('blocked');
    end if;
    insert into public.follows (follower_id, followee_id) values (v_user, p_author) on conflict do nothing;
  else
    delete from public.follows where follower_id = v_user and followee_id = p_author;
  end if;
  return jsonb_build_object('following', p_follow,
    'follower_count', coalesce((select follower_count from public.author_stats where author_id = p_author), 0));
end $$;

create function public.follow_author(p_author uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select public._set_author_follow(p_author, true)
$$;

create function public.unfollow_author(p_author uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select public._set_author_follow(p_author, false)
$$;

-- ─── Author profile ─────────────────────────────────────────────────────────
create function public.get_author_profile(p_author uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  p public.profiles;
  x jsonb := public._author_extra(p_author);
  s public.author_stats;
  g public.groups;
  v_state text := public._author_state(p_author);
  v_dm uuid;
  v_block text;
begin
  select * into p from public.profiles where id = p_author;
  if p.id is null or (v_state = 'not_author' and p.deleted_at is null) then
    perform public._raise('not_found');
  end if;
  select * into s from public.author_stats where author_id = p_author;
  select * into g from public.groups
   where kind = 'author' and owner_id = p_author and archived_at is null
   order by created_at limit 1;
  v_dm := public._author_dm(v_user, p_author);
  v_block := public._dm_block(v_user, p_author);

  return jsonb_build_object(
    'id', p.id,
    'name', public._author_name(p_author),
    'avatar_url', coalesce(x ->> 'photo_url', p.avatar_url),
    'bio', coalesce(nullif(x ->> 'bio', ''), p.bio),
    'location', x ->> 'location',
    'country', p.country,
    'joined_at', p.created_at,
    'state', v_state,
    'is_me', p_author = v_user,
    'genres', coalesce((select jsonb_agg(distinct gn) from public.books b, unnest(b.genres) gn
                        where b.author_id = p_author and b.status = 'live'), '[]'::jsonb),
    'book_count', (select count(*) from public.books b where b.author_id = p_author and b.status = 'live'),
    'post_count', (select count(*) from public.author_posts a where a.author_id = p_author and a.state = 'published'),
    'follower_count', coalesce(s.follower_count, 0),
    'reader_count', coalesce(s.reader_count, 0),
    'avg_rating', case when coalesce(s.rating_count, 0) >= 5 then s.avg_rating end,
    'following', exists (select 1 from public.follows f where f.follower_id = v_user and f.followee_id = p_author),
    'blocked_by_me', public.has_blocked(v_user, p_author),
    'community', case when g.id is null then null else jsonb_build_object(
      'id', g.id, 'name', g.name, 'member_count', g.member_count,
      'joined', public.is_group_member(g.id, v_user)) end,
    'message', jsonb_build_object(
      'available', v_block is null,
      -- 'blocked' is the viewer's own block; any other reason shows "isn't taking messages".
      'reason', v_block,
      'cost_credits', (public._config('author_message_cost_credits'))::int,
      'max_chars', (public._config('author_message_max_chars'))::int,
      'group_id', v_dm,
      'cost_ack', coalesce((select m.cost_ack_at is not null from public.group_members m
                            where m.group_id = v_dm and m.user_id = v_user), false),
      'reply_label', public._reply_label(p_author)));
end $$;

-- Posts tab: newest first, keyset on published_at. Hidden when the viewer blocked the author.
create function public.get_author_posts(p_author uuid, p_before timestamptz default null, p_limit int default 20)
returns table (id uuid, title text, excerpt text, like_count int, comment_count int,
               published_at timestamptz, liked boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := public._uid();
begin
  if public.has_blocked(v_user, p_author) then
    return;
  end if;
  return query
    select a.id, a.title, left(regexp_replace(a.body, '\s+', ' ', 'g'), 240), a.like_count, a.comment_count,
           a.published_at,
           exists (select 1 from public.post_likes l where l.post_id = a.id and l.user_id = v_user)
    from public.author_posts a
    where a.author_id = p_author and a.state = 'published'
      and (p_before is null or a.published_at < p_before)
    order by a.published_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

-- Books tab: the author's live books with rating and price in credits.
create function public.get_author_books(p_author uuid)
returns table (id uuid, title text, genres text[], avg_rating numeric, rating_count int, price_credits int)
language sql stable security definer set search_path = '' as $$
  select b.id, b.title, b.genres, case when coalesce(r.count, 0) >= 5 then round(r.avg, 1) end,
         coalesce(r.count, 0)::int, e.effective_price::int
  from public.books b
  left join public.book_rating_stats r on r.book_id = b.id
  left join public.book_effective e on e.book_id = b.id
  where b.author_id = p_author and b.status = 'live' and auth.uid() is not null
  order by b.created_at desc
$$;

-- ─── Posts and comments ─────────────────────────────────────────────────────
create function public.get_post(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  a public.author_posts;
begin
  select * into a from public.author_posts where id = p_post;
  if a.id is null or (a.state <> 'published' and a.author_id <> v_user)
     or public.has_blocked(v_user, a.author_id) then
    perform public._raise('not_found');
  end if;
  return jsonb_build_object(
    'id', a.id, 'author_id', a.author_id, 'author_name', public._author_name(a.author_id),
    'author_avatar', (select p.avatar_url from public.profiles p where p.id = a.author_id),
    'title', a.title, 'body', a.body, 'state', a.state, 'published_at', a.published_at,
    'like_count', a.like_count, 'comment_count', a.comment_count,
    'liked', exists (select 1 from public.post_likes l where l.post_id = a.id and l.user_id = v_user),
    'is_author', a.author_id = v_user,
    'can_comment', a.state = 'published' and not public.has_blocked(a.author_id, v_user));
end $$;

-- One comment as `p_viewer` sees it, or null when hidden for them (rule 15).
create function public._comment_row(c public.post_comments, p_viewer uuid, p_post_author uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when c.user_id is not null and c.user_id <> p_viewer and public.has_blocked(p_viewer, c.user_id) then null
    when c.state = 'auto_hidden' and p_viewer is distinct from c.user_id and p_viewer <> p_post_author then null
    else jsonb_build_object(
      'id', c.id, 'parent_id', c.parent_id, 'user_id', c.user_id,
      'name', public.sender_name(c.user_id),
      'avatar_url', (select p.avatar_url from public.profiles p where p.id = c.user_id),
      'is_author', c.user_id = p_post_author,
      'state', c.state,
      'body', case when c.state in ('visible', 'auto_hidden') then c.body end,
      'created_at', c.created_at,
      'mine', c.user_id = p_viewer,
      'can_delete', c.state in ('visible', 'auto_hidden') and (c.user_id = p_viewer or p_viewer = p_post_author))
  end
$$;

-- Comments oldest first, 20 top-level per page (keyset after created_at, id), each with its replies.
-- Deleted comments show only when they still have replies to hold together.
create function public.get_post_comments(p_post uuid, p_after timestamptz default null,
                                         p_after_id uuid default null, p_limit int default 20)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  a public.author_posts;
  v_lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows jsonb;
  v_more boolean;
begin
  select * into a from public.author_posts where id = p_post;
  if a.id is null or (a.state <> 'published' and a.author_id <> v_user)
     or public.has_blocked(v_user, a.author_id) then
    perform public._raise('not_found');
  end if;
  with top as (
    select c.* from public.post_comments c
    where c.post_id = p_post and c.parent_id is null
      and (p_after is null or (c.created_at, c.id) > (p_after, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    order by c.created_at, c.id
    limit v_lim + 1
  ), page as (
    select * from top order by created_at, id limit v_lim
  ), shaped as (
    select t.created_at, t.id,
           public._comment_row(t, v_user, a.author_id) as row,
           coalesce((select jsonb_agg(r.j order by r.created_at, r.id) from (
             select x.created_at, x.id, public._comment_row(x, v_user, a.author_id) as j
             from public.post_comments x where x.parent_id = t.id and x.state <> 'deleted') r
             where r.j is not null), '[]'::jsonb) as replies
    from page t
  )
  select coalesce(jsonb_agg(s.row || jsonb_build_object('replies', s.replies) order by s.created_at, s.id), '[]'::jsonb)
    into v_rows
  from shaped s
  where s.row is not null and (s.row ->> 'state' <> 'deleted' or jsonb_array_length(s.replies) > 0);
  v_more := (select count(*) from top) > v_lim;
  -- The cursor is the last row of the raw page, so rows hidden from this viewer never stall paging.
  return jsonb_build_object('comments', v_rows, 'has_more', v_more, 'total', a.comment_count,
    'next', (select jsonb_build_object('at', t.created_at, 'id', t.id)
             from (select * from top order by created_at, id limit v_lim) t
             order by t.created_at desc, t.id desc limit 1));
end $$;

create function public.like_post(p_post uuid, p_liked boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  a public.author_posts;
begin
  select * into a from public.author_posts where id = p_post and state = 'published';
  if a.id is null or public.has_blocked(v_user, a.author_id) then
    perform public._raise('not_found');
  end if;
  if p_liked then
    insert into public.post_likes (post_id, user_id) values (p_post, v_user) on conflict do nothing;
    if found and a.author_id <> v_user then
      perform pgmq.send('user_notify', jsonb_build_object('kind', 'post_liked', 'user_id', a.author_id,
        'from_user_id', v_user, 'post_id', p_post));
    end if;
  else
    delete from public.post_likes where post_id = p_post and user_id = v_user;
  end if;
  return jsonb_build_object('liked', p_liked,
    'like_count', (select like_count from public.author_posts where id = p_post));
end $$;

-- Add a comment or reply (rules 13, 16). Idempotent on (user, client_id).
-- Errors: bad_body, not_found, blocked, rate_limited, rejected_by_rules.
create function public.add_comment(p_post uuid, p_parent uuid, p_body text, p_client_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_body text := btrim(coalesce(p_body, ''));
  a public.author_posts;
  par public.post_comments;
  c public.post_comments;
begin
  if p_client_id is null then
    perform public._raise('bad_client_id');
  end if;
  select * into c from public.post_comments where user_id = v_user and client_id = p_client_id;
  if c.id is not null then
    return public._comment_row(c, v_user, (select author_id from public.author_posts where id = c.post_id))
           || jsonb_build_object('replayed', true);
  end if;
  if char_length(v_body) not between 1 and 1000 then
    perform public._raise('bad_body');
  end if;
  select * into a from public.author_posts where id = p_post and state = 'published';
  if a.id is null or public.has_blocked(v_user, a.author_id) then
    perform public._raise('not_found');
  end if;
  if public.has_blocked(a.author_id, v_user) then
    perform public._raise('blocked');
  end if;
  if p_parent is not null then
    select * into par from public.post_comments where id = p_parent and post_id = p_post;
    if par.id is null or par.state in ('removed', 'deleted') then
      perform public._raise('not_found');
    end if;
    -- A reply to a reply attaches to the top-level comment, which must still be showing.
    if par.parent_id is not null and exists (select 1 from public.post_comments t
        where t.id = par.parent_id and t.state = 'removed') then
      perform public._raise('not_found');
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('comment:' || v_user::text));
  if (select count(*) from public.post_comments
      where user_id = v_user and created_at > now() - interval '1 minute') >= 5 then
    perform public._raise('rate_limited');
  end if;
  if (select count(*) from public.post_comments
      where user_id = v_user and created_at > now() - interval '5 minutes' and lower(body) = lower(v_body)) >= 2 then
    perform public._raise('rejected_by_rules', '{"rule": "repeated"}');
  end if;
  if public._is_new_account(v_user) and public._has_link_or_phone(v_body) then
    perform public._raise('rejected_by_rules', '{"rule": "links_new_account"}');
  end if;

  insert into public.post_comments (post_id, user_id, parent_id, client_id, body)
  values (p_post, v_user, coalesce(par.parent_id, par.id), p_client_id, v_body)
  returning * into c;

  if a.author_id <> v_user then
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'post_comment', 'user_id', a.author_id,
      'from_user_id', v_user, 'post_id', p_post, 'comment_id', c.id));
  end if;
  if par.id is not null and par.user_id is not null and par.user_id <> v_user and par.user_id <> a.author_id then
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'comment_reply', 'user_id', par.user_id,
      'from_user_id', v_user, 'post_id', p_post, 'comment_id', c.id));
  end if;
  return public._comment_row(c, v_user, a.author_id) || jsonb_build_object('replayed', false);
end $$;

-- Own comment → deleted; any comment on the author's own post → removed ("Comment removed by author").
create function public.delete_comment(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  c public.post_comments;
  v_author uuid;
  v_state public.comment_state;
begin
  select * into c from public.post_comments where id = p_comment for update;
  select author_id into v_author from public.author_posts where id = c.post_id;
  if c.id is null or c.state in ('removed', 'deleted') then
    perform public._raise('not_found');
  end if;
  if c.user_id = v_user then
    v_state := 'deleted';
  elsif v_author = v_user then
    v_state := 'removed';
  else
    perform public._raise('not_allowed');
  end if;
  update public.post_comments set state = v_state, state_changed_at = now() where id = p_comment;
  return jsonb_build_object('id', p_comment, 'state', v_state);
end $$;

-- ─── Paid messages to an author ─────────────────────────────────────────────
-- Creates or returns the reader's thread with the author. Fails with own_profile, blocked,
-- author_unavailable or not_found. Never charges.
create function public.start_author_dm(p_author uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_block text;
  v_group uuid;
  v_name text;
begin
  if public._author_state(p_author) = 'not_author' then
    perform public._raise('not_found');
  end if;
  v_block := public._dm_block(v_user, p_author);
  if v_block is not null then
    perform public._raise(v_block);
  end if;
  perform pg_advisory_xact_lock(hashtext('dm:' || v_user::text || ':' || p_author::text));
  v_group := public._author_dm(v_user, p_author);
  if v_group is null then
    v_name := left(coalesce(nullif(split_part(public.sender_name(v_user), ' ', 1), ''), 'Reader')
                   || ' and ' || public._author_name(p_author), 60);
    insert into public.groups (kind, name, owner_id, visibility, who_can_post)
    values ('dm', case when char_length(v_name) >= 3 then v_name else 'Reader and author' end,
            p_author, 'private', 'members')
    returning id into v_group;
    insert into public.group_members (group_id, user_id, role) values
      (v_group, p_author, 'owner'), (v_group, v_user, 'member');
  end if;
  return jsonb_build_object('group_id', v_group,
    'cost_ack', (select m.cost_ack_at is not null from public.group_members m
                 where m.group_id = v_group and m.user_id = v_user));
end $$;

-- From s-dm-confirm: the reader has seen the price. Creates the thread when needed.
create function public.ack_dm_cost(p_author uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v jsonb := public.start_author_dm(p_author);
begin
  update public.group_members set cost_ack_at = coalesce(cost_ack_at, now())
   where group_id = (v ->> 'group_id')::uuid and user_id = v_user;
  return jsonb_build_object('group_id', v ->> 'group_id', 'cost_ack', true,
    'balance', public._balance(v_user));
end $$;

-- s-dm header and confirm screen for the reader: price, balance, thread, availability.
create function public.get_author_thread(p_author uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_dm uuid := public._author_dm(v_user, p_author);
begin
  if public._author_state(p_author) = 'not_author' then
    perform public._raise('not_found');
  end if;
  return jsonb_build_object(
    'author_id', p_author,
    'author_name', public._author_name(p_author),
    'author_avatar', coalesce(public._author_extra(p_author) ->> 'photo_url',
                              (select p.avatar_url from public.profiles p where p.id = p_author)),
    'author_state', public._author_state(p_author),
    'group_id', v_dm,
    'cost_ack', coalesce((select m.cost_ack_at is not null from public.group_members m
                          where m.group_id = v_dm and m.user_id = v_user), false),
    'cost_credits', (public._config('author_message_cost_credits'))::int,
    'max_chars', (public._config('author_message_max_chars'))::int,
    'balance', public._balance(v_user),
    'block', public._dm_block(v_user, p_author),
    'reply_label', public._reply_label(p_author));
end $$;

-- For the author (Studio and app inbox): who the reader is, without contact details or balance.
create function public.get_dm_reader(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_reader uuid;
begin
  select m.user_id into v_reader from public.group_members m
  join public.groups g on g.id = m.group_id
  where g.id = p_group and g.kind = 'dm' and g.owner_id = v_user and m.user_id <> v_user;
  if v_reader is null then
    perform public._raise('not_found');
  end if;
  return jsonb_build_object(
    'user_id', v_reader,
    'name', public.sender_name(v_reader),
    'avatar_url', (select p.avatar_url from public.profiles p where p.id = v_reader),
    'plan_code', case when public._plan_state(v_reader) ->> 'state' = 'plan'
                      then public._plan_state(v_reader) ->> 'plan_code' end,
    'under_18', public.is_minor(v_reader));
end $$;

-- A reader's paid message (rule 25, Server). One transaction: lock the reader, replay by
-- (sender, client_id), check blocks / author / limits / rules, spend the price (ledger 'message',
-- author earning per credit), store the message with its ledger row. Called by the api Worker with
-- the reader's token, which then tells the thread's Durable Object to broadcast it.
-- Errors: bad_body, bad_client_id, ack_required, blocked, author_unavailable, rate_limited,
-- rejected_by_rules, insufficient_credits {missing, balance, need}.
create function public.send_author_message(p_author uuid, p_client_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_cost int := (public._config('author_message_cost_credits'))::int;
  v_group uuid;
  v_block text;
  v_spend jsonb;
  x public.messages;
  v_first boolean;
begin
  if p_client_id is null then
    perform public._raise('bad_client_id');
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into x from public.messages where sender_id = v_user and client_id = p_client_id;
  if x.id is not null then
    return jsonb_build_object('message', jsonb_build_object('id', x.id, 'group_id', x.group_id,
        'body', x.body, 'created_at', x.created_at, 'cost_credits', x.cost_credits, 'sender_id', v_user,
        'sender_name', public.sender_name(v_user),
        'sender_avatar', (select p.avatar_url from public.profiles p where p.id = v_user)),
      'balance', public._balance(v_user), 'replayed', true);
  end if;

  if char_length(v_body) not between 1 and (public._config('author_message_max_chars'))::int then
    perform public._raise('bad_body');
  end if;
  v_block := public._dm_block(v_user, p_author);
  if v_block = 'own_profile' or public._author_state(p_author) = 'not_author' then
    perform public._raise('not_found');
  elsif v_block is not null then
    perform public._raise(v_block);
  end if;
  v_group := public._author_dm(v_user, p_author);
  if v_group is null or not exists (select 1 from public.group_members m
                                    where m.group_id = v_group and m.user_id = v_user
                                      and m.cost_ack_at is not null and m.banned_at is null) then
    perform public._raise('ack_required');
  end if;

  if (select count(*) from public.messages m join public.groups g on g.id = m.group_id
      where m.sender_id = v_user and m.cost_credits > 0 and g.kind = 'dm'
        and m.created_at > now() - interval '1 day')
     >= (public._config('author_message_daily_limit'))::int
     or (select count(*) from public.messages m
         where m.sender_id = v_user and m.cost_credits > 0 and m.created_at > now() - interval '1 minute') >= 10 then
    perform public._raise('rate_limited');
  end if;
  if public._is_new_account(v_user) and public._has_link_or_phone(v_body) then
    perform public._raise('rejected_by_rules', '{"rule": "links_new_account"}');
  end if;

  v_first := not exists (select 1 from public.messages m where m.group_id = v_group and m.sender_id = v_user);
  v_spend := public.spend_credits(v_user, v_cost, 'message', null, null, p_author, 'dm:' || p_client_id::text,
    jsonb_build_object('group_id', v_group));
  insert into public.messages (group_id, sender_id, client_id, kind, body, cost_credits, ledger_id)
  values (v_group, v_user, p_client_id, 'text', v_body, v_cost, (v_spend ->> 'ledger_id')::bigint)
  returning * into x;
  update public.groups set last_message_at = x.created_at where id = v_group;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'dm_message', 'user_id', p_author,
    'from_user_id', v_user, 'group_id', v_group, 'message_id', x.id));

  return jsonb_build_object('message', jsonb_build_object('id', x.id, 'group_id', x.group_id,
      'body', x.body, 'created_at', x.created_at, 'cost_credits', x.cost_credits, 'sender_id', v_user,
      'sender_name', public.sender_name(v_user),
      'sender_avatar', (select p.avatar_url from public.profiles p where p.id = v_user)),
    'balance', (v_spend ->> 'balance')::int, 'replayed', false, 'first_with_author', v_first);
end $$;

-- s-dm: the cost of each paid message in a thread (rule 25), newest first. flow 06's get_messages
-- doesn't carry cost_credits; members of the thread only.
create function public.get_author_dm_costs(p_group uuid, p_limit int default 200)
returns table (id uuid, cost_credits int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_group_member(p_group, public._uid()) then
    perform public._raise('not_found');
  end if;
  return query
    select m.id, m.cost_credits from public.messages m
    where m.group_id = p_group and m.cost_credits > 0
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

-- ─── Nightly stats (pg_cron author_stats_refresh) ───────────────────────────
-- Readers: distinct people who unlocked or read 10% or more of any of the author's books.
-- Rating: all live books, weighted by count. Reply time: median hours from a reader's first
-- unanswered paid message to the author's next reply, last 30 days.
create function public.author_stats_refresh() returns void
language sql security definer set search_path = '' as $$
  with authors as (
    select id from public.profiles where is_author and deleted_at is null
  ), readers as (
    select b.author_id, count(distinct u.user_id)::int as n
    from public.books b
    join (select user_id, book_id from public.entitlements where revoked_at is null
          union select user_id, book_id from public.reading_progress where max_percent >= 10) u on u.book_id = b.id
    where u.user_id <> b.author_id
    group by b.author_id
  ), ratings as (
    select b.author_id, sum(r.count)::int as n,
           round(sum(r.avg * r.count) / nullif(sum(r.count), 0), 1) as avg
    from public.books b join public.book_rating_stats r on r.book_id = b.id
    where b.status = 'live' group by b.author_id
  ), dm as (
    -- Each author message closes a run of reader messages: run k = reader messages after the
    -- k-th author message; the author message numbered k+1 answers it.
    select g.owner_id as author_id, m.group_id, m.created_at, m.sender_id = g.owner_id as by_author,
           count(*) filter (where m.sender_id = g.owner_id) over w as k
    from public.messages m join public.groups g on g.id = m.group_id
    where g.kind = 'dm' and g.owner_id is not null and m.created_at > now() - interval '30 days'
      and m.state <> 'auto_hidden'
    window w as (partition by m.group_id order by m.created_at, m.id)
  ), asks as (
    select author_id, group_id, k, min(created_at) as at from dm where not by_author group by 1, 2, 3
  ), replies as (
    select q.author_id, extract(epoch from (d.created_at - q.at)) / 3600.0 as hours
    from dm d join asks q on q.group_id = d.group_id and q.k = d.k - 1
    where d.by_author
  ), reply_stats as (
    select author_id, count(*)::int as n,
           percentile_cont(0.5) within group (order by hours) as median
    from replies where hours is not null group by author_id
  )
  insert into public.author_stats (author_id, follower_count, reader_count, avg_rating, rating_count,
                                   median_reply_hours, reply_sample_size, updated_at)
  select a.id,
         (select count(*) from public.follows f where f.followee_id = a.id)::int,
         coalesce(r.n, 0), rt.avg, coalesce(rt.n, 0), round(rs.median::numeric, 1), coalesce(rs.n, 0), now()
  from authors a
  left join readers r on r.author_id = a.id
  left join ratings rt on rt.author_id = a.id
  left join reply_stats rs on rs.author_id = a.id
  on conflict (author_id) do update set
    follower_count = excluded.follower_count, reader_count = excluded.reader_count,
    avg_rating = excluded.avg_rating, rating_count = excluded.rating_count,
    median_reply_hours = excluded.median_reply_hours, reply_sample_size = excluded.reply_sample_size,
    updated_at = now();
$$;

select cron.schedule('author_stats_refresh', '30 2 * * *', 'select public.author_stats_refresh()');

-- ─── Admin (People › Authors) ───────────────────────────────────────────────
-- Followers, readers, earnings, tips, messages and community counts. Never message text.
create function public.admin_author_social(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.author_stats;
  g public.groups;
begin
  if not (public.staff_mfa_ok() and public.is_staff_any(
            array['support', 'operations_admin', 'analyst', 'finance']::public.staff_role[])) then
    raise exception 'Not allowed: authors' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.author_stats where author_id = p_user;
  select * into g from public.groups where kind = 'author' and owner_id = p_user and archived_at is null
   order by created_at limit 1;
  return jsonb_build_object(
    'follower_count', coalesce(s.follower_count, 0),
    'reader_count', coalesce(s.reader_count, 0),
    'avg_rating', s.avg_rating,
    'earnings_kobo', coalesce((select sum(l.author_earning_kobo) from public.credit_ledger l
                               where l.author_id = p_user), 0),
    'tips', (select jsonb_build_object('count', count(distinct l.txn_id), 'credits', coalesce(-sum(l.delta), 0))
             from public.credit_ledger l where l.author_id = p_user and l.reason = 'tip'),
    'messages', (select jsonb_build_object('count', count(distinct l.txn_id), 'credits', coalesce(-sum(l.delta), 0))
                 from public.credit_ledger l where l.author_id = p_user and l.reason = 'message'),
    'threads', (select count(*) from public.groups t where t.kind = 'dm' and t.owner_id = p_user),
    'community', case when g.id is null then null else
      jsonb_build_object('id', g.id, 'name', g.name, 'member_count', g.member_count) end);
end $$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.author_stats enable row level security;
alter table public.author_posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

create policy author_stats_select on public.author_stats for select to authenticated using (true);

create policy author_posts_select on public.author_posts for select to authenticated
  using (state = 'published' or author_id = (select auth.uid()) or (select public.is_community_staff()));

create policy post_likes_select on public.post_likes for select to authenticated
  using (user_id = (select auth.uid()));

-- Visible comments on published posts (not from people I blocked), my own, and all on my posts.
create policy post_comments_select on public.post_comments for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.author_posts a where a.id = post_id and a.author_id = (select auth.uid()))
    or (state = 'visible' and not public.i_blocked(user_id)
        and exists (select 1 from public.author_posts a where a.id = post_id and a.state = 'published'))
    or (select public.is_community_staff())
  );

revoke all on public.author_stats, public.author_posts, public.post_likes, public.post_comments
  from anon, authenticated;
grant select on public.author_stats, public.author_posts, public.post_likes, public.post_comments
  to authenticated;

revoke execute on function public._author_extra(uuid), public._author_state(uuid), public._author_name(uuid),
  public._reply_label(uuid), public._author_dm(uuid, uuid), public._dm_block(uuid, uuid),
  public._is_new_account(uuid), public._set_author_follow(uuid, boolean),
  public._comment_row(public.post_comments, uuid, uuid), public.author_stats_refresh(),
  public._follows_count_trigger(), public._post_counts_trigger()
  from public, anon, authenticated;
revoke execute on function public.follow_author(uuid), public.unfollow_author(uuid),
  public.get_author_profile(uuid), public.get_author_posts(uuid, timestamptz, int),
  public.get_author_books(uuid), public.get_post(uuid),
  public.get_post_comments(uuid, timestamptz, uuid, int), public.like_post(uuid, boolean),
  public.add_comment(uuid, uuid, text, uuid), public.delete_comment(uuid),
  public.start_author_dm(uuid), public.ack_dm_cost(uuid), public.get_author_thread(uuid),
  public.get_dm_reader(uuid), public.send_author_message(uuid, uuid, text),
  public.get_author_dm_costs(uuid, int), public.admin_author_social(uuid)
  from public, anon;
grant execute on function public.follow_author(uuid), public.unfollow_author(uuid),
  public.get_author_profile(uuid), public.get_author_posts(uuid, timestamptz, int),
  public.get_author_books(uuid), public.get_post(uuid),
  public.get_post_comments(uuid, timestamptz, uuid, int), public.like_post(uuid, boolean),
  public.add_comment(uuid, uuid, text, uuid), public.delete_comment(uuid),
  public.start_author_dm(uuid), public.ack_dm_cost(uuid), public.get_author_thread(uuid),
  public.get_dm_reader(uuid), public.send_author_message(uuid, uuid, text),
  public.get_author_dm_costs(uuid, int), public.admin_author_social(uuid)
  to authenticated;

-- Initial stats for existing authors.
select public.author_stats_refresh();
