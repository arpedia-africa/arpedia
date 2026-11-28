-- Flow 16 · spec check 16-25: "Preview as". A Super admin looks at another role's sidebar and Home
-- for review. Read-only: the console still acts with the Super admin's own role and RLS; only the
-- sidebar and Home tasks follow the previewed role. Every start of a preview is audited.
--   staff_preview_as(role)   Super admin only; returns that role's permissions (the sidebar) and
--                            writes "team · staff.preview_as" to audit_log.

create function public.staff_preview_as(p_role public.staff_role) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_perms jsonb;
begin
  if not public.is_staff('super_admin') then
    raise exception 'Not allowed: Super admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_role = 'super_admin' then
    raise exception 'bad_role' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb) into v_perms
  from public.role_permissions rp where rp.role = p_role;
  perform public.write_audit('team', 'staff.preview_as', 'staff_role', p_role::text, p_role::text,
    'Previewed the console as ' || replace(p_role::text, '_', ' '));
  return jsonb_build_object('role', p_role, 'permissions', v_perms);
end $$;

revoke all on function public.staff_preview_as(public.staff_role) from public, anon;
grant execute on function public.staff_preview_as(public.staff_role) to authenticated;
