-- Flow 17 · Launch (docs/prd/17-launch.md).
-- Store events for products the new app doesn't sell (v25 purchases and restores): recorded once
-- for Finance, never granted. The database part of preflight (launch_check), the first Super admin
-- invite for a fresh project, and the access sweep's fixes.

-- ─── Unmatched store events (rule 4) ────────────────────────────────────────
-- Only these columns: no payload and no personal data beyond the store's app user id.
create table public.unmatched_store_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('revenuecat', 'flutterwave')),
  event_id text not null unique check (char_length(event_id) between 1 and 200),
  product_id text check (char_length(product_id) <= 200),
  app_user_id text check (char_length(app_user_id) <= 200),
  received_at timestamptz not null default now(),
  -- No foreign key, like audit_log.actor_id: the row outlives the staff account.
  resolved_by uuid,
  resolved_at timestamptz,
  note text check (char_length(note) <= 500),
  check ((resolved_at is null) = (resolved_by is null))
);
create index unmatched_store_events_open_idx on public.unmatched_store_events (received_at desc)
  where resolved_at is null;

alter table public.unmatched_store_events enable row level security;
create policy unmatched_store_events_select on public.unmatched_store_events for select to authenticated
  using ((select public.is_staff('finance')));
revoke all on public.unmatched_store_events from public, anon, authenticated, service_role;
grant select on public.unmatched_store_events to authenticated, service_role;

