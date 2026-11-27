-- Flow 07 · spec check 07-9: room names run through muted words (flow 07 Spam and NSFW,
-- RPC create_reading_room). A name with a muted word whose action is Hide, Hide and report
-- or Blur is refused with `name_blocked` ("Choose a different name." in the app): a room
-- name is shown as is in lists, Discover and pushes, so it can't be hidden or blurred later.
-- Warn words are allowed. Rooms are a chat surface, so chat-and-DM words apply too.
-- The sanction check from 14_sanction_checks stays first; names outside 3 to 40 characters
-- still get `room_name` from the base function.

create or replace function public.create_reading_room(p_name text, p_book uuid,
                                                      p_pace public.room_pace default 'free',
                                                      p_join_policy public.room_join_policy default 'code',
                                                      p_starts_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform public._require_no_sanction(auth.uid());
  if char_length(v_name) between 3 and 40
     and exists (select 1 from public._automod_hits(v_name, 'chat') h
                 where h.action in ('hide', 'hide_and_report', 'blur')) then
    raise exception 'name_blocked' using errcode = '22023';
  end if;
  return public._create_reading_room_base(p_name, p_book, p_pace, p_join_policy, p_starts_at);
end $$;
