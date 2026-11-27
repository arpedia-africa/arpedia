-- Flow 07 · spec check 07-9: room names run through the flow 14 muted words (Spam and NSFW, Server
-- create_reading_room). A name with a Hide, Hide-and-report or Blur word (everywhere or chat and
-- DM scope) is refused with name_blocked, which the app shows as "Choose a different name."
-- Warn words don't block a name. Same matcher as comments and the moderate-text Worker.
create or replace function public.create_reading_room(p_name text, p_book uuid,
                                                      p_pace public.room_pace default 'free',
                                                      p_join_policy public.room_join_policy default 'code',
                                                      p_starts_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_no_sanction(auth.uid());
  if exists (select 1 from public._automod_hits(p_name, 'chat') h where h.action <> 'warn') then
    raise exception 'name_blocked' using errcode = '22023';
  end if;
  return public._create_reading_room_base(p_name, p_book, p_pace, p_join_policy, p_starts_at);
end $$;
