-- Flow 14 · spec check 14-14 (rule 23). The Safety rules page saved rate limits, new-account
-- restrictions and spam settings, but every check used its own fixed number. Now they read
-- automod_settings (a missing or broken value falls back to the old default; 0 switches a rule off):
--   * links.block_new_accounts_days (7): who counts as a new account for the link and phone rules
--     (chat, comments, reviews, paid DMs) and for the chat access answer.
--   * new_accounts.no_room_posts_days (7): new accounts read rooms but don't post.
--   * new_accounts.review_wait_days (3): reviews wait until the account is that many days old
--     (post_review raises review_wait with the date it opens).
--   * rate_limits.dms_per_day (50): paid messages to authors per reader per day (kept in step with
--     the app_config value flow 08's send path reads).
--   * rate_limits.messages_per_minute (20) and spam.identical_messages / identical_window_minutes
--     (3 in 5 minutes): passed to the chat Durable Object in get_group_access ('limits').
-- Cross-channel spam (same text in 5 channels in an hour) needs a view across conversations and
-- is not in this change.

-- A whole-number field of a safety setting, or the default when it is missing or not a number.
create function public._automod_int(p_key text, p_field text, p_default int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when jsonb_typeof(s.value -> p_field) = 'number'
                 then greatest(0, least((s.value ->> p_field)::numeric, 100000))::int end
     from public.automod_settings s where s.key = p_key),
    p_default)
$$;

create or replace function public._is_new_account(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.created_at > now() - make_interval(days => public._automod_int('links', 'block_new_accounts_days', 7))
                   from auth.users u where u.id = p_user), true)
$$;

-- Rooms: same wrapper as 20261120001500, with the days from the setting.
create or replace function public.post_block_for(p_group uuid, p_user uuid)
returns table (reason text, until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v record;
  v_days int := public._automod_int('new_accounts', 'no_room_posts_days', 7);
begin
  select * into v from public._post_block_for_base(p_group, p_user) limit 1;
  if v.reason is not null then
    return query select v.reason, v.until;
  elsif v_days > 0
        and exists (select 1 from public.groups g where g.id = p_group and g.kind = 'room')
        and not exists (select 1 from public.group_members m
                        where m.group_id = p_group and m.user_id = p_user and m.role = 'owner')
        and coalesce((select u.created_at > now() - make_interval(days => v_days) from auth.users u
                      where u.id = p_user), true)
  then
    return query select 'new_account'::text, (select u.created_at + make_interval(days => v_days)
                                               from auth.users u where u.id = p_user);
  end if;
end $$;

-- Chat access: the new-account flag follows the link rule's days, and the conversation's limits.
create or replace function public.get_group_access(p_group uuid, p_user uuid) returns jsonb
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
    'new_account', public._is_new_account(p_user),
    'muted_words', coalesce(to_jsonb(g.muted_words), '[]'::jsonb),
    'member_count', coalesce(g.member_count, 0),
    'blocked', coalesce((select jsonb_agg(b.blocked_id) from public.user_blocks b where b.blocker_id = p_user), '[]'::jsonb),
    'sender_name', public.sender_name(p_user),
    'sender_avatar', (select p.avatar_url from public.profiles p where p.id = p_user),
    'sender_is_author', coalesce(p_user = g.owner_id and (select p.is_author from public.profiles p where p.id = p_user), false),
    'limits', jsonb_build_object(
      'messages_per_minute', public._automod_int('rate_limits', 'messages_per_minute', 20),
      'identical_messages', public._automod_int('spam', 'identical_messages', 3),
      'identical_window_minutes', public._automod_int('spam', 'identical_window_minutes', 5))
  );
end $$;

-- Reviews wait for day 3: wraps the current post_review (sanctions, muted words, link rule).
alter function public.post_review(uuid, integer, text, boolean) rename to _post_review_rules;
revoke execute on function public._post_review_rules(uuid, integer, text, boolean) from public, anon, authenticated;

create function public.post_review(p_book uuid, p_stars integer, p_body text, p_spoiler boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_days int := public._automod_int('new_accounts', 'review_wait_days', 3);
  v_opens timestamptz;
begin
  if v_days > 0 then
    select u.created_at + make_interval(days => v_days) into v_opens from auth.users u where u.id = auth.uid();
    -- An edit of a review the reader already has is never held back.
    if v_opens > now() and not exists (select 1 from public.reviews r
                                       where r.book_id = p_book and r.user_id = auth.uid()) then
      perform public._raise('review_wait', jsonb_build_object('until', v_opens));
    end if;
  end if;
  return public._post_review_rules(p_book, p_stars, p_body, p_spoiler);
end $$;
revoke execute on function public.post_review(uuid, integer, text, boolean) from public, anon;
grant execute on function public.post_review(uuid, integer, text, boolean) to authenticated;

-- Paid DMs per day: flow 08's send path reads app_config; keep it equal to the safety setting.
create function public._sync_dm_daily_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.key = 'rate_limits' and jsonb_typeof(new.value -> 'dms_per_day') = 'number'
     and (new.value ->> 'dms_per_day')::numeric >= 1 then
    insert into public.app_config (key, value)
    values ('author_message_daily_limit', to_jsonb(least((new.value ->> 'dms_per_day')::numeric, 100000)::int))
    on conflict (key) do update set value = excluded.value, updated_by = new.updated_by;
  end if;
  return null;
end $$;
create trigger automod_settings_dm_limit after insert or update of value on public.automod_settings
  for each row execute function public._sync_dm_daily_limit();
update public.automod_settings set value = value where key = 'rate_limits';

revoke execute on function public._automod_int(text, text, int), public._sync_dm_daily_limit()
  from public, anon, authenticated;
