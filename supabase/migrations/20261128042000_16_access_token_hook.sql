-- Flow 16 · spec check 16-26 (Server: access token hook): Supabase Auth's custom access token hook.
-- Every token it issues carries `staff_role` while the user holds an active staff row, read live
-- from staff_roles at issue time; a reader, or staff who were removed or deactivated, get no claim
-- (an older one is dropped on refresh). `aal` is already set by Auth itself and is left alone.
-- The claim is a hint for logs and tools; access is still decided in the database on every call
-- (has_permission, get_staff_context), never from the token.
-- Enabled locally in supabase/config.toml; on hosted projects the owner turns it on under
-- Authentication → Hooks (docs/launch/RUNBOOK.md).

create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_role text;
begin
  select s.role::text into v_role
  from public.staff_roles s
  where s.user_id = (event ->> 'user_id')::uuid and s.active;
  v_claims := case when v_role is null then v_claims - 'staff_role'
                   else jsonb_set(v_claims, '{staff_role}', to_jsonb(v_role)) end;
  return jsonb_set(event, '{claims}', v_claims);
exception when others then
  -- Never stop a sign-in over the hint.
  return event;
end $$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
