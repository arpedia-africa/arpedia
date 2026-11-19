-- Flow 16 pass 2 · Admin settings (docs/prd/16-admin-settings.md).
-- Step-up codes, pricing rules with a version check, Undo and the 00:00 WAT apply job, app
-- configuration (versions, force update, maintenance, OTA), feature flags, remote copy, versioned
-- policies with accept-again, integration health with masked keys, two-person approval requests,
-- staff alert preferences, My account sessions, and audit log filters with request context.
--
-- Built on pass 1 (flow 01: staff_roles = staff_members, role_permissions, has_permission(),
-- backup codes), flow 03 (app_config) and flow 09 (pricing_rule_versions, _plan_check()).

-- ─── Audit: request context (rule 22) ───────────────────────────────────────
-- write_audit now also records request id, IP, device and when two-step was verified, from the
-- PostgREST request headers. Same signature, so every caller and grant stays as it was.
create or replace function public.write_audit(
  p_area text,
  p_action text,
  p_object_type text default null,
  p_object_id text default null,
  p_object_label text default null,
  p_summary text default null,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_uid uuid := auth.uid();
  h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}');
  v_ip text := trim(split_part(coalesce(h ->> 'cf-connecting-ip', h ->> 'x-forwarded-for', ''), ',', 1));
begin
  if v_uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'write_audit: not allowed' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.is_staff() then
    raise exception 'write_audit: staff only' using errcode = 'insufficient_privilege';
  end if;

  insert into public.audit_log (actor_id, actor_name, actor_role, area, action, object_type, object_id,
                                object_label, summary, before, after, reason, request_id, ip, device,
                                mfa_verified_at)
  select v_uid, p.full_name, s.role, p_area, p_action, p_object_type, p_object_id,
         p_object_label, p_summary, p_before, p_after, p_reason,
         coalesce(h ->> 'x-request-id', h ->> 'cf-ray'),
         case when v_ip ~ '^[0-9a-fA-F:.]+$' then v_ip::inet end,
         left(h ->> 'user-agent', 300),
         case when v_uid is not null then public.staff_mfa_verified_at() end
  from (select 1) one
  left join public.profiles p on p.id = v_uid
  left join public.staff_roles s on s.user_id = v_uid
  returning id into v_id;
  return v_id;
end $$;

create index audit_log_area_idx on public.audit_log (area, at desc);

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- The caller's level for a permission (null when they lack it or two-step is stale).
create function public._perm_level(p_permission text) returns public.permission_level
language sql stable security definer set search_path = '' as $$
  select rp.level from public.staff_roles s
  join public.role_permissions rp on rp.role = s.role and rp.permission = p_permission
  where s.user_id = auth.uid() and s.active and public.staff_mfa_ok()
$$;

-- Raise unless the caller holds the permission at level allow (not limited).
create function public._require_full(p_permission text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if public._perm_level(p_permission) is distinct from 'allow' then
    raise exception 'Not allowed: %', p_permission using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Compare app versions as major.minor numbers ("25.4" < "25.10"). Null when either is malformed.
create function public._version_cmp(a text, b text) returns int
language sql immutable set search_path = '' as $$
  select case
    when a !~ '^\d+\.\d+$' or b !~ '^\d+\.\d+$' then null
    else sign((split_part(a, '.', 1)::int - split_part(b, '.', 1)::int) * 100000
              + (split_part(a, '.', 2)::int - split_part(b, '.', 2)::int))::int
  end
$$;

-- Stable 0–99 bucket per user and flag (rule 27): the same user always lands in the same bucket.
create function public._rollout_bucket(p_user uuid, p_key text) returns int
language sql immutable set search_path = '' as $$
  select (('x' || lpad(substr(md5(p_key || ':' || p_user::text), 1, 8), 16, '0'))::bit(64)::bigint % 100)::int
$$;

-- ─── Step-up codes (rule 6) ─────────────────────────────────────────────────
-- One row per fresh code. The console verifies an authenticator code with Supabase MFA, which puts
-- a new TOTP time in the JWT; verify_stepup turns that proof (or a backup code) into a single-use,
-- 5-minute step-up for one scope. A TOTP proof makes at most one step-up. Returns null for a wrong
-- or used backup code.
create table public.staff_stepups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  scope text not null check (scope in ('pricing_rules', 'maintenance', 'force_update', 'ota_rollback',
                                       'rotate_key', 'publish_policy', 'release_payout',
                                       'confirm_price_change', 'export_personal')),
  method text not null check (method in ('totp', 'backup')),
  proof_at timestamptz not null,
  verified_at timestamptz not null default now(),
  consumed_at timestamptz
);
create unique index staff_stepups_totp_once on public.staff_stepups (user_id, proof_at) where method = 'totp';
create index staff_stepups_user_idx on public.staff_stepups (user_id, verified_at desc);

