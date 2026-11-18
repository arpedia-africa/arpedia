-- Flow 01 · flow 16 pass 1: staff access. Invites, the permission matrix, has_permission() with
-- two-step (AAL2, at most 12 hours old), backup codes, sign-in lockouts and the Team RPCs.
-- Flow 00's staff_roles stays the staff table (flow 16 calls it staff_members); this adds its
-- remaining columns. Status: active = Active (or Not set up while no authenticator is verified),
-- not active = Disabled; Invited lives in staff_invites until the invite is accepted.

-- ─── staff_roles: remaining staff_members columns ───────────────────────────
alter table public.staff_roles
  add column phone text,
  add column last_active_at timestamptz,
  add column disabled_at timestamptz,
  add column disabled_by uuid references public.profiles (id);

-- ─── Permission matrix (seeded, read-only to every role) ────────────────────
create type public.permission_level as enum ('allow', 'limited');

create table public.role_permissions (
  role public.staff_role not null,
  permission text not null,
  level public.permission_level not null default 'allow',
  limit_note text,
  second_person boolean not null default false,
  primary key (role, permission)
);

-- Rows for s-roles in display order; matrix_order null = page access only (not drawn in the matrix).
create table public.permissions (
  key text primary key,
  label text not null,
  matrix_order int,
  more boolean not null default false
);
insert into public.permissions (key, label, matrix_order, more) values
  ('view_readers', 'View readers', 1, false),
  ('grant_credits', 'Grant credits', 2, false),
  ('suspend_readers', 'Suspend or ban', 3, false),
  ('approve_books', 'Approve books', 4, false),
  ('curate_discover', 'Curate Discover', 5, false),
  ('moderate_reports', 'Moderate reports', 6, false),
  ('view_money', 'View money', 7, false),
  ('refund', 'Refund', 8, false),
  ('change_prices', 'Change prices', 9, false),
  ('release_payouts', 'Release payouts', 10, false),
  ('manage_team', 'Manage team', 11, false),
  ('export_personal', 'Export personal details', 12, false),
  ('edit_readers', 'Edit readers', 13, true),
  ('format_books', 'Format books', 14, true),
  ('decide_claims', 'Decide copyright claims', 15, true),
  ('send_push', 'Send push', 16, true),
  ('view_audit', 'View audit log', 17, true),
  ('answer_support', 'Support inbox', null, false),
  ('view_analytics', 'Analytics', null, false),
  ('manage_settings', 'App settings', null, false);

alter table public.role_permissions add foreign key (permission) references public.permissions (key);

