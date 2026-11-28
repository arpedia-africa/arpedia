-- Spec check 16-21 (flow 16 rule 4): no staff session lasts longer than 12 hours, enforced on the
-- server, not only by the console's cookie lifetime. Supabase's own `timebox` is project-wide and
-- would also sign readers out, so the cap is applied to staff only, here:
--   - staff_mfa_ok() (and so has_permission / require_permission) is false in an Auth session that
--     started 12 or more hours ago, even after a fresh two-step code in it;
--   - get_staff_context() returns null in such a session, so the console sends the person to sign
--     in again (a new session). The old session is not deleted: its access token would stay valid
--     for up to an hour with no session row to age, so the row stays and every staff check keeps
--     refusing it.
-- A JWT whose session row is not found is left to Auth (a signed-out session cannot refresh).

-- True unless the caller's Auth session (JWT session_id) started 12 or more hours ago.
create function public.staff_session_fresh() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from auth.sessions s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.created_at <= now() - interval '12 hours'
  )
$$;

-- Two-step is valid for 12 hours (rule 4), inside a session younger than 12 hours.
create or replace function public.staff_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.staff_mfa_verified_at() > now() - interval '12 hours', false)
    and public.staff_session_fresh()
$$;

-- As in 20261118000200_01_staff_access.sql, plus the 12-hour session cap.
create or replace function public.get_staff_context() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.staff_roles;
  v_verified timestamptz;
  v_enrolled boolean;
  v_locked_until timestamptz;
  v_ok boolean;
begin
  select * into s from public.staff_roles where user_id = uid and active;
  if not found then
    return null;
  end if;
  if not public.staff_session_fresh() then
    return null;
  end if;
  v_verified := public.staff_mfa_verified_at();
  v_ok := coalesce(v_verified > now() - interval '12 hours', false);
  select exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.factor_type = 'totp'
                 and f.status = 'verified') into v_enrolled;
  select max(at) + interval '10 minutes' into v_locked_until
    from (select at from public.staff_auth_failures
          where user_id = uid and kind = 'code' and at > now() - interval '10 minutes'
          order by at desc limit 5) f
    having count(*) >= 5;
  if v_ok and (s.last_active_at is null or s.last_active_at < now() - interval '1 minute') then
    update public.staff_roles set last_active_at = now() where user_id = uid;
  end if;
  return jsonb_build_object(
    'user_id', uid,
    'name', (select p.full_name from public.profiles p where p.id = uid),
    'email', (select u.email from auth.users u where u.id = uid),
    'role', s.role,
    'mfa_enrolled', v_enrolled,
    'mfa_verified_at', v_verified,
    'mfa_ok', v_ok,
    'code_locked_until', v_locked_until,
    'backup_codes_left', (select count(*) from public.staff_backup_codes b where b.user_id = uid and b.used_at is null),
    'permissions', coalesce((select jsonb_agg(rp.permission order by rp.permission)
                             from public.role_permissions rp where rp.role = s.role), '[]'::jsonb)
  );
end $$;

-- Internal: staff_mfa_ok and get_staff_context call it as their owner.
revoke execute on function public.staff_session_fresh() from public, anon, authenticated;