create function public.verify_stepup(p_scope text, p_backup_code text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_proof timestamptz;
  v_method text;
  v_id uuid;
begin
  if not (public.is_staff() and public.staff_mfa_ok()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_backup_code is not null then
    update public.staff_backup_codes set used_at = now()
      where user_id = uid and used_at is null
        and code_hash = encode(extensions.digest(lower(trim(p_backup_code)), 'sha256'), 'hex');
    if not found then
      -- Null (not an error) so the failure row counts towards the code lockout.
      insert into public.staff_auth_failures (user_id, kind) values (uid, 'code');
      return null;
    end if;
    v_method := 'backup';
    v_proof := now();
  else
    select to_timestamp((a ->> 'timestamp')::double precision) into v_proof
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
      where auth.jwt() ->> 'aal' = 'aal2' and a ->> 'method' = 'totp'
      order by 1 desc limit 1;
    if v_proof is null or v_proof < now() - interval '5 minutes' then
      perform public._raise('stepup_expired');
    end if;
    v_method := 'totp';
  end if;
  begin
    insert into public.staff_stepups (user_id, scope, method, proof_at)
      values (uid, p_scope, v_method, v_proof) returning id into v_id;
  exception
    when unique_violation then
      perform public._raise('stepup_used');
    when check_violation then
      perform public._raise('stepup_bad_scope');
  end;
  return v_id;
end $$;

-- Use a step-up once, for its scope, within 5 minutes. Raises stepup_expired otherwise
-- ("Code expired, enter a new one").
create function public._consume_stepup(p_id uuid, p_scope text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz;
begin
  update public.staff_stepups set consumed_at = now()
    where id = p_id and user_id = auth.uid() and scope = p_scope and consumed_at is null
      and verified_at > now() - interval '5 minutes' and proof_at > now() - interval '5 minutes'
    returning verified_at into v_at;
  if v_at is null then
    perform public._raise('stepup_expired');
  end if;
  return v_at;
end $$;

-- ─── Two-person approvals (rule 17) ─────────────────────────────────────────
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('payout_release', 'price_change', 'credit_grant', 'pii_export')),
  payload jsonb not null default '{}',
  requested_by uuid not null references public.profiles (id),
  approver_id uuid references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  constraint approval_not_self check (approver_id is null or approver_id <> requested_by),
  constraint approval_decided check ((status = 'pending') = (decided_at is null) or status = 'expired')
);
create index approval_requests_pending_idx on public.approval_requests (kind, created_at) where status = 'pending';

-- Who may ask for and who may decide each kind.
create function public._approval_roles(p_kind text, p_decide boolean) returns public.staff_role[]
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'payout_release' then case when p_decide then '{super_admin}' else '{finance,super_admin}' end
    when 'price_change' then case when p_decide then '{super_admin}' else '{finance,super_admin}' end
    when 'credit_grant' then case when p_decide then '{super_admin,operations_admin}'
                                  else '{support,operations_admin,super_admin}' end
    when 'pii_export' then '{super_admin}'
  end::public.staff_role[]
$$;

create function public.request_approval(p_kind text, p_payload jsonb, p_reason text default null)
returns public.approval_requests
language plpgsql security definer set search_path = '' as $$
declare
  r public.approval_requests;
begin
  if not (public.staff_mfa_ok() and exists (select 1 from public.staff_roles s where s.user_id = auth.uid()
          and s.active and s.role = any (public._approval_roles(p_kind, false)))) then
    raise exception 'Not allowed: %', p_kind using errcode = 'insufficient_privilege';
  end if;
  if p_kind = 'pii_export' and char_length(trim(coalesce(p_reason, ''))) < 5 then
    perform public._raise('reason_required');
  end if;
  insert into public.approval_requests (kind, payload, requested_by, reason)
    values (p_kind, coalesce(p_payload, '{}'), auth.uid(), nullif(trim(coalesce(p_reason, '')), ''))
    returning * into r;
  perform public.write_audit(case when p_kind in ('payout_release', 'price_change') then 'money' else 'team' end,
    'approval.request', 'approval_request', r.id::text, p_kind, 'Asked for a second person', null,
    to_jsonb(r), p_reason);
  return r;
end $$;

create function public.decide_approval(p_id uuid, p_approve boolean, p_reason text default null)
returns public.approval_requests
language plpgsql security definer set search_path = '' as $$
declare
  r public.approval_requests;
begin
  select * into r from public.approval_requests where id = p_id for update;
  if not found or not (public.staff_mfa_ok() and exists (select 1 from public.staff_roles s
          where s.user_id = auth.uid() and s.active and s.role = any (public._approval_roles(r.kind, true)))) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if r.requested_by = auth.uid() then
    perform public._raise('own_request');
  end if;
  if r.status <> 'pending' then
    perform public._raise('already_decided');
  end if;
  if r.expires_at < now() then
    update public.approval_requests set status = 'expired' where id = p_id;
    perform public._raise('request_expired');
  end if;
  update public.approval_requests
    set status = case when p_approve then 'approved' else 'rejected' end, approver_id = auth.uid(),
        decided_at = now(), reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), reason)
    where id = p_id returning * into r;
  perform public.write_audit(case when r.kind in ('payout_release', 'price_change') then 'money' else 'team' end,
    case when p_approve then 'approval.approve' else 'approval.reject' end, 'approval_request', r.id::text,
    r.kind, case when p_approve then 'Approved' else 'Rejected' end, null, to_jsonb(r), p_reason);
  return r;
end $$;

-- ─── Pricing rules (rules 31–37) ────────────────────────────────────────────
-- pricing_rule_versions (flow 09) gains a version number, the step-up that saved it, the plan
-- check at save time, Undo (cancelled_*) and applied_at (set by the 00:00 WAT job).
-- Status: active = latest applied-or-due row; scheduled = effective_at in the future.
alter table public.pricing_rule_versions
  add column version integer,
  add column step_up_id uuid references public.staff_stepups (id),
  add column plan_check jsonb,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id),
  add column applied_at timestamptz;
update public.pricing_rule_versions v set version = n.rn, applied_at = v.effective_at
  from (select id, row_number() over (order by effective_at, created_at) as rn
        from public.pricing_rule_versions) n
  where n.id = v.id;
alter table public.pricing_rule_versions alter column version set not null;
create unique index pricing_rule_versions_version_idx on public.pricing_rule_versions (version);
-- At most one scheduled row.
create unique index pricing_rule_versions_one_pending on public.pricing_rule_versions ((true))
  where applied_at is null and cancelled_at is null;