insert into public.role_permissions (role, permission, level, limit_note, second_person)
select r.role::public.staff_role, r.permission, r.level::public.permission_level, r.note, r.second
from (values
  ('super_admin', 'view_readers', 'allow', null, false),
  ('operations_admin', 'view_readers', 'allow', null, false),
  ('moderator', 'view_readers', 'allow', null, false),
  ('finance', 'view_readers', 'limited', 'No contact', false),
  ('support', 'view_readers', 'allow', null, false),
  ('analyst', 'view_readers', 'limited', 'Totals', false),
  ('super_admin', 'grant_credits', 'allow', null, false),
  ('operations_admin', 'grant_credits', 'allow', null, false),
  ('support', 'grant_credits', 'limited', 'Up to 500', false),
  ('super_admin', 'suspend_readers', 'allow', null, false),
  ('operations_admin', 'suspend_readers', 'allow', null, false),
  ('moderator', 'suspend_readers', 'allow', null, false),
  ('super_admin', 'approve_books', 'allow', null, false),
  ('operations_admin', 'approve_books', 'allow', null, false),
  ('publisher', 'approve_books', 'allow', null, false),
  ('super_admin', 'curate_discover', 'allow', null, false),
  ('operations_admin', 'curate_discover', 'allow', null, false),
  ('publisher', 'curate_discover', 'allow', null, false),
  ('super_admin', 'moderate_reports', 'allow', null, false),
  ('operations_admin', 'moderate_reports', 'allow', null, false),
  ('moderator', 'moderate_reports', 'allow', null, false),
  ('support', 'moderate_reports', 'limited', 'Escalate', false),
  ('super_admin', 'view_money', 'allow', null, false),
  ('operations_admin', 'view_money', 'limited', 'Summary', false),
  ('finance', 'view_money', 'allow', null, false),
  ('support', 'view_money', 'limited', 'Reader payments', false),
  ('analyst', 'view_money', 'limited', 'Totals', false),
  ('super_admin', 'refund', 'allow', null, false),
  ('finance', 'refund', 'allow', null, false),
  ('support', 'refund', 'limited', 'Request', false),
  ('super_admin', 'change_prices', 'allow', null, true),
  ('finance', 'change_prices', 'limited', 'Propose', false),
  ('super_admin', 'release_payouts', 'allow', null, true),
  ('finance', 'release_payouts', 'limited', 'Calculate', false),
  ('super_admin', 'manage_team', 'allow', null, false),
  ('super_admin', 'export_personal', 'allow', null, false),
  ('super_admin', 'edit_readers', 'allow', null, false),
  ('operations_admin', 'edit_readers', 'allow', null, false),
  ('support', 'edit_readers', 'limited', 'Name, email', false),
  ('super_admin', 'format_books', 'allow', null, false),
  ('operations_admin', 'format_books', 'allow', null, false),
  ('publisher', 'format_books', 'allow', null, false),
  ('super_admin', 'decide_claims', 'allow', null, false),
  ('operations_admin', 'decide_claims', 'allow', null, false),
  ('moderator', 'decide_claims', 'limited', 'First review', false),
  ('super_admin', 'send_push', 'allow', null, false),
  ('operations_admin', 'send_push', 'allow', null, false),
  ('super_admin', 'view_audit', 'allow', null, false),
  ('operations_admin', 'view_audit', 'allow', null, false),
  ('finance', 'view_audit', 'limited', 'Money only', false),
  ('analyst', 'view_audit', 'allow', null, false),
  ('super_admin', 'answer_support', 'allow', null, false),
  ('operations_admin', 'answer_support', 'allow', null, false),
  ('support', 'answer_support', 'allow', null, false),
  ('super_admin', 'view_analytics', 'allow', null, false),
  ('operations_admin', 'view_analytics', 'allow', null, false),
  ('finance', 'view_analytics', 'allow', null, false),
  ('analyst', 'view_analytics', 'allow', null, false),
  ('super_admin', 'manage_settings', 'allow', null, false),
  ('operations_admin', 'manage_settings', 'limited', 'Remote copy', false)
) as r (role, permission, level, note, second);

-- ─── Invites ────────────────────────────────────────────────────────────────
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email like '%@arpedia.africa'),
  full_name text not null check (char_length(full_name) between 1 and 80),
  role public.staff_role not null,
  invited_by uuid references public.profiles (id),
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '72 hours',
  accepted_at timestamptz,
  accepted_user_id uuid references public.profiles (id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
-- One open invite per email.
create unique index staff_invites_open_idx on public.staff_invites (email)
  where accepted_at is null and revoked_at is null;

-- ─── Two-step: backup codes and backup-code sessions ────────────────────────
create table public.staff_backup_codes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, code_hash)
);

-- A backup code verifies the current Auth session (JWT session_id) in place of an app code.
create table public.staff_backup_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  verified_at timestamptz not null default now()
);

-- Failed sign-in passwords (per email) and codes (per person), for the lockouts in rule 8.
create table public.staff_auth_failures (
  id bigint generated always as identity primary key,
  email text,
  user_id uuid,
  kind text not null check (kind in ('password', 'code')),
  at timestamptz not null default now()
);
create index staff_auth_failures_email_idx on public.staff_auth_failures (email, at desc) where kind = 'password';
create index staff_auth_failures_user_idx on public.staff_auth_failures (user_id, at desc) where kind = 'code';

-- ─── Two-step helpers ───────────────────────────────────────────────────────
-- When the caller last proved two-step in this session: the TOTP time in the JWT's amr claim
-- (an AAL2 session), or the time a backup code verified this session. Null when neither.
create function public.staff_mfa_verified_at() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select greatest(
    (select to_timestamp((a ->> 'timestamp')::double precision)
       from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
       where auth.jwt() ->> 'aal' = 'aal2' and a ->> 'method' = 'totp'
       order by 1 desc limit 1),
    (select b.verified_at from public.staff_backup_sessions b
       where b.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid and b.user_id = auth.uid())
  )
$$;

-- Two-step is valid for 12 hours (rule 4).
create function public.staff_mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.staff_mfa_verified_at() > now() - interval '12 hours', false)
$$;