-- The api Worker (service role) records an event once; a replay answers false and changes nothing.
create function public.log_unmatched_store_event(p_provider text, p_event_id text, p_product_id text,
                                                 p_app_user_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('log_unmatched_store_event');
  insert into public.unmatched_store_events (provider, event_id, product_id, app_user_id)
  values (p_provider, p_event_id, left(p_product_id, 200), left(p_app_user_id, 200))
  on conflict (event_id) do nothing;
  return found;
end $$;

-- Finance or a Super admin marks an event handled (refunded or settled outside the app).
create function public.resolve_unmatched_store_event(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.unmatched_store_events;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.is_staff('finance') or not public.staff_mfa_ok() then
    raise exception 'resolve_unmatched_store_event: not allowed' using errcode = 'insufficient_privilege';
  end if;
  if v_note is null or char_length(v_note) > 500 then
    raise exception 'note' using errcode = 'invalid_parameter_value';
  end if;
  update public.unmatched_store_events set resolved_by = auth.uid(), resolved_at = now(), note = v_note
  where id = p_id and resolved_at is null
  returning * into e;
  if not found then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  perform public.write_audit('finance', 'store_event.resolve', 'unmatched_store_event', e.id::text,
    e.product_id, 'Marked a store event handled', null,
    jsonb_build_object('provider', e.provider, 'product_id', e.product_id), v_note);
end $$;

revoke all on function public.log_unmatched_store_event(text, text, text, text),
  public.resolve_unmatched_store_event(bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.log_unmatched_store_event(text, text, text, text) to service_role;
grant execute on function public.resolve_unmatched_store_event(bigint, text) to authenticated;

-- ─── First Super admin (rule 6) ─────────────────────────────────────────────
-- invite_staff needs an inviting Super admin; a fresh project has none. The set-up script (service
-- role) may invite one while no active Super admin exists. Accepting goes through the normal
-- invite page, which makes them turn on two-step sign-in before any page.
create function public.invite_first_super_admin(p_email text, p_name text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  perform public._require_service('invite_first_super_admin');
  if exists (select 1 from public.staff_roles where role = 'super_admin' and active) then
    raise exception 'A Super admin already exists' using errcode = 'unique_violation';
  end if;
  if v_email !~ '^[^@\s]+@arpedia\.africa$' then
    raise exception 'Invites only go to @arpedia.africa addresses' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_name), '') = '' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'name and token' using errcode = 'invalid_parameter_value';
  end if;
  -- Running set-up again replaces the open invite (a fresh link), never adds a second one.
  update public.staff_invites set revoked_at = now()
  where role = 'super_admin' and accepted_at is null and revoked_at is null;
  insert into public.staff_invites (email, full_name, role, invited_by, token_hash)
  values (v_email, trim(p_name), 'super_admin', null, p_token_hash)
  returning id into v_id;
  perform public.write_audit('team', 'staff.invite_first_super_admin', 'staff_invite', v_id::text,
    trim(p_name), 'Invited the first Super admin ' || v_email, null,
    jsonb_build_object('email', v_email, 'role', 'super_admin'), null);
  return v_id;
end $$;
revoke all on function public.invite_first_super_admin(text, text, text) from public, anon, authenticated;
grant execute on function public.invite_first_super_admin(text, text, text) to service_role;

-- ─── launch_check (rule 7, database part of preflight) ──────────────────────
-- One row per check: pass, warn or fail, with a short detail. Service role only.
create function public.launch_check(p_live_target integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  out jsonb := '[]';
  v_n bigint;
  v_list text[];
  v_size bigint;
  -- Scheduled jobs and queues the migrations create (flows 00–16).
  c_jobs text[] := array[
    'apply_pricing_rules', 'sla_watch', 'sanction_expiry', 'purge_snapshots', 'renewal_reminders',
    'expire_ended_subscriptions', 'resume_paused_web', 'credit_daily_snapshot', 'ledger_reconcile',
    'room_lifecycle', 'purge_room_transcripts', 'application_sla', 'draft_cleanup', 'earning_close',
    'author_stats_refresh', 'analytics_rollup_hourly', 'analytics_rollup_nightly', 'reading_reminders',
    'purge_push_log', 'end_banners', 'book_related', 'refresh_rankings', 'refresh_rankings_weekly',
    'rotate_trending', 'purge_discovery', 'publish_due', 'pipeline_sla', 'sent_back_reminder',
    'fast_lane_audit_pick', 'desk_lease_reaper', 'refresh_member_counts', 'purge_deleted_messages'];
  c_queues text[] := array[
    'book_verify', 'book_desk', 'book_notify', 'user_notify', 'payments_out', 'application_checks',
    'author_notify', 'payout_transfer', 'trust_notify', 'push_fanout', 'export_jobs'];
  c_config text[] := array[
    'android_latest', 'android_min_version', 'force_update', 'maintenance', 'ota', 'plans', 'topup_packs',
    'gifting_frozen', 'spend_rate_per_minute', 'avg_book_price_credits', 'tip_presets',
    'author_message_cost_credits', 'author_message_daily_limit', 'author_message_max_chars'];
  c_free_db_bytes constant bigint := 500 * 1024 * 1024;
begin
  perform public._require_service('launch_check');

  -- Migrations applied: the versions, so preflight can compare them with the repo's files.
  select coalesce(array_agg(version order by version), '{}') into v_list from supabase_migrations.schema_migrations;
  out := out || jsonb_build_object('key', 'migrations', 'status', 'pass',
    'detail', cardinality(v_list) || ' applied', 'versions', to_jsonb(v_list));

  select coalesce(array_agg(c.relname order by c.relname), '{}') into v_list
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity;
  out := out || jsonb_build_object('key', 'rls', 'status', case when cardinality(v_list) = 0 then 'pass' else 'fail' end,
    'detail', case when cardinality(v_list) = 0 then 'on for every table' else 'off: ' || array_to_string(v_list, ', ') end);

  select count(*) into v_n from auth.users where email ilike '%@example.com' or email ilike '%@test.local';
  out := out || jsonb_build_object('key', 'seed_users', 'status', case when v_n = 0 then 'pass' else 'fail' end,
    'detail', v_n || ' seed accounts');

  select count(*) into v_n from public.plans where active;
  out := out || jsonb_build_object('key', 'plans', 'status', case when v_n > 0 then 'pass' else 'fail' end,
    'detail', v_n || ' active plans');
  select count(*) into v_n from public.topup_products;
  out := out || jsonb_build_object('key', 'credit_packs', 'status', case when v_n > 0 then 'pass' else 'fail' end,
    'detail', v_n || ' credit packs');
  select count(*) into v_n from public.pricing_rule_versions where cancelled_at is null and effective_at <= now();
  out := out || jsonb_build_object('key', 'pricing_rules', 'status', case when v_n > 0 then 'pass' else 'fail' end,
    'detail', v_n || ' versions in effect');
  select count(*) into v_n from public.genres where visible and merged_into is null;
  out := out || jsonb_build_object('key', 'genres', 'status', case when v_n > 0 then 'pass' else 'fail' end,
    'detail', v_n || ' visible genres');

  select coalesce(array_agg(p.slug order by p.slug), '{}') into v_list from public.policies p
  where not exists (select 1 from public.policy_versions v where v.policy_id = p.id and v.version = 1);
  out := out || jsonb_build_object('key', 'policy_versions', 'status',
    case when cardinality(v_list) = 0 and exists (select 1 from public.policies) then 'pass' else 'fail' end,
    'detail', case when cardinality(v_list) = 0 then 'version 1 of every policy' else 'missing: ' || array_to_string(v_list, ', ') end);

  select coalesce(array_agg(k order by k), '{}') into v_list from unnest(c_config) k
  where not exists (select 1 from public.app_config a where a.key = k);
  out := out || jsonb_build_object('key', 'app_config', 'status', case when cardinality(v_list) = 0 then 'pass' else 'fail' end,
    'detail', case when cardinality(v_list) = 0 then 'every key set' else 'missing: ' || array_to_string(v_list, ', ') end);
  select count(*) into v_n from public.feature_flags;
  out := out || jsonb_build_object('key', 'feature_flags', 'status', case when v_n > 0 then 'pass' else 'fail' end,
    'detail', v_n || ' flags');

  select coalesce(array_agg(j order by j), '{}') into v_list from unnest(c_jobs) j
  where not exists (select 1 from cron.job c where c.jobname = j and c.active);
  out := out || jsonb_build_object('key', 'scheduled_jobs', 'status', case when cardinality(v_list) = 0 then 'pass' else 'fail' end,
    'detail', case when cardinality(v_list) = 0 then cardinality(c_jobs) || ' active' else 'missing or paused: ' || array_to_string(v_list, ', ') end);
  select coalesce(array_agg(distinct j.jobname order by j.jobname), '{}') into v_list
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
  where d.status = 'failed' and d.start_time > now() - interval '24 hours';
  out := out || jsonb_build_object('key', 'scheduled_job_runs', 'status', case when cardinality(v_list) = 0 then 'pass' else 'fail' end,
    'detail', case when cardinality(v_list) = 0 then 'no failures in 24 hours' else 'failed in 24 hours: ' || array_to_string(v_list, ', ') end);

  select coalesce(array_agg(q order by q), '{}') into v_list from unnest(c_queues) q
  where not exists (select 1 from pgmq.meta m where m.queue_name = q);
  out := out || jsonb_build_object('key', 'queues', 'status', case when cardinality(v_list) = 0 then 'pass' else 'fail' end,
    'detail', case when cardinality(v_list) = 0 then cardinality(c_queues) || ' queues' else 'missing: ' || array_to_string(v_list, ', ') end);

  select count(*) into v_n from public.staff_roles s
  where s.role = 'super_admin' and s.active
    and exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.status = 'verified');
  -- warn while one is on the way: invited, or signed up but two-step not on yet.
  out := out || jsonb_build_object('key', 'super_admin', 'status',
    case when v_n > 0 then 'pass'
         when exists (select 1 from public.staff_roles s where s.role = 'super_admin' and s.active) then 'warn'
         when exists (select 1 from public.staff_invites i where i.role = 'super_admin' and i.accepted_at is null
                      and i.revoked_at is null and i.expires_at > now()) then 'warn' else 'fail' end,
    'detail', case when v_n > 0 then v_n || ' with two-step on'
                   when exists (select 1 from public.staff_roles s where s.role = 'super_admin' and s.active)
                     then 'signed up; two-step not on yet'
                   else 'none with two-step on yet' end);

  -- Launch content (rule 9, Q3).
  select count(*) into v_n from public.books where status = 'live';
  out := out || jsonb_build_object('key', 'live_books', 'status', case when v_n >= p_live_target then 'pass' else 'warn' end,
    'detail', v_n || ' live of ' || p_live_target);
  select coalesce(array_agg(g.name order by g.position), '{}') into v_list from public.genre_book_counts g
  where g.visible and g.book_count = 0;
  out := out || jsonb_build_object('key', 'empty_genres', 'status', case when cardinality(v_list) = 0 then 'pass' else 'warn' end,
    'detail', case when cardinality(v_list) = 0 then 'every genre has a live book' else 'empty: ' || array_to_string(v_list, ', ') end);
  select coalesce(array_agg(h.title order by h.position), '{}') into v_list from public.home_sections h
  where h.visible and h.kind = 'curated'
    and not exists (select 1 from public.shelf_items s join public.books b on b.id = s.item_id
                    where s.section_id = h.id and not s.excluded and b.status = 'live')
    and not (h.key = 'authors' and exists (select 1 from public.shelf_items s where s.section_id = h.id and not s.excluded));
  if not exists (select 1 from public.books where status = 'live') then
    select coalesce(array_agg(h.title order by h.position), '{}') into v_list from public.home_sections h where h.visible;
  end if;
  out := out || jsonb_build_object('key', 'empty_home_rails', 'status', case when cardinality(v_list) = 0 then 'pass' else 'warn' end,
    'detail', case when cardinality(v_list) = 0 then 'every rail has books' else 'empty: ' || array_to_string(v_list, ', ') end);

  -- Free plan (Q5): size against the 500 MB limit.
  v_size := pg_database_size(current_database());
  out := out || jsonb_build_object('key', 'database_size', 'status',
    case when v_size < c_free_db_bytes * 0.8 then 'pass' when v_size < c_free_db_bytes then 'warn' else 'fail' end,
    'detail', round(v_size / 1048576.0) || ' MB of 500 MB');

  select count(*) into v_n from public.unmatched_store_events where resolved_at is null;
  out := out || jsonb_build_object('key', 'unmatched_store_events', 'status', case when v_n = 0 then 'pass' else 'warn' end,
    'detail', v_n || ' open for Finance');

  return out;
end $$;
revoke all on function public.launch_check(integer) from public, anon, authenticated;
grant execute on function public.launch_check(integer) to service_role;

-- ─── Access sweep fixes (rule 12) ───────────────────────────────────────────
-- Supabase's default privileges gave anon and authenticated USAGE and UPDATE on every sequence,
-- so a client could setval() credit_ledger_id_seq (or the claim, report and ticket number
-- sequences) back and make the next insert collide. No client inserts into a table that uses a
-- sequence; the SECURITY DEFINER functions that do run as their owner.
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
