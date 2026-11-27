-- Flow 08 · spec check 08-12: the admin author page's Message (primary) and Edit profile actions.
--   * staff_message_author: a staff message to the author (Admin side: "Message is the primary
--     action"). It reaches the author as a push and in their notifications (account_notice, opens
--     Studio), and the text is kept in the audit log. Staff still cannot read author-reader DMs.
--   * staff_update_author_profile: pen name, bio and location, with the old and new values audited.
-- Support and Operations admin (and Super admin) only, as for the rest of the author page.

create function public.staff_message_author(p_author uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(null, array['support', 'operations_admin']::public.staff_role[], 'staff_message_author');
  v_body text := btrim(coalesce(p_body, ''));
  v_name text;
begin
  select pen_name into v_name from public.author_profiles where user_id = p_author;
  if v_name is null then
    raise exception 'not_author' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 300 then
    raise exception 'bad_body' using errcode = 'P0001';
  end if;
  perform public.enqueue_push('account_notice', array[p_author], jsonb_build_object(
    'vars', jsonb_build_object('title', 'A message from Arpedia', 'body', v_body),
    'target', jsonb_build_object('kind', 'screen', 'screen', 'studio')));
  perform public._audit(v_actor, 'authors', 'author.message', 'author', p_author::text, v_name,
    'Sent the author a message', null, jsonb_build_object('body', v_body), null);
  return jsonb_build_object('ok', true);
end $$;

create function public.staff_update_author_profile(p_author uuid, p_pen_name text, p_bio text, p_location text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(null, array['support', 'operations_admin']::public.staff_role[], 'staff_update_author_profile');
  v_pen text := btrim(coalesce(p_pen_name, ''));
  v_bio text := btrim(coalesce(p_bio, ''));
  v_loc text := nullif(btrim(coalesce(p_location, '')), '');
  a public.author_profiles;
begin
  select * into a from public.author_profiles where user_id = p_author for update;
  if a.user_id is null then
    raise exception 'not_author' using errcode = 'P0001';
  end if;
  if char_length(v_pen) not between 1 and 60 then
    raise exception 'bad_pen_name' using errcode = 'P0001';
  end if;
  if char_length(v_bio) > 300 then
    raise exception 'bad_bio' using errcode = 'P0001';
  end if;
  if char_length(v_loc) > 60 then
    raise exception 'bad_location' using errcode = 'P0001';
  end if;
  if a.pen_name = v_pen and a.bio = v_bio and a.location is not distinct from v_loc then
    return jsonb_build_object('ok', true, 'changed', false);
  end if;
  update public.author_profiles set pen_name = v_pen, bio = v_bio, location = v_loc where user_id = p_author;
  perform public._audit(v_actor, 'authors', 'author.profile_edit', 'author', p_author::text, v_pen,
    'Edited the author profile',
    jsonb_build_object('pen_name', a.pen_name, 'bio', a.bio, 'location', a.location),
    jsonb_build_object('pen_name', v_pen, 'bio', v_bio, 'location', v_loc), null);
  return jsonb_build_object('ok', true, 'changed', true);
end $$;

revoke execute on function public.staff_message_author(uuid, text),
  public.staff_update_author_profile(uuid, text, text, text) from public, anon;
grant execute on function public.staff_message_author(uuid, text),
  public.staff_update_author_profile(uuid, text, text, text) to authenticated;