-- True when the caller is active staff, passed two-step in the last 12 hours, and their role
-- holds `p_permission` (allowed or limited). Every flow-16-era admin RPC and policy uses this.
create function public.has_permission(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_mfa_ok() and exists (
    select 1 from public.staff_roles s
    join public.role_permissions rp on rp.role = s.role and rp.permission = p_permission
    where s.user_id = auth.uid() and s.active
  )
$$;

-- Raise unless the caller holds the permission.
create function public.require_permission(p_permission text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_permission) then
    raise exception 'Not allowed: %', p_permission using errcode = 'insufficient_privilege';
  end if;
end $$;

-- ─── Console context ────────────────────────────────────────────────────────
-- What the console needs on every request: who, role, two-step state and permissions.
-- Null for anyone without an active staff row. Also stamps last_active_at (at most once a minute).
create function public.get_staff_context() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.staff_roles;
  v_verified timestamptz;
  v_enrolled boolean;
  v_locked_until timestamptz;
begin
  select * into s from public.staff_roles where user_id = uid and active;
  if not found then
    return null;
  end if;
  v_verified := public.staff_mfa_verified_at();
  select exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.factor_type = 'totp'
                 and f.status = 'verified') into v_enrolled;
  select max(at) + interval '10 minutes' into v_locked_until
    from (select at from public.staff_auth_failures
          where user_id = uid and kind = 'code' and at > now() - interval '10 minutes'
          order by at desc limit 5) f
    having count(*) >= 5;
  if v_verified > now() - interval '12 hours'
     and (s.last_active_at is null or s.last_active_at < now() - interval '1 minute') then
    update public.staff_roles set last_active_at = now() where user_id = uid;
  end if;
  return jsonb_build_object(
    'user_id', uid,
    'name', (select p.full_name from public.profiles p where p.id = uid),
    'email', (select u.email from auth.users u where u.id = uid),
    'role', s.role,
    'mfa_enrolled', v_enrolled,
    'mfa_verified_at', v_verified,
    'mfa_ok', coalesce(v_verified > now() - interval '12 hours', false),
    'code_locked_until', v_locked_until,
    'backup_codes_left', (select count(*) from public.staff_backup_codes b where b.user_id = uid and b.used_at is null),
    'permissions', coalesce((select jsonb_agg(rp.permission order by rp.permission)
                             from public.role_permissions rp where rp.role = s.role), '[]'::jsonb)
  );
end $$;

-- ─── Sign-in lockouts (rule 8) ──────────────────────────────────────────────
-- 5 wrong passwords in 15 minutes lock that email for 15 minutes. Callable before sign-in.
create function public.staff_signin_locked(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) >= 5 from public.staff_auth_failures
  where kind = 'password' and email = lower(trim(p_email)) and at > now() - interval '15 minutes'
$$;

create function public.note_staff_signin_failure(p_email text) returns void
language sql security definer set search_path = '' as $$
  insert into public.staff_auth_failures (email, kind)
  select lower(trim(p_email)), 'password' where char_length(p_email) between 3 and 320
$$;

-- After a good password the caller clears their own email's failures.
create function public.clear_staff_signin_failures() returns void
language sql security definer set search_path = '' as $$
  delete from public.staff_auth_failures
  where kind = 'password' and email = (select lower(u.email) from auth.users u where u.id = auth.uid())
$$;

-- 5 wrong codes lock code entry for 10 minutes (get_staff_context reports code_locked_until).
create function public.note_staff_code_failure() returns void
language sql security definer set search_path = '' as $$
  insert into public.staff_auth_failures (user_id, kind) select auth.uid(), 'code' where auth.uid() is not null
$$;

-- ─── Backup codes ───────────────────────────────────────────────────────────
-- Replace the caller's 10 backup codes and return them once, in plain text (format xxxx-xxxx).
-- Needs a fresh app code: only an AAL2 session can make new codes.
create function public.create_staff_backup_codes() returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  codes text[] := '{}';
  c text;
begin
  if not exists (select 1 from public.staff_roles where user_id = uid and active)
     or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Two-step needed' using errcode = 'insufficient_privilege';
  end if;
  delete from public.staff_backup_codes where user_id = uid;
  for i in 1..10 loop
    c := substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 4) || '-'
         || substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 4);
    codes := codes || c;
    insert into public.staff_backup_codes (user_id, code_hash)
      values (uid, encode(extensions.digest(c, 'sha256'), 'hex'));
  end loop;
  return codes;
end $$;

