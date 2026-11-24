-- Flow 14 · spec check 14-6: a mute, suspension or ban also stops comments on author posts, messages
-- to authors, reviews and new reading rooms (chats, rooms and DMs already ask post_block_for).
-- Each RPC is wrapped rather than copied, so its own rules stay in one body: the sanction check comes
-- first, then the original (renamed *_base, no longer callable by clients).

-- Raises the post_block_for reason for a live sanction: sanction_muted, suspended or account_banned.
create function public._require_no_sanction(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare s record;
begin
  select * into s from public.active_sanction(p_user);
  if s.kind is not null then
    raise exception '%', case s.kind when 'mute' then 'sanction_muted' when 'suspend' then 'suspended'
                                     else 'account_banned' end
      using detail = coalesce(s.ends_at::text, '');
  end if;
end $$;

alter function public.add_comment(uuid, uuid, text, uuid) rename to _add_comment_base;
create function public.add_comment(p_post uuid, p_parent uuid, p_body text, p_client_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_no_sanction(auth.uid());
  return public._add_comment_base(p_post, p_parent, p_body, p_client_id);
end $$;

alter function public.send_author_message(uuid, uuid, text) rename to _send_author_message_base;
create function public.send_author_message(p_author uuid, p_client_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_no_sanction(auth.uid());
  return public._send_author_message_base(p_author, p_client_id, p_body);
end $$;

alter function public.post_review(uuid, integer, text, boolean) rename to _post_review_base;
create function public.post_review(p_book uuid, p_stars integer, p_body text, p_spoiler boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_no_sanction(auth.uid());
  return public._post_review_base(p_book, p_stars, p_body, p_spoiler);
end $$;

alter function public.create_reading_room(text, uuid, public.room_pace, public.room_join_policy, timestamptz)
  rename to _create_reading_room_base;
create function public.create_reading_room(p_name text, p_book uuid,
                                           p_pace public.room_pace default 'free',
                                           p_join_policy public.room_join_policy default 'code',
                                           p_starts_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_no_sanction(auth.uid());
  return public._create_reading_room_base(p_name, p_book, p_pace, p_join_policy, p_starts_at);
end $$;

revoke execute on function public._require_no_sanction(uuid),
  public._add_comment_base(uuid, uuid, text, uuid),
  public._send_author_message_base(uuid, uuid, text),
  public._post_review_base(uuid, integer, text, boolean),
  public._create_reading_room_base(text, uuid, public.room_pace, public.room_join_policy, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.add_comment(uuid, uuid, text, uuid),
  public.send_author_message(uuid, uuid, text),
  public.post_review(uuid, integer, text, boolean),
  public.create_reading_room(text, uuid, public.room_pace, public.room_join_policy, timestamptz)
  from public, anon;
grant execute on function public.add_comment(uuid, uuid, text, uuid),
  public.send_author_message(uuid, uuid, text),
  public.post_review(uuid, integer, text, boolean),
  public.create_reading_room(text, uuid, public.room_pace, public.room_join_policy, timestamptz)
  to authenticated;