-- Cancelled rows never take effect.
create or replace function public._rules(p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = '' as $$
  select rules from public.pricing_rule_versions where effective_at <= p_at and cancelled_at is null
  order by effective_at desc, created_at desc limit 1
$$;

create or replace function public._rules_version(p_at timestamptz default now()) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.pricing_rule_versions where effective_at <= p_at and cancelled_at is null
  order by effective_at desc, created_at desc limit 1
$$;

-- Stored pages under new rules: scaled when words per page changes (images count as whole pages,
-- so this is the stored count when it does not). Price = ceil(pages × credits per page), at least 1.
create function public._repriced(p_pages integer, p_old jsonb, p_new jsonb) returns table (pages integer, price integer)
language sql immutable set search_path = '' as $$
  select x.pages, greatest(ceil(x.pages * (p_new ->> 'credits_per_page')::numeric), 1)::int
  from (select case when (p_old ->> 'words_per_page') = (p_new ->> 'words_per_page') then p_pages
                    else ceil(p_pages * (p_old ->> 'words_per_page')::numeric
                              / (p_new ->> 'words_per_page')::numeric)::int end as pages) x
$$;

-- The pricing page: rules in effect, the scheduled row (with who saved it), and the version to
-- send back on save. Super admin, Operations admin and Finance (RLS rule for pricing_rules).
create function public.get_pricing_rules() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.pricing_rule_versions;
  s public.pricing_rule_versions;
begin
  if not (public.staff_mfa_ok() and public.is_staff_any('{operations_admin,finance}')) then
    raise exception 'Not allowed: pricing rules' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.pricing_rule_versions where id = public._rules_version();
  select * into s from public.pricing_rule_versions
    where applied_at is null and cancelled_at is null and effective_at > now();
  return jsonb_build_object(
    'version', (select max(version) from public.pricing_rule_versions where cancelled_at is null),
    'active', jsonb_build_object('id', a.id, 'version', a.version, 'rules', a.rules, 'effective_at', a.effective_at),
    'scheduled', case when s.id is not null then jsonb_build_object('id', s.id, 'version', s.version,
      'rules', s.rules, 'effective_at', s.effective_at, 'note', s.note, 'created_at', s.created_at,
      'changed_by', (select full_name from public.profiles where id = s.changed_by)) end,
    'can_save', public.is_staff('super_admin') and public.has_permission('change_prices'),
    'plan_check', public._plan_check(a.rules));
end $$;

-- Rule 34: what saving these rules would change. Super admin or Finance.
create or replace function public.preview_pricing_rules(p_rules jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_new jsonb;
  v_old jsonb := public._rules();
  v_res jsonb;
  v_check jsonb;
begin
  if not public.has_permission('change_prices') then
    raise exception 'Not allowed: change_prices' using errcode = 'insufficient_privilege';
  end if;
  v_new := public._validate_rules(p_rules);
  v_check := public._plan_check(v_new);
  with prices as (
    select b.id, b.title, r.price_credits as before, n.price as after
    from public.books b join public.book_revisions r on r.id = b.current_revision_id
    cross join lateral public._repriced(r.pages, v_old, v_new) n
    where b.status = 'live' and b.price_override_credits is null and r.pages is not null
  )
  select jsonb_build_object(
    'books_changed', count(*) filter (where before is distinct from after),
    'avg_before', round(avg(before), 1), 'avg_after', round(avg(after), 1),
    'biggest', (select jsonb_build_object('book_id', p2.id, 'title', p2.title, 'before', p2.before, 'after', p2.after)
                from prices p2 where p2.before is distinct from p2.after
                order by abs(p2.after - coalesce(p2.before, 0)) desc limit 1))
  into v_res from prices;
  return v_res || jsonb_build_object('rules', v_new, 'old_rules', v_old, 'effective_at', public._next_wat_midnight(),
    'changed', (select coalesce(jsonb_agg(k order by k), '[]') from jsonb_object_keys(v_new) k
                where v_new -> k is distinct from v_old -> k),
    'plan_check', v_check,
    'plan_check_ok', not exists (select 1 from jsonb_array_elements(v_check) x where not (x ->> 'ok')::boolean));
end $$;

-- Rules 33–35: Super admin, fresh step-up, matching version, plan check passes. Scheduled for the
-- next 00:00 WAT; a newer save replaces a scheduled one.
drop function public.save_pricing_rules(jsonb, text);
create function public.save_pricing_rules(p_rules jsonb, p_expected_version integer, p_stepup uuid,
                                          p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_preview jsonb;
  v_current public.pricing_rule_versions;
  v_id uuid;
  v_version integer;
begin
  if not (public.is_staff('super_admin') and public.has_permission('change_prices')) then
    raise exception 'Not allowed: pricing rules' using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext('pricing_rules'));
  select * into v_current from public.pricing_rule_versions where cancelled_at is null
    order by version desc limit 1;
  if v_current.version is distinct from p_expected_version then
    perform public._raise('rules_changed', jsonb_build_object('by',
      (select full_name from public.profiles where id = v_current.changed_by), 'version', v_current.version));
  end if;
  v_preview := public.preview_pricing_rules(p_rules);
  if not (v_preview ->> 'plan_check_ok')::boolean then
    perform public._raise('plan_check_failed', jsonb_build_object('check', v_preview -> 'plan_check'));
  end if;
  if jsonb_array_length(v_preview -> 'changed') = 0 then
    perform public._raise('no_change');
  end if;
  perform public._consume_stepup(p_stepup, 'pricing_rules');
  update public.pricing_rule_versions set cancelled_at = now(), cancelled_by = auth.uid()
    where applied_at is null and cancelled_at is null;
  select coalesce(max(version), 0) + 1 into v_version from public.pricing_rule_versions;
  insert into public.pricing_rule_versions (effective_at, rules, changed_by, approved_by, note, version,
                                            step_up_id, plan_check)
  values ((v_preview ->> 'effective_at')::timestamptz, v_preview -> 'rules', auth.uid(), auth.uid(), p_note,
          v_version, p_stepup, v_preview -> 'plan_check')
  returning id into v_id;
  perform public.write_audit('money', 'pricing_rules.save', 'pricing_rules', v_id::text, 'Version ' || v_version,
    format('Pricing rules scheduled for %s', to_char((v_preview ->> 'effective_at')::timestamptz
      at time zone 'Africa/Lagos', 'DD Mon YYYY, HH24:MI "WAT"')),
    v_preview -> 'old_rules', v_preview -> 'rules', p_note);
  return jsonb_build_object('id', v_id, 'version', v_version, 'effective_at', v_preview ->> 'effective_at');
end $$;

-- Undo before the effective time (rule 35).
create function public.cancel_pricing_rules(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.pricing_rule_versions;
begin
  if not (public.is_staff('super_admin') and public.has_permission('change_prices')) then
    raise exception 'Not allowed: pricing rules' using errcode = 'insufficient_privilege';
  end if;
  update public.pricing_rule_versions set cancelled_at = now(), cancelled_by = auth.uid()
    where id = p_id and applied_at is null and cancelled_at is null and effective_at > now()
    returning * into v;
  if v.id is null then
    perform public._raise('not_scheduled');
  end if;
  perform public.write_audit('money', 'pricing_rules.undo', 'pricing_rules', v.id::text, 'Version ' || v.version,
    'Undid scheduled pricing rules', v.rules, null, null);
end $$;

-- Spread a revision's price over its chapters by page weight, exactly (largest remainder, ties to
-- the earlier chapter); chapters inside the free preview cost 0. Same rule as chapterPrices().
create function public._spread_price(p_rev uuid, p_price integer) returns void
language sql security definer set search_path = '' as $$
  with w as (
    select c.id, c.ord, case when c.ord > r.free_through_ord then c.pages else 0 end as w
    from public.chapters c join public.book_revisions r on r.id = c.revision_id
    where c.revision_id = p_rev
  ), t as (select sum(w) as tot from w),
  f as (
    select w.id, w.ord, w.w, floor(p_price * w.w / t.tot)::int as fl,
           p_price * w.w / t.tot - floor(p_price * w.w / t.tot) as frac
    from w, t where t.tot > 0
  ), ranked as (
    select f.id, f.fl, f.w, row_number() over (order by (f.w > 0) desc, f.frac desc, f.ord) as rk,
           p_price - sum(f.fl) over () as left_over
    from f
  )
  update public.chapters c
    set price_credits = ranked.fl + case when ranked.w > 0 and ranked.rk <= ranked.left_over then 1 else 0 end
  from ranked where c.id = ranked.id
$$;

-- Rule 36: at 00:00 WAT promote due rows and reprice every live revision from its stored pages.
-- Books already unlocked and chapters already paid keep what was paid (entitlements don't move).
create function public.apply_pricing_rules() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v public.pricing_rule_versions;
  v_old jsonb;
  v_count integer := 0;
  b record;
begin
  for v in select * from public.pricing_rule_versions
           where applied_at is null and cancelled_at is null and effective_at <= now()
           order by effective_at for update skip locked
  loop
    select rules into v_old from public.pricing_rule_versions
      where applied_at is not null and cancelled_at is null order by effective_at desc, created_at desc limit 1;
    v_count := 0;
    for b in
      select bk.id as book_id, r.id as rev_id, r.price_credits as before, n.pages, n.price
      from public.books bk join public.book_revisions r on r.id = bk.current_revision_id
      cross join lateral public._repriced(r.pages, coalesce(v_old, v.rules), v.rules) n
      where bk.status = 'live' and r.pages is not null
        and (r.price_credits is distinct from n.price or r.pages is distinct from n.pages)
    loop
      update public.book_revisions set pages = b.pages, price_credits = b.price where id = b.rev_id;
      perform public._spread_price(b.rev_id, b.price);
      if b.before is distinct from b.price then
        insert into public.book_price_history (book_id, revision_id, kind, old_credits, new_credits, reason)
          values (b.book_id, b.rev_id, 'computed', b.before, b.price, 'Pricing rules version ' || v.version);
        v_count := v_count + 1;
      end if;
    end loop;
    update public.pricing_rule_versions set applied_at = now() where id = v.id;
    perform public._audit_as(v.changed_by, 'money', 'pricing_rules.apply', 'pricing_rules', v.id::text,
      'Version ' || v.version, format('Pricing rules in effect, %s book prices moved', v_count),
      v_old, v.rules, null);
  end loop;
  return v_count;
end $$;

-- 00:00 WAT = 23:00 UTC (Lagos has no daylight saving). Runs again at 23:05 in case of a miss.
select cron.schedule('apply_pricing_rules', '0,5 23 * * *', 'select public.apply_pricing_rules()');

-- ─── App configuration (rules 24–30) ────────────────────────────────────────
insert into public.app_config (key, value) values
  ('android_min_version', '"25.4"'),
  ('ios_min_version', '"1.0"'),
  ('android_latest', '"26.1"'),
  ('ios_latest', '"1.4"'),
  ('force_update', 'false'),
  ('maintenance', '{"on": false, "message": "Arpedia is getting a quick tune-up. We''ll be back in about 30 minutes. Your books and credits are safe."}'),
  ('ota', '{"channel": "production", "server": "updates.arpedia.africa", "current": null, "previous": null, "published_at": null, "published_by": null, "reach_pct": null}')
on conflict (key) do nothing;

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  "group" text not null check ("group" in ('community', 'money', 'app')),
  note text,
  enabled boolean not null default true,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  min_app_version text check (min_app_version ~ '^\d+\.\d+$'),
  warning text,
  sort integer not null default 0,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.feature_flags (key, label, "group", note, rollout_percent, min_app_version, warning, sort) values
  ('reading_rooms', 'Reading rooms', 'community', null, 100, null, null, 1),
  ('author_messages', 'Messages to authors', 'community', '5 credits per message', 100, null, null, 2),
  ('paragraph_discussions', 'Paragraph discussions', 'community', null, 100, null, null, 3),
  ('gifts', 'Gifts', 'money', null, 100, null, 'Off leaves unspent credits, nothing is refunded', 4),
  ('tips', 'Tips', 'money', null, 100, null, 'Off leaves unspent credits, nothing is refunded', 5),
  ('web_checkout', 'Web checkout', 'money', null, 100, null, 'Off hides the pay button for web renewals', 6),
  ('offline_downloads', 'Offline downloads', 'app', null, 100, null, null, 7),
  ('onboarding_v2', 'New reader onboarding v2', 'app', 'Shorter flow, email sign-in offered after 30 s', 0, null, null, 8);

create table public.remote_copy (
  key text primary key,
  text text not null check (char_length(text) between 1 and 200),
  required_placeholders text[] not null default '{}',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.remote_copy (key, text, required_placeholders) values
  ('paywall.title', 'Read every book, one simple plan', '{}'),
  ('paywall.subtitle', 'Pay in naira. Cancel any time in Google Play or the App Store.', '{}'),
  ('paywall.yearly_badge', 'Best value', '{}'),
  ('unlock.confirm', 'Unlock this book for {credits} credits? You keep it while your plan is active.', '{{credits}}'),
  ('credits.empty', 'You''re out of credits. Top up or wait for your next plan period.', '{}');

-- Everything s-config shows. Super admin edits all; Operations admin edits copy and reads the rest.
create function public.get_config_screen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Not allowed: manage_settings' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'can_edit', public._perm_level('manage_settings') = 'allow',
    'config', (select jsonb_object_agg(c.key, jsonb_build_object('value', c.value, 'updated_at', c.updated_at,
                 'updated_by', p.full_name))
               from public.app_config c left join public.profiles p on p.id = c.updated_by
               where c.key in ('android_min_version', 'ios_min_version', 'android_latest', 'ios_latest',
                               'force_update', 'maintenance', 'ota')),
    'flags', (select coalesce(jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'group', f."group",
                 'note', f.note, 'enabled', f.enabled, 'rollout_percent', f.rollout_percent,
                 'min_app_version', f.min_app_version, 'warning', f.warning, 'updated_at', f.updated_at,
                 'updated_by', p.full_name) order by f.sort, f.key), '[]')
              from public.feature_flags f left join public.profiles p on p.id = f.updated_by),
    'copy', (select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'text', r.text,
                'required_placeholders', r.required_placeholders, 'updated_at', r.updated_at,
                'updated_by', p.full_name) order by r.key), '[]')
             from public.remote_copy r left join public.profiles p on p.id = r.updated_by));