-- Use one backup code in place of an app code for this session. Returns the codes left,
-- or -1 when the code is wrong or used (and counts as a wrong code).
create function public.use_staff_backup_code(p_code text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_hash text := encode(extensions.digest(lower(trim(p_code)), 'sha256'), 'hex');
begin
  if uid is null or sid is null or not exists (select 1 from public.staff_roles where user_id = uid and active) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.staff_backup_codes set used_at = now()
    where user_id = uid and code_hash = v_hash and used_at is null;
  if not found then
    insert into public.staff_auth_failures (user_id, kind) values (uid, 'code');
    return -1;
  end if;
  insert into public.staff_backup_sessions (session_id, user_id) values (sid, uid)
    on conflict (session_id) do update set verified_at = now();
  return (select count(*) from public.staff_backup_codes where user_id = uid and used_at is null);
end $$;

-- ─── Team (s-team, s-team-invite) ───────────────────────────────────────────
-- Staff and open invites for the Team list. Super admin only (manage_team).
create function public.list_staff() returns table (
  kind text, id uuid, full_name text, email text, role public.staff_role, active boolean,
  mfa_on boolean, last_active_at timestamptz, invited_by_name text, expires_at timestamptz,
  is_self boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('manage_team');
  return query
    select 'staff', s.user_id, p.full_name, u.email::text, s.role, s.active,
      exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.factor_type = 'totp'
              and f.status = 'verified'),
      s.last_active_at, null::text, null::timestamptz, s.user_id = auth.uid()
    from public.staff_roles s
    join public.profiles p on p.id = s.user_id
    join auth.users u on u.id = s.user_id
    union all
    select 'invite', i.id, i.full_name, i.email, i.role, true, false, null::timestamptz,
      ip.full_name, i.expires_at, false
    from public.staff_invites i
    left join public.profiles ip on ip.id = i.invited_by
    where i.accepted_at is null and i.revoked_at is null;
end $$;

-- Who holds each role (s-roles "Who has which role"); any staff with two-step.
create function public.staff_by_role() returns table (role public.staff_role, names text[], invited text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.staff_mfa_ok() and public.is_staff()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.role,
      coalesce((select array_agg(p.full_name order by s.created_at) from public.staff_roles s
                join public.profiles p on p.id = s.user_id where s.role = r.role and s.active), '{}'),
      coalesce((select array_agg(i.full_name order by i.created_at) from public.staff_invites i
                where i.role = r.role and i.accepted_at is null and i.revoked_at is null
                  and i.expires_at > now()), '{}')
    from unnest(enum_range(null::public.staff_role)) as r (role);
end $$;

-- Rule 16: at least 2 active Super admins must remain while 2 or more exist.
create function public._check_super_admins(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  select count(*) into n from public.staff_roles where role = 'super_admin' and active;
  if exists (select 1 from public.staff_roles where user_id = p_user and role = 'super_admin' and active)
     and n <= 2 then
    raise exception 'There must always be at least 2 active Super admins' using errcode = 'check_violation';
  end if;
end $$;

-- Create an invite. The Worker makes the token and sends the email; only its hash is stored.
create function public.invite_staff(p_email text, p_name text, p_role public.staff_role, p_token_hash text,
  p_actor uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_actor);
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if auth.uid() is not null then
    perform public.require_permission('manage_team');
  elsif coalesce(auth.role(), '') <> 'service_role' or p_actor is null
        or not exists (select 1 from public.staff_roles where user_id = p_actor and role = 'super_admin' and active) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@\s]+@arpedia\.africa$' then
    raise exception 'Invites only go to @arpedia.africa addresses' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.staff_roles s join auth.users u on u.id = s.user_id
             where lower(u.email) = v_email) then
    raise exception 'This person is already on the team' using errcode = 'unique_violation';
  end if;
  -- A new invite to the same email replaces the open one (Resend).
  update public.staff_invites set revoked_at = now()
    where email = v_email and accepted_at is null and revoked_at is null;
  insert into public.staff_invites (email, full_name, role, invited_by, token_hash)
    values (v_email, trim(p_name), p_role, v_actor, p_token_hash)
    returning id into v_id;
  perform public._audit_as(v_actor, 'team', 'staff.invite', 'staff_invite', v_id::text, trim(p_name),
    'Invited ' || v_email, null, jsonb_build_object('email', v_email, 'role', p_role), null);
  return v_id;
end $$;

-- The invite behind a token, for the accept page (Worker only).
create function public.get_staff_invite(p_token_hash text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', i.id, 'email', i.email, 'full_name', i.full_name, 'role', i.role,
    'state', case when i.accepted_at is not null then 'used' when i.revoked_at is not null then 'revoked'
                  when i.expires_at <= now() then 'expired' else 'open' end)
  from public.staff_invites i where i.token_hash = p_token_hash
$$;

-- Accept an invite once the Worker has created (or found) the auth user. Worker only.
create function public.accept_staff_invite(p_token_hash text, p_user uuid) returns public.staff_role
language plpgsql security definer set search_path = '' as $$
declare
  i public.staff_invites;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into i from public.staff_invites where token_hash = p_token_hash for update;
  if not found or i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now() then
    raise exception 'This invite link has expired or was already used' using errcode = 'no_data_found';
  end if;
  if (select lower(email) from auth.users where id = p_user) <> i.email then
    raise exception 'Invite email does not match' using errcode = 'check_violation';
  end if;
  update public.staff_invites set accepted_at = now(), accepted_user_id = p_user where id = i.id;
  update public.profiles set full_name = i.full_name where id = p_user and full_name = '';
  insert into public.staff_roles (user_id, role, created_by) values (p_user, i.role, i.invited_by)
    on conflict (user_id) do update set role = excluded.role, active = true, disabled_at = null,
      disabled_by = null, created_by = excluded.created_by;
  perform public._audit_as(p_user, 'team', 'staff.accept_invite', 'staff', p_user::text, i.full_name,
    i.full_name || ' accepted the invite', null, jsonb_build_object('role', i.role), null);
  return i.role;
end $$;

create function public.revoke_staff_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.staff_invites;
begin
  perform public.require_permission('manage_team');
  update public.staff_invites set revoked_at = now()
    where id = p_invite and accepted_at is null and revoked_at is null
    returning * into i;
  if not found then
    raise exception 'Invite not found' using errcode = 'no_data_found';
  end if;
  perform public.write_audit('team', 'staff.revoke_invite', 'staff_invite', i.id::text, i.full_name,
    'Cancelled the invite to ' || i.email, null, null, null);
end $$;

-- Change one person's role (rule 13, 16). Takes effect on their next request.
create function public.change_staff_role(p_user uuid, p_role public.staff_role) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old public.staff_role;
begin
  perform public.require_permission('manage_team');
  select role into old from public.staff_roles where user_id = p_user for update;
  if not found then
    raise exception 'Staff member not found' using errcode = 'no_data_found';
  end if;
  if old = p_role then
    return;
  end if;
  if old = 'super_admin' then
    perform public._check_super_admins(p_user);
  end if;
  update public.staff_roles set role = p_role where user_id = p_user;
  perform public.write_audit('team', 'staff.change_role', 'staff', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Role changed',
    jsonb_build_object('role', old), jsonb_build_object('role', p_role), null);
end $$;

-- Disable (signs the person out everywhere) or switch back on (rule 15). Never yourself.
create function public.set_staff_status(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  was boolean;
begin
  perform public.require_permission('manage_team');
  if p_user = auth.uid() then
    raise exception 'You can''t disable your own account' using errcode = 'check_violation';
  end if;
  select active into was from public.staff_roles where user_id = p_user for update;
  if not found then
    raise exception 'Staff member not found' using errcode = 'no_data_found';
  end if;
  if was = p_active then
    return;
  end if;
  if not p_active then
    perform public._check_super_admins(p_user);
    update public.staff_roles set active = false, disabled_at = now(), disabled_by = auth.uid()
      where user_id = p_user;
    -- Ends every session: refresh tokens die with them, and has_permission() refuses the
    -- still-valid access token on its next request because the row is no longer active.
    delete from auth.sessions where user_id = p_user;
  else
    update public.staff_roles set active = true, disabled_at = null, disabled_by = null where user_id = p_user;
  end if;
  perform public.write_audit('team', case when p_active then 'staff.enable' else 'staff.disable' end,
    'staff', p_user::text, (select full_name from public.profiles where id = p_user),
    case when p_active then 'Account switched on' else 'Account disabled' end,
    jsonb_build_object('active', was), jsonb_build_object('active', p_active), null);
end $$;

-- Reset someone's two-step (or your own): removes their authenticator and backup codes and
-- signs them out, so they set it up again at next sign-in.
create function public.reset_staff_mfa(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user <> auth.uid() then
    perform public.require_permission('manage_team');
  elsif not (public.staff_mfa_ok() and public.is_staff()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.staff_roles where user_id = p_user) then
    raise exception 'Staff member not found' using errcode = 'no_data_found';
  end if;
  delete from auth.mfa_factors where user_id = p_user;
  delete from public.staff_backup_codes where user_id = p_user;
  delete from public.staff_backup_sessions where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
  perform public.write_audit('team', 'staff.reset_two_step', 'staff', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Two-step reset', null, null, null);
end $$;

-- Audit as a named staff member when the caller is a Worker (service role) acting for them.
create function public._audit_as(p_actor uuid, p_area text, p_action text, p_object_type text,
  p_object_id text, p_object_label text, p_summary text, p_before jsonb, p_after jsonb, p_reason text)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if auth.uid() is not null then
    return public.write_audit(p_area, p_action, p_object_type, p_object_id, p_object_label, p_summary,
      p_before, p_after, p_reason);
  end if;
  insert into public.audit_log (actor_id, actor_name, actor_role, area, action, object_type, object_id,
                                object_label, summary, before, after, reason)
  select p_actor, p.full_name, s.role, p_area, p_action, p_object_type, p_object_id,
         p_object_label, p_summary, p_before, p_after, p_reason
  from (select 1) one
  left join public.profiles p on p.id = p_actor
  left join public.staff_roles s on s.user_id = p_actor
  returning id into v_id;
  return v_id;
end $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.role_permissions enable row level security;
alter table public.permissions enable row level security;
alter table public.staff_invites enable row level security;
alter table public.staff_backup_codes enable row level security;
alter table public.staff_backup_sessions enable row level security;
alter table public.staff_auth_failures enable row level security;

-- The matrix is readable by any active staff; nobody writes it (code release only, rule 18).
create policy role_permissions_select on public.role_permissions for select to authenticated
  using ((select public.is_staff()));
create policy permissions_select on public.permissions for select to authenticated
  using ((select public.is_staff()));
-- Invites: Super admins (with two-step) read them; writes only through RPCs.
create policy staff_invites_select on public.staff_invites for select to authenticated
  using ((select public.has_permission('manage_team')));
-- Backup codes, backup sessions and failures: no client access at all.

revoke all on public.role_permissions, public.permissions, public.staff_invites, public.staff_backup_codes,
  public.staff_backup_sessions, public.staff_auth_failures from anon, authenticated;
grant select on public.role_permissions, public.permissions, public.staff_invites to authenticated;
revoke insert, update, delete, truncate on public.role_permissions, public.permissions from service_role;

revoke execute on function public.staff_mfa_verified_at(), public.staff_mfa_ok(), public.has_permission(text),
  public.require_permission(text), public.get_staff_context(), public.staff_signin_locked(text),
  public.note_staff_signin_failure(text), public.clear_staff_signin_failures(), public.note_staff_code_failure(),
  public.create_staff_backup_codes(), public.use_staff_backup_code(text), public.list_staff(),
  public.staff_by_role(), public._check_super_admins(uuid),
  public.invite_staff(text, text, public.staff_role, text, uuid), public.get_staff_invite(text),
  public.accept_staff_invite(text, uuid), public.revoke_staff_invite(uuid),
  public.change_staff_role(uuid, public.staff_role), public.set_staff_status(uuid, boolean),
  public.reset_staff_mfa(uuid),
  public._audit_as(uuid, text, text, text, text, text, text, jsonb, jsonb, text)
  from public, anon, authenticated;

grant execute on function public.staff_signin_locked(text), public.note_staff_signin_failure(text)
  to anon, authenticated;
grant execute on function public.staff_mfa_verified_at(), public.staff_mfa_ok(), public.has_permission(text),
  public.require_permission(text), public.get_staff_context(), public.clear_staff_signin_failures(),
  public.note_staff_code_failure(), public.create_staff_backup_codes(), public.use_staff_backup_code(text),
  public.list_staff(), public.staff_by_role(), public.invite_staff(text, text, public.staff_role, text, uuid),
  public.revoke_staff_invite(uuid), public.change_staff_role(uuid, public.staff_role),
  public.set_staff_status(uuid, boolean), public.reset_staff_mfa(uuid)
  to authenticated;
grant execute on function public.has_permission(text), public.invite_staff(text, text, public.staff_role, text, uuid),
  public.get_staff_invite(text), public.accept_staff_invite(text, uuid)
  to service_role;
