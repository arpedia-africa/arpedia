-- ─── Flow 07 · rooms: new-account rule after flow 14's post_block_for ───────
-- Flow 14 replaced post_block_for (account sanctions first, then flow 06's rules), which dropped
-- the room wrapper from 20261119400000_07_rooms.sql. Put 14's body back under
-- _post_block_for_base and the room wrapper back on top. Written with create or replace, so it is
-- right whichever order the 07 and 14 migrations ran in.

create or replace function public._post_block_for_base(p_group uuid, p_user uuid)
returns table (reason text, until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.groups;
  m public.group_members;
  s record;
  v_staff boolean := exists (select 1 from public.staff_roles st where st.user_id = p_user and st.active);
begin
  select * into s from public.active_sanction(p_user);
  if s.kind is not null then
    return query select case s.kind when 'mute' then 'sanction_muted' when 'suspend' then 'suspended'
                                    else 'account_banned' end, s.ends_at;
    return;
  end if;
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
    return query select 'owner_only', null::timestamptz;
  elsif g.kind = 'dm' and exists (select 1 from public.group_members o
                                  where o.group_id = p_group and o.user_id <> p_user
                                    and public.has_blocked(o.user_id, p_user)) then
    return query select 'blocked', null::timestamptz;
  end if;
end $$;

create or replace function public.post_block_for(p_group uuid, p_user uuid)
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