end $$;

-- Versions, force update and maintenance. Turning force update or maintenance on needs a step-up.
create function public.set_config(p_key text, p_value jsonb, p_stepup uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := public._config(p_key);
begin
  perform public._require_full('manage_settings');
  if p_key in ('android_min_version', 'ios_min_version') then
    if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^\d+\.\d+$' then
      perform public._raise('bad_version');
    end if;
  elsif p_key = 'force_update' then
    if jsonb_typeof(p_value) <> 'boolean' then
      perform public._raise('bad_value');
    end if;
    if (p_value #>> '{}')::boolean and not coalesce((v_before #>> '{}')::boolean, false) then
      perform public._consume_stepup(p_stepup, 'force_update');
    end if;
  elsif p_key = 'maintenance' then
    if jsonb_typeof(p_value -> 'on') <> 'boolean'
       or char_length(trim(coalesce(p_value ->> 'message', ''))) not between 10 and 280 then
      perform public._raise('bad_value');
    end if;
    p_value := jsonb_build_object('on', p_value -> 'on', 'message', trim(p_value ->> 'message'));
    if (p_value ->> 'on')::boolean and not coalesce((v_before ->> 'on')::boolean, false) then
      perform public._consume_stepup(p_stepup, 'maintenance');
    end if;
  else
    perform public._raise('bad_key');
  end if;
  insert into public.app_config (key, value, updated_by) values (p_key, p_value, auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
  perform public.write_audit('settings', 'config.' || p_key, 'app_config', p_key, p_key,
    case p_key
      when 'force_update' then case when (p_value #>> '{}')::boolean then 'Turned on force update' else 'Turned off force update' end
      when 'maintenance' then case when (p_value ->> 'on')::boolean then 'Turned on maintenance mode' else 'Turned off maintenance mode' end
      else 'Changed ' || replace(p_key, '_', ' ') end,
    jsonb_build_object('value', v_before), jsonb_build_object('value', p_value), null);
  return p_value;
end $$;

-- Rule 28: roll back to the previous OTA bundle (engineering's expo-updates job reads the change).
create function public.rollback_ota(p_stepup uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := public._config('ota');
  v_after jsonb;
begin
  perform public._require_full('manage_settings');
  if v_before ->> 'previous' is null then
    perform public._raise('no_previous_bundle');
  end if;
  perform public._consume_stepup(p_stepup, 'ota_rollback');
  v_after := v_before || jsonb_build_object('current', v_before -> 'previous', 'previous', v_before -> 'current',
    'published_at', now(), 'published_by', (select full_name from public.profiles where id = auth.uid()),
    'reach_pct', 0, 'rollback', true);
  update public.app_config set value = v_after, updated_by = auth.uid() where key = 'ota';
  perform public.write_audit('settings', 'config.ota_rollback', 'app_config', 'ota', 'Over-the-air update',
    'Rolled back to the previous bundle', v_before, v_after, null);
  return v_after;
end $$;

-- Rule 27: on/off, rollout and minimum version. Super admin only.
create function public.set_flag(p_key text, p_enabled boolean, p_rollout integer default null,
                                p_min_version text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f public.feature_flags;
  v_after public.feature_flags;
begin
  perform public._require_full('manage_settings');
  select * into f from public.feature_flags where key = p_key for update;
  if not found then
    perform public._raise('bad_key');
  end if;
  if p_rollout is not null and p_rollout not between 0 and 100 then
    perform public._raise('bad_rollout');
  end if;
  if nullif(p_min_version, '') is not null and p_min_version !~ '^\d+\.\d+$' then
    perform public._raise('bad_version');
  end if;
  update public.feature_flags set enabled = coalesce(p_enabled, enabled),
    rollout_percent = coalesce(p_rollout, rollout_percent),
    min_app_version = case when p_min_version is null then min_app_version else nullif(p_min_version, '') end,
    updated_by = auth.uid(), updated_at = now()
  where key = p_key returning * into v_after;
  perform public.write_audit('settings', 'flag.' || case when v_after.enabled is distinct from f.enabled
      then case when v_after.enabled then 'on' else 'off' end else 'change' end,
    'feature_flag', p_key, f.label,
    case when v_after.enabled is distinct from f.enabled
      then f.label || case when v_after.enabled then ' turned on' else ' turned off for everyone' end
      else f.label || ' changed' end,
    jsonb_build_object('enabled', f.enabled, 'rollout_percent', f.rollout_percent, 'min_app_version', f.min_app_version),
    jsonb_build_object('enabled', v_after.enabled, 'rollout_percent', v_after.rollout_percent,
                       'min_app_version', v_after.min_app_version), null);
  return to_jsonb(v_after);
end $$;

-- Rule 29: remote copy keeps its required placeholders. Super admin or Operations admin.
create function public.set_copy(p_key text, p_text text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.remote_copy;
  v_text text := trim(coalesce(p_text, ''));
  v_missing text[];
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Not allowed: manage_settings' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.remote_copy where key = p_key for update;
  if not found then
    perform public._raise('bad_key');
  end if;
  if char_length(v_text) not between 1 and 200 then
    perform public._raise('bad_text');
  end if;
  select coalesce(array_agg(p), '{}') into v_missing from unnest(r.required_placeholders) p
    where strpos(v_text, p) = 0;
  if cardinality(v_missing) > 0 then
    perform public._raise('missing_placeholder', jsonb_build_object('missing', v_missing));
  end if;
  update public.remote_copy set text = v_text, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform public.write_audit('settings', 'copy.edit', 'remote_copy', p_key, p_key, 'Changed ' || p_key,
    jsonb_build_object('text', r.text), jsonb_build_object('text', v_text), null);
  return jsonb_build_object('key', p_key, 'text', v_text);
end $$;

-- The public subset the app reads (via the api Worker, cached 60 s). No secrets. The Worker
-- resolves each flag for the user with _rollout_bucket and the app version.
create function public.get_app_config(p_app_version text default null, p_user uuid default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'android_min_version', public._config('android_min_version'),
    'ios_min_version', public._config('ios_min_version'),
    'force_update', coalesce(public._config('force_update'), 'false'),
    'maintenance', coalesce(public._config('maintenance'), '{"on": false}'),
    'flags', (select coalesce(jsonb_object_agg(f.key,
                f.enabled
                and (p_user is null and f.rollout_percent = 100
                     or p_user is not null and public._rollout_bucket(p_user, f.key) < f.rollout_percent)
                and (f.min_app_version is null
                     or coalesce(public._version_cmp(p_app_version, f.min_app_version) >= 0, false))), '{}')
              from public.feature_flags f),
    'copy', (select coalesce(jsonb_object_agg(r.key, r.text), '{}') from public.remote_copy r))
$$;

-- ─── Policies and legal pages (rule 38) ─────────────────────────────────────
create table public.policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9-]*$'),
  title text not null,
  subtitle text,
  audience text not null check (audience in ('readers', 'authors', 'everyone')),
  accept_again boolean not null default false,
  always_live boolean not null default false,
  sort integer not null default 0
);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies (id),
  version integer,
  body text not null default '',
  change_summary text,
  accept_again boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  edited_by uuid references public.profiles (id),
  edited_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles (id),
  constraint policy_versions_published check ((status = 'published') = (version is not null and published_at is not null)),
  unique (policy_id, version)
);
create unique index policy_versions_one_draft on public.policy_versions (policy_id) where status = 'draft';

-- A published version can never change or be removed.
create function public._policy_version_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' then
    raise exception 'Published policy versions cannot be changed' using errcode = 'insufficient_privilege';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger policy_versions_immutable before update or delete on public.policy_versions
  for each row execute function public._policy_version_immutable();

create table public.policy_acceptances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  policy_version_id uuid not null references public.policy_versions (id),
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy_version_id)
);

insert into public.policies (slug, title, subtitle, audience, accept_again, always_live, sort) values
  ('terms', 'Terms of service', 'Readers', 'readers', true, false, 1),
  ('privacy', 'Privacy policy', 'NDPA 2023 · readers and authors', 'everyone', true, false, 2),
  ('community-guidelines', 'Community guidelines', null, 'readers', false, false, 3),
  ('copyright', 'Copyright policy', 'How claims and takedowns work', 'everyone', false, false, 4),
  ('author-agreement', 'Author agreement', '₦1.60 per credit spent · authors only', 'authors', true, false, 5),
  ('refunds', 'Refund policy', 'Web checkout; store refunds follow Google and Apple', 'readers', false, false, 6),
  ('delete-account', 'Delete-account page', 'Public link, required by Google Play', 'everyone', false, true, 7);
-- Version 1 of each page. v25's Terms and Privacy text replace these bodies in the flow 17 migration.
insert into public.policy_versions (policy_id, version, body, change_summary, status, published_at)
select id, 1, title || E'\n\nThe full text is published at arpedia.africa/legal/' || slug || '.', 'First version',
       'published', '2026-01-01'
from public.policies;

-- The latest published version of each policy.
create function public._policy_latest(p_policy uuid) returns public.policy_versions
language sql stable security definer set search_path = '' as $$
  select * from public.policy_versions where policy_id = p_policy and status = 'published'
  order by version desc limit 1
$$;

-- s-policies: one row per page with the published version, acceptance rate and draft.
create function public.list_policies() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Not allowed: manage_settings' using errcode = 'insufficient_privilege';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'title', p.title, 'subtitle', p.subtitle, 'audience', p.audience,
      'accept_again', p.accept_again, 'always_live', p.always_live,
      'published', jsonb_build_object('id', l.id, 'version', l.version, 'published_at', l.published_at,
                                      'accept_again', l.accept_again),
      'audience_count', aud.n,
      'accepted', case when l.accept_again then
        (select count(*) from public.policy_acceptances a where a.policy_version_id = l.id) end,
      'draft', (select jsonb_build_object('id', d.id, 'body', d.body, 'change_summary', d.change_summary,
                  'edited_at', d.edited_at, 'edited_by', (select full_name from public.profiles where id = d.edited_by))
                from public.policy_versions d where d.policy_id = p.id and d.status = 'draft'))
      order by p.sort), '[]')
    from public.policies p
    cross join lateral public._policy_latest(p.id) l
    cross join lateral (select count(*) as n from public.profiles pr
                        where p.audience = 'everyone' or p.audience = 'readers'
                           or (p.audience = 'authors' and exists (select 1 from public.books b where b.author_id = pr.id))) aud
  );
