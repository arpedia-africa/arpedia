-- Flow 06 spec check 06-20 (rule 9): private clubs are joined by invitation link only.
-- One live link per private group. Its owner or moderators (or community staff, audited) read or
-- reset it; a signed-in reader with the link sees the group's name and joins. Resetting the link
-- stops the old one working. Discover still lists public groups only.

create table public.group_invites (
  group_id uuid primary key references public.groups (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{24}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.group_invites enable row level security;
-- No client policies: the link is read only through get_group_invite.
revoke all on public.group_invites from anon, authenticated;

-- The group's invitation token, made on first ask.
create function public.get_group_invite(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
  v_staff boolean := false;
  v_token text;
begin
  -- Owner or moderator of the group, or community staff (audited).
  if not public.is_group_mod(p_group) then
    v_staff := public.community_admin(true);
    if not v_staff then raise exception 'not_allowed' using errcode = 'insufficient_privilege'; end if;
  end if;
  -- Private, live, and not a DM or reading room (rooms have their own codes).
  select * into g from public.groups where id = p_group for update;
  if g.id is null or g.archived_at is not null or g.kind in ('dm', 'room') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if g.visibility <> 'private' then raise exception 'not_private' using errcode = '22023'; end if;
  select token into v_token from public.group_invites where group_id = g.id;
  if v_token is null then
    v_token := encode(extensions.gen_random_bytes(12), 'hex');
    insert into public.group_invites (group_id, token, created_by) values (g.id, v_token, auth.uid());
    if v_staff then
      perform public.write_audit('community', 'channel.invite_link', 'group', g.id::text, g.name,
        'Made an invitation link', null, null);
    end if;
  end if;
  return v_token;
end $$;

-- A new token; the old link stops working.
create function public.reset_group_invite(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
  v_token text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  -- Same checks as get_group_invite, which also makes the first link.
  v_old := public.get_group_invite(p_group);
  update public.group_invites set token = v_token, created_by = auth.uid(), created_at = now()
  where group_id = p_group;
  if not public.is_group_mod(p_group) then
    perform public.write_audit('community', 'channel.invite_reset', 'group', p_group::text,
      (select name from public.groups where id = p_group), 'Reset the invitation link', null, null);
  end if;
  return v_token;
end $$;

-- What the link opens: name, kind, description, members, and whether I'm already in.
-- Null for an unknown, reset or archived link, or a group that is no longer private.
create function public.get_invite_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
begin
  if uid is null or p_token is null then return null; end if;
  select gr.* into g from public.group_invites i join public.groups gr on gr.id = i.group_id
  where i.token = lower(btrim(p_token)) and gr.archived_at is null and gr.visibility = 'private'
    and gr.kind not in ('dm', 'room');
  if g.id is null then return null; end if;
  return jsonb_build_object(
    'group_id', g.id, 'kind', g.kind, 'name', g.name, 'description', g.description,
    'avatar_url', g.avatar_url, 'member_count', g.member_count,
    'joined', public.is_group_member(g.id, uid),
    'banned', exists (select 1 from public.group_members m
                      where m.group_id = g.id and m.user_id = uid and m.banned_at is not null));
end $$;

-- Join through the link (a no-op when already in). Returns the group id for the chat screen.
create function public.join_group_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  m public.group_members;
begin
  if uid is null then raise exception 'not_signed_in' using errcode = 'insufficient_privilege'; end if;
  select gr.* into g from public.group_invites i join public.groups gr on gr.id = i.group_id
  where i.token = lower(btrim(coalesce(p_token, ''))) and gr.archived_at is null and gr.visibility = 'private'
    and gr.kind not in ('dm', 'room');
  if g.id is null then raise exception 'invite_invalid' using errcode = 'P0002'; end if;
  select * into m from public.group_members where group_id = g.id and user_id = uid;
  if m.banned_at is not null then
    raise exception 'banned' using errcode = 'insufficient_privilege';
  elsif m.user_id is null then
    insert into public.group_members (group_id, user_id, role, muted_until, muted_by)
    select g.id, uid, 'member', c.muted_until, c.muted_by
      from (select 1) one
      left join public.group_mute_carry c
        on c.group_id = g.id and c.user_id = uid and c.muted_until > now();
    delete from public.group_mute_carry where group_id = g.id and user_id = uid;
  end if;
  return g.id;
end $$;

revoke all on function public.get_group_invite(uuid), public.reset_group_invite(uuid), public.get_invite_preview(text),
  public.join_group_invite(text) from public, anon, authenticated, service_role;
grant execute on function public.get_group_invite(uuid), public.reset_group_invite(uuid),
  public.get_invite_preview(text), public.join_group_invite(text) to authenticated;
