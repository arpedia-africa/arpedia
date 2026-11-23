-- Flow 08 + flow 07: flow 07's 20261120001500 migration put flow 14's body (without flow 08's rules)
-- under _post_block_for_base. Replace that base with the body that also carries flow 08's rules
-- (followers posting in 'owner_and_followers' groups, paid_only, author_unavailable). The room
-- wrapper (new_account rule) in public.post_block_for stays on top, unchanged.
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

revoke execute on function public._post_block_for_base(uuid, uuid) from public, anon, authenticated;
