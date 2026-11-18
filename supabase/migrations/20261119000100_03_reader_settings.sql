-- Flow 03 rule 23: the Auto-unlock switch on the pay-as-you-read sheet is the same setting as in
-- reader settings (flow 04), stored in profiles.reader_settings.auto_unlock (on by default).

alter table public.profiles
  add column reader_settings jsonb not null default '{"auto_unlock": true}'::jsonb;

-- Readers change only their own settings, only through this function (profiles has staff and
-- moderation fields the client must never write).
create function public.set_reader_setting(p_key text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_out jsonb;
begin
  if p_key is null or p_key not in ('auto_unlock') then
    perform public._raise('bad_setting');
  end if;
  if p_key = 'auto_unlock' and jsonb_typeof(p_value) <> 'boolean' then
    perform public._raise('bad_setting');
  end if;
  update public.profiles set reader_settings = reader_settings || jsonb_build_object(p_key, p_value)
  where id = v_user
  returning reader_settings into v_out;
  return v_out;
end $$;

revoke all on function public.set_reader_setting(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.set_reader_setting(text, jsonb) to authenticated;