end $$;

-- Start or save the draft of a policy (Super admin).
create function public.save_policy_draft(p_policy uuid, p_body text, p_change_summary text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public._require_full('manage_settings');
  if not exists (select 1 from public.policies where id = p_policy) then
    perform public._raise('bad_policy');
  end if;
  insert into public.policy_versions (policy_id, body, change_summary, edited_by)
    values (p_policy, coalesce(p_body, ''), nullif(trim(coalesce(p_change_summary, '')), ''), auth.uid())
  on conflict (policy_id) where status = 'draft' do update
    set body = excluded.body, change_summary = excluded.change_summary, edited_by = excluded.edited_by,
        edited_at = now()
  returning id into v_id;
  return v_id;
end $$;

-- Switch "Accept again on change" for a page (applies to its next published version).
create function public.set_policy_accept_again(p_policy uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.policies;
begin
  perform public._require_full('manage_settings');
  update public.policies set accept_again = p_on where id = p_policy returning * into p;
  if p.id is null then
    perform public._raise('bad_policy');
  end if;
  perform public.write_audit('settings', 'policy.accept_again', 'policy', p.slug, p.title,
    case when p_on then 'Accept again on change turned on' else 'Accept again on change turned off' end,
    jsonb_build_object('accept_again', not p_on), jsonb_build_object('accept_again', p_on), null);
end $$;

-- Publish the draft as a new version (step-up, 1–2 sentence summary). The old one is kept.
create function public.publish_policy(p_policy uuid, p_change_summary text, p_accept_again boolean, p_stepup uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.policies;
  d public.policy_versions;
  v_prev public.policy_versions;
  v_summary text := trim(coalesce(p_change_summary, ''));
begin
  perform public._require_full('manage_settings');
  select * into p from public.policies where id = p_policy;
  select * into d from public.policy_versions where policy_id = p_policy and status = 'draft' for update;
  if d.id is null then
    perform public._raise('no_draft');
  end if;
  if char_length(v_summary) not between 10 and 400 then
    perform public._raise('summary_required');
  end if;
  if char_length(trim(d.body)) < 20 then
    perform public._raise('body_required');
  end if;
  perform public._consume_stepup(p_stepup, 'publish_policy');
  v_prev := public._policy_latest(p_policy);
  update public.policy_versions
    set status = 'published', version = coalesce(v_prev.version, 0) + 1, change_summary = v_summary,
        accept_again = coalesce(p_accept_again, p.accept_again), published_at = now(), published_by = auth.uid()
    where id = d.id returning * into d;
  update public.policies set accept_again = d.accept_again where id = p_policy;
  perform public.write_audit('settings', 'policy.publish', 'policy', p.slug, p.title,
    format('%s v%s published', p.title, d.version),
    jsonb_build_object('version', v_prev.version), jsonb_build_object('version', d.version,
      'change_summary', v_summary, 'accept_again', d.accept_again), null);
  return jsonb_build_object('id', d.id, 'version', d.version, 'accept_again', d.accept_again);
end $$;

-- The app: policies the signed-in reader must accept now (full-screen notice on next open).
create function public.get_pending_policies() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'slug', p.slug, 'title', p.title,
           'version', l.version, 'change_summary', l.change_summary) order by p.sort), '[]')
  from public.policies p
  cross join lateral public._policy_latest(p.id) l
  where auth.uid() is not null and l.accept_again and l.version > 1
    and (p.audience <> 'authors' or exists (select 1 from public.books b where b.author_id = auth.uid()))
    and not exists (select 1 from public.policy_acceptances a
                    where a.user_id = auth.uid() and a.policy_version_id = l.id)
