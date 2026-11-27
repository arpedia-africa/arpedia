-- Flow 16 · spec check 16-11 (rule 25): before force update is turned on, the console shows how many
-- readers it locks out. Phones that opened the app in the last 7 days (user_devices.last_seen_at,
-- written by register_device at every app start) are compared with the saved minimum for their
-- platform; the app version is read as major.minor, as get_app_config compares it. A phone with no
-- version is counted in the total but never as locked out.
create function public.force_update_impact() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_android text := public._config('android_min_version') #>> '{}';
  v_ios text := public._config('ios_min_version') #>> '{}';
  v jsonb;
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Not allowed: manage_settings' using errcode = 'insufficient_privilege';
  end if;
  with d as (
    select d.user_id,
           coalesce(public._version_cmp(substring(d.app_version from '^\d+\.\d+'),
                      case lower(split_part(coalesce(d.os, ''), ' ', 1))
                        when 'android' then v_android when 'ios' then v_ios end) < 0, false) as below
    from public.user_devices d
    where d.revoked_at is null and d.last_seen_at > now() - interval '7 days'
  )
  select jsonb_build_object(
    'phones', count(*),
    'phones_below', count(*) filter (where below),
    'readers', count(distinct user_id),
    'readers_below', count(distinct user_id) filter (where below),
    'share_pct', case when count(*) = 0 then 0
                      else round(100.0 * count(*) filter (where below) / count(*), 1) end)
  into v from d;
  return v || jsonb_build_object('android_min_version', v_android, 'ios_min_version', v_ios);
end $$;

revoke execute on function public.force_update_impact() from public, anon, service_role;
grant execute on function public.force_update_impact() to authenticated;
