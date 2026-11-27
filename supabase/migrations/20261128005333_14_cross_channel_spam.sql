-- Flow 14 · spec check 14-14, the part left (rule 23): spam detection "same text in 5 channels in
-- 1 hour". Each chat Durable Object only sees its own conversation, so the api Worker's
-- moderate-text check asks Postgres whether this sender already posted the same text in other
-- conversations inside the window (`spam.cross_channel`, default 5 channels;
-- `spam.cross_channel_window_minutes`, default 60; 0 switches it off). The message that would make
-- it the Nth channel is refused. Service role only: it reads other conversations' messages.

create function public.cross_channel_spam(p_user uuid, p_group uuid, p_text text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_channels int := public._automod_int('spam', 'cross_channel', 5);
  v_minutes int := public._automod_int('spam', 'cross_channel_window_minutes', 60);
  v_text text := lower(btrim(coalesce(p_text, '')));
  v_other int;
begin
  if v_channels <= 1 or v_minutes <= 0 or v_text = '' or p_user is null then
    return false;
  end if;
  select count(distinct m.group_id) into v_other
  from public.messages m
  where m.sender_id = p_user
    and m.created_at > now() - make_interval(mins => v_minutes)
    and m.group_id is distinct from p_group
    and m.kind <> 'system'
    and lower(btrim(m.body)) = v_text;
  return v_other >= v_channels - 1;
end $$;

revoke all on function public.cross_channel_spam(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cross_channel_spam(uuid, uuid, text) to service_role;