$$;

create function public.accept_policy(p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.policy_versions where id = p_version and status = 'published') then
    perform public._raise('bad_policy');
  end if;
  insert into public.policy_acceptances (user_id, policy_version_id) values (auth.uid(), p_version)
  on conflict do nothing;
end $$;

-- ─── Integrations health (rule 39) ──────────────────────────────────────────
create table public.integration_health (
  service text primary key,
  label text not null,
  description text,
  status text not null default 'working' check (status in ('working', 'degraded', 'failing')),
  last_event_at timestamptz,
  last_event_text text,
  error_rate_24h numeric(6, 3),
  error_note text,
  address text,
  key_masked text,
  key_owner text,
  key_rotated_at timestamptz,
  old_key_valid_until timestamptz,
  checked_at timestamptz,
  sort integer not null default 0
);
insert into public.integration_health (service, label, description, address, key_masked, key_owner, sort) values
  ('supabase', 'Supabase', 'Database and sign-in', 'eu-west-2 (London)', 'sb_secret_••••••••', 'the Supabase project settings', 1),
  ('revenuecat', 'RevenueCat', 'Store purchases and renewals, mirrored by webhook', 'https://api.arpedia.africa/hooks/revenuecat', 'sk_••••••••', 'the store purchase hook settings', 2),
  ('google_play', 'Google Play', 'Android subscriptions and top-ups', null, 'play-api@arpedia••••.iam', 'RevenueCat''s Google Play credentials', 3),
  ('app_store', 'App Store Connect', 'iOS subscriptions', null, 'ASC-••••••', 'RevenueCat''s App Store credentials', 4),
  ('flutterwave_checkout', 'Flutterwave checkout', 'Web checkout', 'https://api.arpedia.africa/hooks/flutterwave-pay', 'FLWSECK-••••••••', 'the web checkout settings', 5),
  ('flutterwave_transfers', 'Flutterwave transfers', 'Author payouts', 'https://api.arpedia.africa/hooks/flutterwave-transfer', 'FLWSECK-••••••••', 'the payout settings', 6),
  ('fcm', 'Firebase Cloud Messaging', 'Push notifications', null, 'fcm-••••••••', 'the push settings', 7),
  ('r2', 'Cloudflare R2', 'Book files: EPUB builds, covers, uploads', 'arpedia-books-prod', 'r2_••••••••', 'the book upload service', 8),
  ('expo_updates', 'expo-updates (OTA)', 'Over-the-air app updates', 'https://updates.arpedia.africa', 'code-signing-••••', 'the app build settings', 9),
  ('resend', 'Resend (email)', 'Transactional email from hello@arpedia.africa', null, 're_••••••••', 'the email settings', 10);

