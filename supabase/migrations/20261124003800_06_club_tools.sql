-- Flow 06 spec-check fixes: 06-7 (something can set the pinned weekly reading) and 06-11 (owners
-- and staff can appoint moderators, at most 5 per group).

-- ─── 06-7: weekly reading ───────────────────────────────────────────────────
-- Owner or moderator of the group, or community staff (audited). p_book null clears it.
-- Chapters are 1-based numbers in the book's live revision; the note is one line (120 characters).
create function public.set_weekly_reading(p_group uuid, p_book uuid, p_from int default null, p_to int default null,
                                          p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
  v_staff boolean := public.community_admin(true);
  v_chapters int;
begin
  if not (public.is_group_mod(p_group) or v_staff) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.groups where id = p_group and kind <> 'dm' and archived_at is null for update;
  if g.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_book is not null then
    select count(*) into v_chapters from public.books b join public.chapters c on c.revision_id = b.current_revision_id
    where b.id = p_book and b.status = 'live';
    if v_chapters = 0 then raise exception 'not_available' using errcode = 'P0002'; end if;
    if p_from is null or p_to is null or p_from < 1 or p_to < p_from or p_to > v_chapters then
      raise exception 'bad_chapters' using errcode = '22023';
    end if;
    if char_length(coalesce(p_note, '')) > 120 or position(E'\n' in coalesce(p_note, '')) > 0 then
      raise exception 'bad_note' using errcode = '22023';
    end if;
  end if;
  update public.groups set weekly_book_id = p_book,
    weekly_from_chapter = case when p_book is not null then p_from end,
    weekly_to_chapter = case when p_book is not null then p_to end,
    weekly_note = case when p_book is not null then nullif(btrim(p_note), '') end
  where id = p_group;
  if v_staff then
    perform public.write_audit('community', 'channel.weekly', 'group', g.id::text, g.name,
      case when p_book is null then 'Cleared the weekly reading' else 'Set the weekly reading' end,
      jsonb_build_object('book_id', g.weekly_book_id, 'from', g.weekly_from_chapter, 'to', g.weekly_to_chapter),
      jsonb_build_object('book_id', p_book, 'from', p_from, 'to', p_to));
  end if;
end $$;

-- ─── 06-11: moderators ──────────────────────────────────────────────────────
-- The group's owner, or community staff (audited), makes a member a moderator or a member again.
-- At most 5 moderators; banned members and the owner can't be changed.
create function public.set_group_moderator(p_group uuid, p_user uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g public.groups;
  m public.group_members;
  v_owner boolean := exists (select 1 from public.group_members x where x.group_id = p_group
                             and x.user_id = auth.uid() and x.role = 'owner' and x.banned_at is null);
  v_staff boolean := public.community_admin(true);
begin
  if not (v_owner or v_staff) then
    raise exception 'not_allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.groups where id = p_group and kind <> 'dm' for update;
  if g.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into m from public.group_members where group_id = p_group and user_id = p_user;
  -- A banned member can still be stepped down, never made a moderator.
  if m.user_id is null or (p_on and m.banned_at is not null) then
    raise exception 'not_member' using errcode = 'P0002';
  end if;
  if m.role = 'owner' then raise exception 'is_owner' using errcode = '22023'; end if;
  if p_on and m.role <> 'moderator' and (select count(*) from public.group_members
      where group_id = p_group and role = 'moderator') >= 5 then
    raise exception 'moderator_limit' using errcode = '23514';
  end if;
  update public.group_members set role = case when p_on then 'moderator' else 'member' end::public.group_role
  where group_id = p_group and user_id = p_user;
  if v_staff then
    perform public.write_audit('community', case when p_on then 'channel.moderator_add' else 'channel.moderator_remove' end,
      'group', g.id::text, g.name,
      (case when p_on then 'Made ' else 'Removed moderator ' end)
        || coalesce((select full_name from public.profiles where id = p_user), 'a member'),
      jsonb_build_object('user_id', p_user, 'role', m.role),
      jsonb_build_object('user_id', p_user, 'role', case when p_on then 'moderator' else 'member' end));
  end if;
end $$;

revoke all on function public.set_weekly_reading(uuid, uuid, int, int, text),
  public.set_group_moderator(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_weekly_reading(uuid, uuid, int, int, text),
  public.set_group_moderator(uuid, uuid, boolean) to authenticated;