create function public.list_integrations() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Not allowed: manage_settings' using errcode = 'insufficient_privilege';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(i) order by i.sort), '[]') from public.integration_health i);
end $$;

-- The checks Worker (cron, every minute) writes one row per service. Never a secret: key_masked
-- is the provider's own hint (prefix and last 4), checked here.
create function public.worker_set_integration_health(p_service text, p_status text, p_last_event_at timestamptz,
  p_last_event_text text, p_error_rate numeric, p_error_note text default null, p_key_masked text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key_masked is not null and p_key_masked !~ '•{4,}' then
    perform public._raise('key_not_masked');
  end if;
  update public.integration_health set status = p_status, last_event_at = coalesce(p_last_event_at, last_event_at),
    last_event_text = coalesce(left(p_last_event_text, 200), last_event_text), error_rate_24h = p_error_rate,
    error_note = left(p_error_note, 200), key_masked = coalesce(p_key_masked, key_masked), checked_at = now()
  where service = p_service;
  if not found then
    perform public._raise('bad_service');
  end if;
end $$;

-- "Check all now": ask the checks Worker to run at once.
create function public.request_integration_check() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('manage_settings') then
    raise exception 'Not allowed: manage_settings' using errcode = 'insufficient_privilege';
  end if;
  insert into public.app_config (key, value, updated_by) values ('integration_check_requested', to_jsonb(now()), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
end $$;

-- Rule 39 + Q6 default: record and audit a rotation; engineering changes the secret itself.
-- The old key keeps working for 24 hours.
create function public.rotate_integration_key(p_service text, p_stepup uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  i public.integration_health;
begin
  perform public._require_full('manage_settings');
  select * into i from public.integration_health where service = p_service for update;
  if not found then
    perform public._raise('bad_service');
  end if;
  perform public._consume_stepup(p_stepup, 'rotate_key');
  update public.integration_health set key_rotated_at = now(), old_key_valid_until = now() + interval '24 hours'
    where service = p_service;
  return public.write_audit('settings', 'integration.rotate_key', 'integration', p_service, i.label,
    'Rotated the ' || i.label || ' key; the old key works for 24 hours',
    jsonb_build_object('key_rotated_at', i.key_rotated_at), jsonb_build_object('key_rotated_at', now()), null);
end $$;

-- ─── My account (rule 40) ───────────────────────────────────────────────────
create table public.staff_alert_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('high_severity_reports', 'failed_payouts', 'copyright_claims',
                                     'applications_waiting', 'system_health')),
  enabled boolean not null default true,
  primary key (user_id, kind)
);

create function public.get_my_account() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  s public.staff_roles;
begin
  select * into s from public.staff_roles where user_id = uid and active;
  if not found then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'name', (select full_name from public.profiles where id = uid),
    'email', (select email from auth.users where id = uid),
    'phone', s.phone, 'role', s.role,
    'mfa_enrolled_at', (select min(f.created_at) from auth.mfa_factors f where f.user_id = uid
                        and f.factor_type = 'totp' and f.status = 'verified'),
    'backup_codes_left', (select count(*) from public.staff_backup_codes b where b.user_id = uid and b.used_at is null),
    'alerts', (select jsonb_object_agg(k, coalesce(a.enabled, true) or k = 'high_severity_reports')
               from unnest(array['high_severity_reports', 'failed_payouts', 'copyright_claims',
                                 'applications_waiting', 'system_health']) k
               left join public.staff_alert_prefs a on a.user_id = uid and a.kind = k),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'created_at', x.created_at,
                   'refreshed_at', coalesce(x.refreshed_at, x.updated_at), 'user_agent', x.user_agent,
                   'ip', host(x.ip), 'current', x.id::text = auth.jwt() ->> 'session_id')
                   order by coalesce(x.refreshed_at, x.updated_at) desc nulls last), '[]')
                 from auth.sessions x where x.user_id = uid));
end $$;

create function public.update_my_staff_profile(p_name text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s-]', '', 'g'), '');
begin
  if not exists (select 1 from public.staff_roles where user_id = auth.uid() and active) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 2 and 80 then
    perform public._raise('bad_name');
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{10,15}$' then
    perform public._raise('bad_phone');
  end if;
  update public.profiles set full_name = v_name where id = auth.uid();
  update public.staff_roles set phone = v_phone where user_id = auth.uid();
end $$;

-- High-severity reports always alert (cannot be turned off).
create function public.set_my_alert_pref(p_kind text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.staff_roles where user_id = auth.uid() and active) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_kind = 'high_severity_reports' and not p_enabled then
    perform public._raise('alert_required');
  end if;
  insert into public.staff_alert_prefs (user_id, kind, enabled) values (auth.uid(), p_kind, p_enabled)
  on conflict (user_id, kind) do update set enabled = excluded.enabled;
end $$;

-- Sign out one of your own sessions, or every other one (p_session null).
create function public.sign_out_my_sessions(p_session uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_count integer;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_roles where user_id = auth.uid() and active) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.sessions where user_id = auth.uid()
    and (case when p_session is null then id is distinct from v_current else id = p_session end);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ─── Audit log (rules 21–23) ────────────────────────────────────────────────
-- Filtered, paged list. Visibility is the audit_log policy (security invoker), so Finance sees
-- money entries only and roles without view_audit see nothing.
create function public.list_audit(p_actor uuid default null, p_area text default null, p_action text default null,
  p_from timestamptz default null, p_to timestamptz default null, p_q text default null,
  p_page integer default 1, p_per integer default 25)
returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_per integer := least(greatest(coalesce(p_per, 25), 10), 50);
  v_from timestamptz := coalesce(p_from, now() - interval '7 days');
  v_q text := nullif(trim(coalesce(p_q, '')), '');
begin
  if not public.has_permission('view_audit') then
    raise exception 'Not allowed: view_audit' using errcode = 'insufficient_privilege';
  end if;
  return (
    with m as (
      select a.* from public.audit_log a
      where a.at >= v_from and (p_to is null or a.at < p_to)
        and (p_actor is null or a.actor_id = p_actor)
        and (p_area is null or a.area = p_area)
        and (p_action is null or a.action like p_action || '%')
        and (v_q is null or a.summary ilike '%' || v_q || '%' or a.object_label ilike '%' || v_q || '%'
             or a.action ilike '%' || v_q || '%' or a.actor_name ilike '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from m),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'at', x.at, 'actor_id', x.actor_id,
                 'actor_name', x.actor_name, 'actor_role', x.actor_role, 'area', x.area, 'action', x.action,
                 'object_type', x.object_type, 'object_id', x.object_id, 'object_label', x.object_label,
                 'summary', x.summary, 'ip', host(x.ip)) order by x.at desc, x.id desc)
               from (select * from m order by at desc, id desc
                     limit v_per offset (greatest(coalesce(p_page, 1), 1) - 1) * v_per) x), '[]'),
      'actors', coalesce((select jsonb_agg(distinct jsonb_build_object('id', a.actor_id, 'name', a.actor_name))
                 from public.audit_log a where a.actor_id is not null and a.at >= now() - interval '90 days'), '[]'))
  );
end $$;

-- Mask personal details in before/after unless the viewer may see them (rule 22).
create function public._mask_pii(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' or public.has_permission('edit_readers') then p
    else (select jsonb_object_agg(k, case when k in ('email', 'phone', 'full_name', 'name', 'bank_account',
            'account_number', 'address', 'ip') and jsonb_typeof(v) = 'string' then to_jsonb('••••'::text)
            else public._mask_pii(v) end) from jsonb_each(p) e(k, v))
  end
$$;

create function public.get_audit_entry(p_id bigint) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  a public.audit_log;
begin
  if not public.has_permission('view_audit') then
    raise exception 'Not allowed: view_audit' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.audit_log where id = p_id;
  if a.id is null then
    return null;
  end if;
  return to_jsonb(a) || jsonb_build_object('ip', host(a.ip), 'before', public._mask_pii(a.before),
    'after', public._mask_pii(a.after));
end $$;

-- Exporting the log is itself an audited action.
create function public.note_audit_export(p_filters jsonb, p_rows integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('view_audit') then
    raise exception 'Not allowed: view_audit' using errcode = 'insufficient_privilege';
  end if;
  perform public.write_audit('team', 'audit.export', 'audit_log', null, 'Audit log',
    format('Exported %s audit entries', p_rows), null, p_filters, null);
end $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.staff_stepups enable row level security;
alter table public.approval_requests enable row level security;
alter table public.feature_flags enable row level security;
alter table public.remote_copy enable row level security;
alter table public.policies enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.integration_health enable row level security;
alter table public.staff_alert_prefs enable row level security;

-- Step-ups are never readable by clients. Approvals: the requester, and anyone who may decide.
create policy approval_requests_select on public.approval_requests for select to authenticated
  using (requested_by = (select auth.uid())
         or (select public.is_staff_any('{operations_admin}')) and (select public.staff_mfa_ok()));
-- Flags and copy: read through get_app_config / get_config_screen only.
-- Policies: page list and published versions are public; drafts staff only.
create policy policies_select on public.policies for select to anon, authenticated using (true);
create policy policy_versions_select on public.policy_versions for select to anon, authenticated
  using (status = 'published' or (select public.has_permission('manage_settings')));
create policy policy_acceptances_select on public.policy_acceptances for select to authenticated
  using (user_id = (select auth.uid()));
create policy staff_alert_prefs_select on public.staff_alert_prefs for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.staff_stepups, public.approval_requests, public.feature_flags, public.remote_copy,
  public.policies, public.policy_versions, public.policy_acceptances, public.integration_health,
  public.staff_alert_prefs from anon, authenticated;
grant select on public.approval_requests, public.policies, public.policy_versions, public.policy_acceptances,
  public.staff_alert_prefs to authenticated;
grant select on public.policies, public.policy_versions to anon;

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke execute on function public._perm_level(text), public._require_full(text),
  public._version_cmp(text, text), public._rollout_bucket(uuid, text), public.verify_stepup(text, text),
  public._consume_stepup(uuid, text), public._approval_roles(text, boolean),
  public.request_approval(text, jsonb, text), public.decide_approval(uuid, boolean, text),
  public._repriced(integer, jsonb, jsonb), public.get_pricing_rules(),
  public.save_pricing_rules(jsonb, integer, uuid, text), public.cancel_pricing_rules(uuid),
  public._spread_price(uuid, integer), public.apply_pricing_rules(), public.get_config_screen(),
  public.set_config(text, jsonb, uuid), public.rollback_ota(uuid), public.set_flag(text, boolean, integer, text),
  public.set_copy(text, text), public.get_app_config(text, uuid), public._policy_version_immutable(),
  public._policy_latest(uuid), public.list_policies(), public.save_policy_draft(uuid, text, text),
  public.set_policy_accept_again(uuid, boolean), public.publish_policy(uuid, text, boolean, uuid),
  public.get_pending_policies(), public.accept_policy(uuid), public.list_integrations(),
  public.worker_set_integration_health(text, text, timestamptz, text, numeric, text, text),
  public.request_integration_check(), public.rotate_integration_key(text, uuid), public.get_my_account(),
  public.update_my_staff_profile(text, text), public.set_my_alert_pref(text, boolean),
  public.sign_out_my_sessions(uuid), public.list_audit(uuid, text, text, timestamptz, timestamptz, text, integer, integer),
  public._mask_pii(jsonb), public.get_audit_entry(bigint), public.note_audit_export(jsonb, integer)
  from public, anon, authenticated, service_role;

-- Staff and readers (own JWT; each checks its own permission).
grant execute on function public.verify_stepup(text, text), public.request_approval(text, jsonb, text),
  public.decide_approval(uuid, boolean, text), public.get_pricing_rules(), public.preview_pricing_rules(jsonb),
  public.save_pricing_rules(jsonb, integer, uuid, text), public.cancel_pricing_rules(uuid),
  public.get_config_screen(), public.set_config(text, jsonb, uuid), public.rollback_ota(uuid),
  public.set_flag(text, boolean, integer, text), public.set_copy(text, text), public.list_policies(),
  public.save_policy_draft(uuid, text, text), public.set_policy_accept_again(uuid, boolean),
  public.publish_policy(uuid, text, boolean, uuid), public.get_pending_policies(), public.accept_policy(uuid),
  public.list_integrations(), public.request_integration_check(), public.rotate_integration_key(text, uuid),
  public.get_my_account(), public.update_my_staff_profile(text, text), public.set_my_alert_pref(text, boolean),
  public.sign_out_my_sessions(uuid),
  public.list_audit(uuid, text, text, timestamptz, timestamptz, text, integer, integer),
  public.get_audit_entry(bigint), public.note_audit_export(jsonb, integer),
  -- used inside security invoker list_audit / get_audit_entry
  public._mask_pii(jsonb)
  to authenticated;

-- Workers (service key): app config for the api Worker, health for the checks Worker, the job.
grant execute on function public.get_app_config(text, uuid), public._version_cmp(text, text),
  public._rollout_bucket(uuid, text),
  public.worker_set_integration_health(text, text, timestamptz, text, numeric, text, text),
  public.apply_pricing_rules()
  to service_role;
