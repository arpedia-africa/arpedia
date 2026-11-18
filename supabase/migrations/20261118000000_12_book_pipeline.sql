-- Flow 12 · Book pipeline: revision stages, flags and readiness, sealing, publishing, fast lane,
-- paragraph anchors, staff desk, queues and cron jobs (docs/prd/12-book-pipeline.md).
--
-- Who calls what:
--   * The app and admin call the author/staff RPCs with the user's own JWT.
--   * Workers call the service-role RPCs. When a Worker acts for a staff member it passes that
--     person as p_actor (taken from the verified JWT), so audit_log records who did it.
--   * pg_cron calls the job functions as postgres.
-- Clients never write status, prices, readiness, flags, chapters or keys.

create extension if not exists pgmq;
create extension if not exists pg_cron;

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.source_type as enum ('docx', 'epub', 'pdf');
create type public.revision_origin as enum ('author', 'staff', 'desk');
create type public.draft_step as enum ('upload', 'converting', 'checking', 'chapters', 'preview');
create type public.flag_status as enum ('open', 'fixed', 'dismissed');
create type public.flag_source as enum ('worker', 'desk', 'staff');
create type public.send_back_source as enum ('fixer', 'quick_review', 'desk_auto', 'system');
create type public.anchor_method as enum ('exact', 'fuzzy', 'nearest');
create type public.fast_lane_result as enum ('pending', 'ok', 'problem');
create type public.unpublish_reason as enum ('author_request', 'policy_violation', 'quality');

-- ─── books / book_revisions: pipeline columns ───────────────────────────────
alter table public.books
  add column unpublish_reason public.unpublish_reason,
  add column unpublished_at timestamptz,
  -- Set when a book was unpublished with "Remove access": the key Worker stops releasing keys.
  add column access_removed_at timestamptz;

alter table public.book_revisions
  add column draft_step public.draft_step default 'upload',
  add column source_type public.source_type,
  add column source_key text,
  add column converted_key text,
  add column cover_key text,
  add column source_sha256 text,
  add column converted_sha256 text,
  add column cover_sha256 text,
  add column file_bytes bigint check (file_bytes >= 0),
  add column uploaded_by uuid references public.profiles (id),
  add column created_via public.revision_origin not null default 'author',
  -- The live revision this one updates (null for a first edition).
  add column base_revision_id uuid references public.book_revisions (id),
  -- Details as submitted: title, subtitle, description, genres, content_notes, age, language.
  add column meta jsonb not null default '{}',
  add column preview_cut_para_id text,
  add column preview_cut_chapter_uid uuid,
  -- Highest chapter ord that lies entirely inside the free preview (-1: none). Those chapters cost 0.
  add column free_through_ord integer not null default -1,
  add column readiness integer not null default 0 check (readiness between 0 and 100),
  add column fast_lane boolean not null default false,
  -- Who approved it (null for the fast lane). Scheduled: who scheduled it.
  add column published_by uuid references public.profiles (id),
  -- Bumped by every upload, submit and reseal. Worker results for an older generation are ignored.
  add column generation integer not null default 0,
  add column sealed_generation integer,
  add column artifact_prefix text,
  add column manifest_key text,
  -- Working-copy version (work/{rev}/v{n}/). Every staff fix and undo writes a new one.
  add column work_version integer not null default 0,
  add column sealed_work_version integer,
  add column steps jsonb not null default '{}',
  add column assigned_to uuid references public.profiles (id),
  add column last_activity_at timestamptz,
  add column review_opened_at timestamptz,
  add column chapters_confirmed_at timestamptz,
  add column routed_at timestamptz,
  add column due_at timestamptz,
  add column late_alerted_at timestamptz,
  add column desk_claimed_by uuid references public.profiles (id),
  add column desk_lease_until timestamptz,
  add column desk_reason text,
  add column sent_back_note text,
  add column status_reason text,
  add column schedule_at timestamptz,
  add column notify_followers boolean not null default true,
  add column anchors_moved jsonb;

create unique index book_revisions_one_live_idx on public.book_revisions (book_id) where status = 'live';
create index book_revisions_status_idx on public.book_revisions (status, due_at);
create index book_revisions_schedule_idx on public.book_revisions (schedule_at) where status = 'scheduled';

-- ─── pipeline_config ────────────────────────────────────────────────────────
-- Check weights and thresholds, edited in Settings (flow 16). A missing key uses the default.
create table public.pipeline_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger pipeline_config_updated_at before update on public.pipeline_config
  for each row execute function public.set_updated_at();

create function public._pipeline_defaults() returns jsonb
language sql immutable set search_path = '' as $$
  select '{
    "checks": {
      "file_check_error":         {"weight": 0,  "blocking": true},
      "chapter_detection_failed": {"weight": 0,  "blocking": true},
      "plagiarism_high":          {"weight": 0,  "blocking": true},
      "plagiarism_medium":        {"weight": 15, "blocking": false},
      "policy_hit":               {"weight": 0,  "blocking": true},
      "policy_borderline":        {"weight": 10, "blocking": false},
      "too_short":                {"weight": 0,  "blocking": true},
      "image_too_large":          {"weight": 5,  "blocking": false, "cap": 15},
      "cover_too_small":          {"weight": 8,  "blocking": false},
      "cover_aspect":             {"weight": 5,  "blocking": false},
      "chapter_title":            {"weight": 4,  "blocking": false, "cap": 12},
      "repeated_text":            {"weight": 10, "blocking": false},
      "copyright_missing":        {"weight": 6,  "blocking": false},
      "toc_mismatch":             {"weight": 8,  "blocking": false},
      "pdf_source":               {"weight": 10, "blocking": false},
      "low_structure_confidence": {"weight": 10, "blocking": false}
    },
    "thresholds": {
      "ready_score": 90,
      "fast_lane_changed_pct": 2,
      "needs_fixes_days": 2,
      "review_days": 3,
      "desk_days": 2,
      "assign_lapse_hours": 24,
      "desk_lease_minutes": 120,
      "remind_after_days": 7,
      "new_arrival_days": 30,
      "audit_share": 0.1,
      "audit_min": 3
    }
  }'::jsonb
$$;

-- Effective setting: defaults overlaid by pipeline_config rows ("checks", "thresholds").
create function public._pipeline_setting(p_section text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(public._pipeline_defaults() -> p_section, '{}')
         || coalesce((select value from public.pipeline_config where key = p_section), '{}')
$$;

create function public._threshold(p_key text) returns numeric
language sql stable security definer set search_path = '' as $$
  select (public._pipeline_setting('thresholds') ->> p_key)::numeric
$$;

-- ─── Pipeline tables ────────────────────────────────────────────────────────
-- Wrapped chapter keys (chapter_uid null = the revision's preview key K_free). Service role only.
create table public.chapter_keys (
  id bigint generated always as identity primary key,
  revision_id uuid not null references public.book_revisions (id) on delete cascade,
  chapter_uid uuid,
  wrapped_key bytea not null,
  key_version integer not null default 1,
  generation integer not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index chapter_keys_active_idx on public.chapter_keys
  (revision_id, coalesce(chapter_uid, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

-- One row per paragraph of a sealed revision. `ord` is the paragraph's position in the whole book.
create table public.paragraph_anchors (
  revision_id uuid not null references public.book_revisions (id) on delete cascade,
  para_id text not null,
  chapter_uid uuid not null,
  ord integer not null,
  fingerprint text not null,
  words integer not null default 0,
  words_before integer not null default 0,
  primary key (revision_id, para_id)
);
create index paragraph_anchors_fp_idx on public.paragraph_anchors (revision_id, fingerprint);
create index paragraph_anchors_ord_idx on public.paragraph_anchors (revision_id, ord);

create table public.anchor_migrations (
  base_revision_id uuid not null references public.book_revisions (id) on delete cascade,
  new_revision_id uuid not null references public.book_revisions (id) on delete cascade,
  old_para_id text not null,
  new_para_id text,
  nearest_para_id text,
  method public.anchor_method not null,
  primary key (base_revision_id, new_revision_id, old_para_id)
);

create table public.book_flags (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.book_revisions (id) on delete cascade,
  check_key text not null,
  severity text not null default 'warning' check (severity in ('blocking', 'warning')),
  weight integer not null default 0 check (weight >= 0),
  blocking boolean not null default false,
  message text not null,
  suggestion text,
  location jsonb not null default '{}',
  auto_fixable boolean not null default false,
  fix_op jsonb,
  source public.flag_source not null default 'worker',
  status public.flag_status not null default 'open',
  fixed_by uuid references public.profiles (id),
  dismiss_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index book_flags_revision_idx on public.book_flags (revision_id, status);
create trigger book_flags_updated_at before update on public.book_flags
  for each row execute function public.set_updated_at();

create table public.book_fixes (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.book_revisions (id) on delete cascade,
  flag_id uuid references public.book_flags (id) on delete set null,
  op jsonb not null,
  inverse jsonb not null,
  work_version integer not null,
  staff_id uuid references public.profiles (id),
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index book_fixes_revision_idx on public.book_fixes (revision_id, created_at desc);

create table public.send_backs (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.book_revisions (id) on delete cascade,
  issues jsonb not null default '[]' check (jsonb_typeof(issues) = 'array'),
  note text,
  sent_by uuid references public.profiles (id),
  source public.send_back_source not null,
  sent_at timestamptz not null default now(),
  reminded_at timestamptz
);
create index send_backs_revision_idx on public.send_backs (revision_id, sent_at desc);

create table public.revision_diffs (
  revision_id uuid primary key references public.book_revisions (id) on delete cascade,
  base_revision_id uuid not null references public.book_revisions (id),
  inserted_words integer not null default 0 check (inserted_words >= 0),
  deleted_words integer not null default 0 check (deleted_words >= 0),
  changed_pct numeric(7, 3) not null default 0,
  chapters_added integer not null default 0,
  chapters_removed integer not null default 0,
  -- chapter_uids of the new revision whose text changed, and of chapters it adds (Revisions "Change").
  changed_chapter_uids text[] not null default '{}',
  added_chapter_uids text[] not null default '{}',
  cover_changed boolean not null default false,
  metadata_changed boolean not null default false,
  author_in_good_standing boolean not null default true,
  fast_lane_eligible boolean not null default false,
  reasons text[] not null default '{}',
  diff_key text,
  created_at timestamptz not null default now()
);

create table public.fast_lane_audits (
  revision_id uuid primary key references public.book_revisions (id) on delete cascade,
  status public.fast_lane_result not null default 'pending',
  audited_by uuid references public.profiles (id),
  note text,
  picked_at timestamptz not null default now(),
  audited_at timestamptz
);

-- ─── Queues ─────────────────────────────────────────────────────────────────
-- book_verify: Worker stages (verify, rescore, seal). book_desk: jobs for the staff desk.
-- book_notify: outbox of author, follower and staff notifications; flow 15 delivers them.
select pgmq.create('book_verify');
select pgmq.create('book_desk');
select pgmq.create('book_notify');

-- ─── Helpers ────────────────────────────────────────────────────────────────
create function public._is_service() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
$$;

create function public._has_staff_role(p_user uuid, p_roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles s
    where s.user_id = p_user and s.active and (s.role = any (p_roles) or s.role = 'super_admin')
  )
$$;

-- Who is acting. A signed-in caller is themselves; the service role acts for p_actor (or for the
-- system when p_actor is null and p_allow_system). With p_roles, the actor must hold one of them.
create function public._actor(p_actor uuid, p_roles public.staff_role[], p_fn text,
                              p_allow_system boolean default false) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    if not public._is_service() then
      raise exception '%: not allowed', p_fn using errcode = 'insufficient_privilege';
    end if;
    if p_actor is null then
      if p_allow_system then return null; end if;
      raise exception '%: actor required', p_fn using errcode = 'insufficient_privilege';
    end if;
    v_uid := p_actor;
  end if;
  if p_roles is not null and not public._has_staff_role(v_uid, p_roles) then
    raise exception '%: staff only', p_fn using errcode = 'insufficient_privilege';
  end if;
  return v_uid;
end $$;

create function public._require_service(p_fn text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public._is_service() then
    raise exception '%: service role only', p_fn using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Audit row for an actor (null = system). write_audit() keys on auth.uid(); this one serves the
-- Worker and cron paths, where the actor comes from the verified JWT or there is none.
create function public._audit(p_actor uuid, p_area text, p_action text, p_object_type text,
                              p_object_id text, p_object_label text default null,
                              p_summary text default null, p_before jsonb default null,
                              p_after jsonb default null, p_reason text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_name, actor_role, area, action, object_type, object_id,
                                object_label, summary, before, after, reason)
  select p_actor, p.full_name, s.role, p_area, p_action, p_object_type, p_object_id,
         p_object_label, p_summary, p_before, p_after, p_reason
  from (select 1) one
  left join public.profiles p on p.id = p_actor
  left join public.staff_roles s on s.user_id = p_actor
$$;

create function public._notify(p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  select pgmq.send('book_notify', jsonb_build_object('kind', p_kind) || p_payload);
$$;

create function public._lock_revision(p_rev uuid) returns public.book_revisions
language plpgsql security definer set search_path = '' as $$
declare
  v public.book_revisions;
begin
  -- Lock the book first, always, so publish and revision writes never deadlock.
  perform 1 from public.books b where b.id = (select book_id from public.book_revisions where id = p_rev)
    for update;
  select * into v from public.book_revisions where id = p_rev for update;
  if not found then
    raise exception 'revision not found' using errcode = 'no_data_found';
  end if;
  return v;
end $$;

create function public.has_blocking_flag(p_rev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.book_flags where revision_id = p_rev and status = 'open' and blocking)
$$;

-- Readiness (rule 25): 100 minus the open flags' weights, each check capped as configured.
create function public.revision_score(p_rev uuid) returns integer
language sql stable security definer set search_path = '' as $$
  with per_check as (
    select f.check_key, sum(f.weight) as w,
           (public._pipeline_setting('checks') -> f.check_key ->> 'cap')::int as cap
    from public.book_flags f
    where f.revision_id = p_rev and f.status = 'open'
    group by f.check_key
  )
  select greatest(0, 100 - coalesce(sum(case when cap is null then w else least(w, cap) end), 0))::int
  from per_check
$$;

create function public._rescore(p_rev uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_score int := public.revision_score(p_rev);
begin
  update public.book_revisions set readiness = v_score where id = p_rev;
  return v_score;
end $$;

-- Insert flags from a Worker/desk payload. Weight and blocking come from config, never the payload.
create function public._insert_flags(p_rev uuid, p_flags jsonb, p_source public.flag_source) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_checks jsonb := public._pipeline_setting('checks');
  v_n int;
begin
  insert into public.book_flags (revision_id, check_key, severity, weight, blocking, message, suggestion,
                                 location, auto_fixable, fix_op, source, created_at)
  select p_rev, f.check_key,
         case when coalesce((v_checks -> f.check_key ->> 'blocking')::boolean, false) then 'blocking' else 'warning' end,
         coalesce((v_checks -> f.check_key ->> 'weight')::int, 0),
         coalesce((v_checks -> f.check_key ->> 'blocking')::boolean, false),
         f.message, f.suggestion, coalesce(f.location, '{}'), coalesce(f.auto_fixable, false), f.fix_op, p_source,
         -- keep the order the checks reported them in (screens list flags by created_at)
         now() + e.ord * interval '1 microsecond'
  from jsonb_array_elements(coalesce(p_flags, '[]')) with ordinality as e(v, ord)
  cross join lateral jsonb_to_record(e.v) as f(check_key text, message text, suggestion text,
                                               location jsonb, auto_fixable boolean, fix_op jsonb)
  -- A flag staff dismissed stays dismissed when the same issue is found again.
  where not exists (
    select 1 from public.book_flags d
    where d.revision_id = p_rev and d.status = 'dismissed' and d.check_key = f.check_key
      and d.location = coalesce(f.location, '{}')
  );
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function public._replace_chapters(p_rev uuid, p_chapters jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_chapters is null or jsonb_typeof(p_chapters) <> 'array' or jsonb_array_length(p_chapters) = 0 then
    raise exception 'chapters required' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.chapters where revision_id = p_rev;
  insert into public.chapters (revision_id, chapter_uid, ord, kind, parent_ord, title, words, words_before,
                               pages, price_credits)
  select p_rev, coalesce(c.chapter_uid, gen_random_uuid()), c.ord, coalesce(c.kind, 'chapter'), c.parent_ord,
         c.title, c.words, c.words_before, c.pages, coalesce(c.price_credits, 0)
  from jsonb_to_recordset(p_chapters) as c(chapter_uid uuid, ord int, kind public.chapter_kind, parent_ord int,
                                           title text, words int, words_before int, pages numeric,
                                           price_credits int);
end $$;

-- Totals and preview from a Worker result (verify, confirm).
create function public._apply_counts(p_rev uuid, p_result jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.book_revisions set
    words = (p_result ->> 'words')::int,
    pages = (p_result ->> 'pages')::int,
    price_credits = (p_result ->> 'price_credits')::int,
    preview_percent = (p_result ->> 'preview_percent')::numeric,
    preview_cut_para_id = p_result ->> 'preview_cut_para_id',
    preview_cut_chapter_uid = (p_result ->> 'preview_cut_chapter_uid')::uuid,
    free_through_ord = coalesce((p_result ->> 'free_through_ord')::int, -1)
  where id = p_rev
$$;

create function public._step(p_rev uuid, p_step text) returns void
language sql security definer set search_path = '' as $$
  update public.book_revisions set steps = steps || jsonb_build_object(p_step, now()) where id = p_rev
$$;

-- Chapter prices hold the rule-14 invariants: whole numbers ≥ 0, chapters entirely inside the
-- preview cost 0, and the total equals the book price (or 0 when no chapter is chargeable).
create function public._chapter_prices_ok(p_rev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(bool_and(c.price_credits >= 0), false)
     and coalesce(bool_and(c.price_credits = 0 or c.ord > r.free_through_ord), false)
     and sum(c.price_credits) = case when max(c.ord) <= r.free_through_ord then 0 else r.price_credits end
  from public.chapters c
  join public.book_revisions r on r.id = c.revision_id
  where c.revision_id = p_rev
  group by r.free_through_ord, r.price_credits
$$;

create function public._set_chapter_prices(p_rev uuid, p_prices jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_given int;
  v_distinct int;
  v_known int;
begin
  if p_prices is null or jsonb_typeof(p_prices) <> 'array' then
    raise exception 'set_chapter_prices: prices must be an array' using errcode = 'invalid_parameter_value';
  end if;
  select count(*), count(distinct p.chapter_uid), count(c.id) into v_given, v_distinct, v_known
  from jsonb_to_recordset(p_prices) as p(chapter_uid uuid, price_credits int)
  left join public.chapters c on c.revision_id = p_rev and c.chapter_uid = p.chapter_uid;
  if v_given <> v_known or v_given <> v_distinct
     or v_given <> (select count(*) from public.chapters where revision_id = p_rev) then
    raise exception 'set_chapter_prices: one price per chapter of the revision' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_prices) as p(chapter_uid uuid, price_credits int)
             where p.price_credits is null or p.price_credits < 0) then
    raise exception 'set_chapter_prices: prices must be whole numbers ≥ 0' using errcode = 'check_violation';
  end if;
  update public.chapters c set price_credits = p.price_credits
  from jsonb_to_recordset(p_prices) as p(chapter_uid uuid, price_credits int)
  where c.revision_id = p_rev and c.chapter_uid = p.chapter_uid;
  if not coalesce(public._chapter_prices_ok(p_rev), false) then
    raise exception 'set_chapter_prices: prices must be 0 inside the preview and sum to the book price'
      using errcode = 'check_violation';
  end if;
end $$;

-- Flow 14 replaces this body once upheld reports and copyright claims exist.
create function public.author_in_good_standing(p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_author is not null
$$;

create function public._send_back(p_rev uuid, p_actor uuid, p_source public.send_back_source,
                                  p_issues jsonb, p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_book uuid;
begin
  update public.book_revisions
     set status = 'sent_back', sent_back_note = p_note, assigned_to = null, due_at = null,
         desk_claimed_by = null, desk_lease_until = null
   where id = p_rev
  returning book_id into v_book;
  insert into public.send_backs (revision_id, issues, note, sent_by, source)
  values (p_rev, coalesce(p_issues, '[]'), p_note, p_actor, p_source)
  returning id into v_id;
  perform public._notify('sent_back', jsonb_build_object(
    'revision_id', p_rev, 'book_id', v_book, 'send_back_id', v_id,
    'author_id', (select author_id from public.books where id = v_book)));
  return v_id;
end $$;

-- Route a sealed, submitted revision (rule 26).
create function public._route(p_rev uuid) returns public.revision_status
language plpgsql security definer set search_path = '' as $$
declare
  v_ready boolean;
  v_status public.revision_status;
begin
  v_ready := public._rescore(p_rev) >= public._threshold('ready_score') and not public.has_blocking_flag(p_rev);
  v_status := case when v_ready then 'ready_for_review' else 'needs_fixes' end;
  update public.book_revisions set
    status = v_status,
    routed_at = now(),
    due_at = case when v_ready
                  then coalesce(submitted_at, now()) + make_interval(days => public._threshold('review_days')::int)
                  else now() + make_interval(days => public._threshold('needs_fixes_days')::int) end
  where id = p_rev;
  perform public._step(p_rev, 'scored');
  return v_status;
end $$;

-- ─── Anchors ────────────────────────────────────────────────────────────────
-- Re-point highlights and passage comments whose paragraph is gone from p_new (rule 46): to the
-- recorded nearest matched paragraph, else the closest earlier paragraph of p_base that p_new still
-- has, else p_new's first paragraph. Works in both directions, so a revert re-points too.
-- annotations / passage_comments belong to flows 04 and 06; until they exist nothing moves.
create function public.migrate_anchors(p_base uuid, p_new uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_book uuid := (select book_id from public.book_revisions where id = p_new);
  v_hl int := 0;
  v_hl2 int := 0;
  v_pc int := 0;
begin
  create temp table if not exists _anchor_map (old_id text primary key, new_id text not null) on commit drop;
  delete from _anchor_map;

  insert into _anchor_map (old_id, new_id)
  select b.para_id,
         coalesce(
           (select m.nearest_para_id from public.anchor_migrations m
             where m.base_revision_id = p_base and m.new_revision_id = p_new and m.old_para_id = b.para_id
               and exists (select 1 from public.paragraph_anchors n
                            where n.revision_id = p_new and n.para_id = m.nearest_para_id)),
           (select b2.para_id from public.paragraph_anchors b2
             join public.paragraph_anchors n2 on n2.revision_id = p_new and n2.para_id = b2.para_id
             where b2.revision_id = p_base and b2.ord < b.ord
             order by b2.ord desc limit 1),
           (select n3.para_id from public.paragraph_anchors n3 where n3.revision_id = p_new order by n3.ord limit 1))
  from public.paragraph_anchors b
  where b.revision_id = p_base
    and not exists (select 1 from public.paragraph_anchors n where n.revision_id = p_new and n.para_id = b.para_id)
    and exists (select 1 from public.paragraph_anchors n where n.revision_id = p_new);

  insert into public.anchor_migrations (base_revision_id, new_revision_id, old_para_id, new_para_id,
                                        nearest_para_id, method)
  select p_base, p_new, old_id, null, new_id, 'nearest' from _anchor_map
  on conflict do nothing;

  if to_regclass('public.annotations') is not null then
    execute 'update public.annotations a set start_para_id = m.new_id, moved = true
               from _anchor_map m where a.book_id = $1 and a.start_para_id = m.old_id' using v_book;
    get diagnostics v_hl = row_count;
    execute 'update public.annotations a set end_para_id = m.new_id, moved = true
               from _anchor_map m where a.book_id = $1 and a.end_para_id = m.old_id' using v_book;
    get diagnostics v_hl2 = row_count;
  end if;
  if to_regclass('public.passage_comments') is not null then
    execute 'update public.passage_comments c set para_id = m.new_id
               from _anchor_map m where c.book_id = $1 and c.para_id = m.old_id' using v_book;
    get diagnostics v_pc = row_count;
  end if;

  -- A highlight whose start and end both moved is counted once per update statement it hit.
  return jsonb_build_object('highlights', greatest(v_hl, v_hl2), 'comments', v_pc,
                            'paragraphs', (select count(*) from _anchor_map));
end $$;

-- ─── Publishing core ────────────────────────────────────────────────────────
-- Make p_rev the live revision in one transaction (rule 38). Callers have checked the guards.
create function public._publish_now(p_rev uuid, p_actor uuid, p_notify boolean, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions := public._lock_revision(p_rev);
  v_book public.books;
  v_prev uuid;
  v_first boolean;
  v_moved jsonb;
begin
  select * into v_book from public.books where id = v_rev.book_id;
  v_prev := v_book.current_revision_id;
  v_first := not exists (select 1 from public.book_revisions
                         where book_id = v_rev.book_id and id <> p_rev and published_at is not null);

  if v_prev is not null and v_prev <> p_rev then
    update public.book_revisions set status = 'superseded' where id = v_prev and status in ('live', 'unpublished');
  end if;
  update public.book_revisions
     set status = 'live', published_at = coalesce(published_at, now()), schedule_at = null,
         published_by = case when p_mode = 'fast_lane' then null else coalesce(p_actor, published_by) end,
         assigned_to = null, due_at = null, fast_lane = fast_lane or p_mode = 'fast_lane'
   where id = p_rev;
  update public.books set
    current_revision_id = p_rev,
    status = 'live',
    title = coalesce(nullif(v_rev.meta ->> 'title', ''), title),
    subtitle = coalesce(v_rev.meta ->> 'subtitle', subtitle),
    description = coalesce(v_rev.meta ->> 'description', description),
    genres = coalesce((select array_agg(g) from jsonb_array_elements_text(v_rev.meta -> 'genres') g), genres),
    new_arrival_until = case when v_first
                             then now() + make_interval(days => public._threshold('new_arrival_days')::int)
                             else new_arrival_until end,
    unpublish_reason = null, unpublished_at = null
  where id = v_rev.book_id;

  if v_prev is not null and v_prev <> p_rev then
    v_moved := public.migrate_anchors(v_prev, p_rev);
    update public.book_revisions set anchors_moved = v_moved where id = p_rev;
  end if;

  perform public._audit(p_actor, 'books', 'book.publish', 'book_revision', p_rev::text, v_book.title,
    format('Published revision %s (%s)', v_rev.revision_no, p_mode),
    jsonb_build_object('current_revision_id', v_prev),
    jsonb_build_object('current_revision_id', p_rev, 'mode', p_mode, 'anchors_moved', v_moved));

  perform public._notify(case when p_mode = 'fast_lane' then 'update_live' else 'approved' end,
    jsonb_build_object('revision_id', p_rev, 'book_id', v_rev.book_id, 'author_id', v_book.author_id));
  if v_first and p_notify then
    perform public._notify('book_live', jsonb_build_object('book_id', v_rev.book_id, 'author_id', v_book.author_id));
  end if;

  return jsonb_build_object('status', 'live', 'revision_id', p_rev, 'previous_revision_id', v_prev,
                            'anchors_moved', v_moved);
end $$;

-- Fast-lane eligibility (rule 43), from the stored diff and the revision's flags.
create function public._fast_lane_check(p_rev uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  d public.revision_diffs;
  v_reasons text[] := '{}';
  v_author uuid;
begin
  select * into d from public.revision_diffs where revision_id = p_rev;
  if not found then return array['no_diff']; end if;
  select b.author_id into v_author from public.book_revisions r join public.books b on b.id = r.book_id
   where r.id = p_rev;
  if d.changed_pct >= public._threshold('fast_lane_changed_pct') then v_reasons := array_append(v_reasons, 'changed_pct'); end if;
  if d.chapters_added > 0 or d.chapters_removed > 0 then v_reasons := array_append(v_reasons, 'chapters_changed'); end if;
  if d.cover_changed then v_reasons := array_append(v_reasons, 'cover_changed'); end if;
  if d.metadata_changed then v_reasons := array_append(v_reasons, 'metadata_changed'); end if;
  if not public.author_in_good_standing(v_author) then v_reasons := array_append(v_reasons, 'author_standing'); end if;
  if public.revision_score(p_rev) < public._threshold('ready_score') then v_reasons := array_append(v_reasons, 'score'); end if;
  if public.has_blocking_flag(p_rev) then v_reasons := array_append(v_reasons, 'blocking_flag'); end if;
  return v_reasons;
end $$;

-- ─── Author RPCs ────────────────────────────────────────────────────────────
-- Start a revision (Studio step 1, or a staff upload for an author). No p_book starts a new book.
-- p_meta: source_type, title, subtitle, description, genres, content_notes, age, language;
-- staff uploads add author_id and rights_confirmed; replace=true closes an earlier revision in review.
create function public.create_revision(p_meta jsonb, p_book uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_staff boolean;
  v_book public.books;
  v_author uuid;
  v_src public.source_type;
  v_open record;
  v_rev public.book_revisions;
  v_meta jsonb;
begin
  if v_uid is null then
    raise exception 'create_revision: sign in first' using errcode = 'insufficient_privilege';
  end if;
  v_staff := public._has_staff_role(v_uid, array['publisher']::public.staff_role[]);
  v_src := (p_meta ->> 'source_type')::public.source_type;
  if v_src is null then
    raise exception 'create_revision: source_type required' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(jsonb_object_agg(key, value), '{}') into v_meta
  from jsonb_each(coalesce(p_meta, '{}'))
  where key in ('title', 'subtitle', 'description', 'genres', 'content_notes', 'age', 'language');

  if p_book is null then
    v_author := case when v_staff and p_meta ? 'author_id' then (p_meta ->> 'author_id')::uuid else v_uid end;
    if not exists (select 1 from public.profiles where id = v_author and is_author) then
      raise exception 'create_revision: not an author' using errcode = 'insufficient_privilege';
    end if;
    if nullif(trim(v_meta ->> 'title'), '') is null then
      raise exception 'create_revision: title required' using errcode = 'invalid_parameter_value';
    end if;
    insert into public.books (author_id, title, subtitle, description, genres)
    values (v_author, trim(v_meta ->> 'title'), v_meta ->> 'subtitle', v_meta ->> 'description',
            coalesce((select array_agg(g) from jsonb_array_elements_text(v_meta -> 'genres') g), '{}'))
    returning * into v_book;
  else
    select * into v_book from public.books where id = p_book for update;
    if not found then
      raise exception 'create_revision: book not found' using errcode = 'no_data_found';
    end if;
    v_author := v_book.author_id;
    if v_author <> v_uid and not v_staff then
      raise exception 'create_revision: not your book' using errcode = 'insufficient_privilege';
    end if;
    if v_book.status in ('taken_down', 'rejected') then
      raise exception 'create_revision: this book is closed' using errcode = 'check_violation';
    end if;
  end if;

  if v_author <> v_uid and not coalesce((p_meta ->> 'rights_confirmed')::boolean, false) then
    raise exception 'create_revision: rights confirmation required' using errcode = 'invalid_parameter_value';
  end if;

  -- One revision in the pipeline at a time. A newer upload closes the earlier one only if confirmed.
  for v_open in
    select id, status from public.book_revisions
    where book_id = v_book.id
      and status in ('draft', 'processing', 'with_desk', 'needs_fixes', 'ready_for_review', 'scheduled')
    for update
  loop
    if not coalesce((p_meta ->> 'replace')::boolean, false) then
      raise exception 'create_revision: revision % is still open', v_open.id using errcode = 'unique_violation';
    end if;
    perform public._send_back(v_open.id, v_uid, 'system', '[]', 'Replaced by a newer upload');
  end loop;

  insert into public.book_revisions (book_id, revision_no, status, draft_step, source_type, uploaded_by,
                                     created_via, base_revision_id, meta)
  values (v_book.id,
          coalesce((select max(revision_no) from public.book_revisions where book_id = v_book.id), 0) + 1,
          'draft', 'upload', v_src, v_uid,
          (case when v_author <> v_uid then 'staff' else 'author' end)::public.revision_origin,
          v_book.current_revision_id, v_meta)
  returning * into v_rev;
  update public.book_revisions
     set source_key = format('src/%s/source.%s', v_rev.id, v_src),
         cover_key = format('src/%s/cover', v_rev.id),
         converted_key = case when v_src <> 'pdf' then format('src/%s/converted.epub', v_rev.id) end
   where id = v_rev.id
  returning * into v_rev;

  if v_author <> v_uid then
    perform public._audit(v_uid, 'books', 'book.upload_for_author', 'book_revision', v_rev.id::text, v_book.title,
      'Uploaded a book for its author', null, jsonb_build_object('author_id', v_author, 'source_type', v_src));
    perform public._notify('book_added_by_staff',
      jsonb_build_object('revision_id', v_rev.id, 'book_id', v_book.id, 'author_id', v_author));
  end if;

  return jsonb_build_object('book_id', v_book.id, 'revision_id', v_rev.id, 'revision_no', v_rev.revision_no,
                            'source_key', v_rev.source_key, 'cover_key', v_rev.cover_key,
                            'converted_key', v_rev.converted_key);
end $$;

-- Uploads are in R2 (the Worker checked size and hash). Phone conversions go to verification;
-- PDFs and failed or skipped conversions go to the desk. A repeat with the same hashes is a no-op.
-- p_files: source_sha256, converted_sha256, cover_sha256, file_bytes, converted (bool), reason.
create function public.finalize_revision(p_rev uuid, p_actor uuid, p_files jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  v_author uuid;
  v_desk_push boolean;
  v_converted boolean := coalesce((p_files ->> 'converted')::boolean, false);
  v_gen int;
begin
  perform public._require_service('finalize_revision');
  v_rev := public._lock_revision(p_rev);
  select author_id into v_author from public.books where id = v_rev.book_id;

  -- A retry can land after verify already returned the draft to the author; that is a no-op too.
  if (v_rev.status = 'processing' or (v_rev.status = 'draft' and v_rev.draft_step <> 'upload'))
     and v_rev.source_sha256 is not distinct from p_files ->> 'source_sha256'
     and v_rev.converted_sha256 is not distinct from p_files ->> 'converted_sha256' then
    return jsonb_build_object('status', v_rev.status, 'generation', v_rev.generation, 'duplicate', true);
  end if;

  v_desk_push := v_rev.status = 'with_desk' and v_rev.desk_claimed_by = p_actor;
  if not v_desk_push then
    if v_rev.status <> 'draft' then
      raise exception 'finalize_revision: revision is not open for upload' using errcode = 'check_violation';
    end if;
    if p_actor is distinct from v_author and p_actor is distinct from v_rev.uploaded_by then
      raise exception 'finalize_revision: not your upload' using errcode = 'insufficient_privilege';
    end if;
  elsif not v_converted then
    raise exception 'finalize_revision: the desk pushes a converted package' using errcode = 'invalid_parameter_value';
  end if;

  v_gen := v_rev.generation + 1;
  update public.book_revisions set
    generation = v_gen,
    source_sha256 = case when v_desk_push then source_sha256 else p_files ->> 'source_sha256' end,
    converted_sha256 = p_files ->> 'converted_sha256',
    cover_sha256 = coalesce(p_files ->> 'cover_sha256', cover_sha256),
    file_bytes = coalesce((p_files ->> 'file_bytes')::bigint, file_bytes),
    converted_key = case when v_converted then coalesce(converted_key, format('src/%s/converted.epub', id)) end,
    created_via = case when v_desk_push then 'desk' else created_via end,
    chapters_confirmed_at = null,
    steps = case when v_desk_push then steps else jsonb_build_object('received', now()) end
  where id = p_rev;

  if v_converted and (v_desk_push or v_rev.source_type <> 'pdf') then
    update public.book_revisions
       set status = 'processing', draft_step = 'checking', desk_claimed_by = null, desk_lease_until = null,
           due_at = null
     where id = p_rev;
    if v_desk_push then
      perform public._step(p_rev, 'converted');
      -- The desk's epubcheck report arrives as flags; the Worker adds its own on verify.
      delete from public.book_flags where revision_id = p_rev and source = 'desk' and status = 'open';
      perform public._insert_flags(p_rev, p_files -> 'flags', 'desk');
    end if;
    perform pgmq.send('book_verify', jsonb_build_object('revision_id', p_rev, 'stage', 'verify', 'generation', v_gen));
    return jsonb_build_object('status', 'processing', 'generation', v_gen);
  end if;

  update public.book_revisions set
    status = 'with_desk', draft_step = null,
    desk_reason = case when source_type = 'pdf' then 'pdf_source' else coalesce(p_files ->> 'reason', 'conversion_skipped') end,
    due_at = now() + make_interval(days => public._threshold('desk_days')::int)
  where id = p_rev;
  perform pgmq.send('book_desk', jsonb_build_object('revision_id', p_rev, 'reason',
    (select desk_reason from public.book_revisions where id = p_rev), 'source_key', v_rev.source_key));
  return jsonb_build_object('status', 'with_desk', 'generation', v_gen);
end $$;

-- Worker verify result (rules 10–16, 24). p_result: ok, reason, words, pages, price_credits,
-- preview_percent, preview_cut_para_id, preview_cut_chapter_uid, free_through_ord, chapters[], flags[].
-- Results for an old generation are ignored.
create function public.complete_verify(p_rev uuid, p_generation int, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
begin
  perform public._require_service('complete_verify');
  v_rev := public._lock_revision(p_rev);
  if v_rev.generation <> p_generation or v_rev.status <> 'processing' then
    return jsonb_build_object('applied', false);
  end if;

  if not coalesce((p_result ->> 'ok')::boolean, false) then
    if p_result ->> 'reason' = 'unreadable' then
      perform public._send_back(p_rev, null, 'desk_auto', '[]',
        coalesce(p_result ->> 'message', 'We could not read this file. Please send the Word version.'));
      return jsonb_build_object('applied', true, 'status', 'sent_back');
    end if;
    update public.book_revisions set status = 'with_desk', draft_step = null,
      desk_reason = coalesce(p_result ->> 'reason', 'worker_failed'),
      due_at = now() + make_interval(days => public._threshold('desk_days')::int)
    where id = p_rev;
    perform pgmq.send('book_desk', jsonb_build_object('revision_id', p_rev, 'reason',
      coalesce(p_result ->> 'reason', 'worker_failed'), 'source_key', v_rev.source_key));
    perform public._notify('desk_job', jsonb_build_object('revision_id', p_rev, 'role', 'operations_admin',
      'reason', coalesce(p_result ->> 'reason', 'worker_failed')));
    return jsonb_build_object('applied', true, 'status', 'with_desk');
  end if;

  perform public._apply_counts(p_rev, p_result);
  perform public._replace_chapters(p_rev, p_result -> 'chapters');
  delete from public.book_flags where revision_id = p_rev and source = 'worker' and status = 'open';
  perform public._insert_flags(p_rev, p_result -> 'flags', 'worker');
  perform public._rescore(p_rev);
  update public.book_revisions set status = 'draft', draft_step = 'chapters', chapters_confirmed_at = null
   where id = p_rev;
  perform public._step(p_rev, 'chapters_found');
  perform public._step(p_rev, 'checks');
  perform public._notify('chapters_ready', jsonb_build_object('revision_id', p_rev, 'book_id', v_rev.book_id,
    'author_id', (select author_id from public.books where id = v_rev.book_id)));
  return jsonb_build_object('applied', true, 'status', 'draft');
end $$;

-- Author confirmed chapters (Studio step 3): the Worker applied the edits and recounted.
create function public.confirm_chapters(p_rev uuid, p_actor uuid, p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  v_author uuid;
begin
  perform public._require_service('confirm_chapters');
  v_rev := public._lock_revision(p_rev);
  select author_id into v_author from public.books where id = v_rev.book_id;
  if p_actor is distinct from v_author
     and not (v_rev.created_via = 'staff' and public._has_staff_role(p_actor, array['publisher']::public.staff_role[])) then
    raise exception 'confirm_chapters: not your book' using errcode = 'insufficient_privilege';
  end if;
  if v_rev.status <> 'draft' or v_rev.draft_step not in ('chapters', 'preview') then
    raise exception 'confirm_chapters: chapters are not ready to confirm' using errcode = 'check_violation';
  end if;
  perform public._apply_counts(p_rev, p_result);
  perform public._replace_chapters(p_rev, p_result -> 'chapters');
  if p_result ? 'flags' then
    delete from public.book_flags where revision_id = p_rev and source = 'worker' and status = 'open';
    perform public._insert_flags(p_rev, p_result -> 'flags', 'worker');
  end if;
  update public.book_revisions set chapters_confirmed_at = now(), draft_step = 'preview' where id = p_rev;
  return jsonb_build_object('words', (p_result ->> 'words')::int, 'pages', (p_result ->> 'pages')::int,
                            'price_credits', (p_result ->> 'price_credits')::int,
                            'readiness', public._rescore(p_rev));
end $$;

-- Author submits (Studio step 5). Sealing runs next; routing follows the seal.
create function public.submit_revision(p_rev uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_rev public.book_revisions;
  v_author uuid;
begin
  if v_uid is null then
    raise exception 'submit_revision: sign in first' using errcode = 'insufficient_privilege';
  end if;
  v_rev := public._lock_revision(p_rev);
  select author_id into v_author from public.books where id = v_rev.book_id;
  if v_uid <> v_author
     and not (v_rev.created_via = 'staff' and public._has_staff_role(v_uid, array['publisher']::public.staff_role[])) then
    raise exception 'submit_revision: not your book' using errcode = 'insufficient_privilege';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'submit_revision: already submitted' using errcode = 'check_violation';
  end if;
  if v_rev.chapters_confirmed_at is null then
    raise exception 'submit_revision: confirm your chapters first' using errcode = 'check_violation';
  end if;
  if public.has_blocking_flag(p_rev) then
    raise exception 'submit_revision: fix the issues that block publishing first' using errcode = 'check_violation';
  end if;
  update public.book_revisions
     set status = 'processing', draft_step = null, submitted_at = now(), generation = generation + 1
   where id = p_rev
  returning * into v_rev;
  perform public._step(p_rev, 'author_confirms');
  perform pgmq.send('book_verify', jsonb_build_object('revision_id', p_rev, 'stage', 'seal',
                                                      'generation', v_rev.generation));
  return jsonb_build_object('status', 'processing', 'generation', v_rev.generation);
end $$;

-- Studio polls this every 3 seconds while open (no Realtime).
create function public.get_revision_status(p_rev uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  v_author uuid;
begin
  select * into v_rev from public.book_revisions where id = p_rev;
  if not found then
    raise exception 'get_revision_status: not found' using errcode = 'no_data_found';
  end if;
  select author_id into v_author from public.books where id = v_rev.book_id;
  if auth.uid() is distinct from v_author and not public.is_staff() and not public._is_service() then
    raise exception 'get_revision_status: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'revision_id', v_rev.id, 'status', v_rev.status, 'draft_step', v_rev.draft_step, 'steps', v_rev.steps,
    'readiness', v_rev.readiness, 'words', v_rev.words, 'pages', v_rev.pages,
    'price_credits', v_rev.price_credits, 'preview_percent', v_rev.preview_percent,
    'desk_reason', v_rev.desk_reason, 'sent_back_note', v_rev.sent_back_note,
    'chapters_confirmed', v_rev.chapters_confirmed_at is not null,
    'blocking', public.has_blocking_flag(p_rev),
    'flags', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'check_key', f.check_key, 'blocking', f.blocking, 'message', f.message,
        'suggestion', f.suggestion, 'location', f.location) order by f.blocking desc, f.created_at)
      from public.book_flags f where f.revision_id = p_rev and f.status = 'open'), '[]'),
    'issues', (select s.issues from public.send_backs s where s.revision_id = p_rev order by s.sent_at desc limit 1));
end $$;

-- ─── Worker RPCs (service role) ─────────────────────────────────────────────
-- Seal result (rules 17–18, 42–43). Swaps the artefact pointer only if p_generation is current, so
-- duplicate messages and reruns are harmless and a killed seal leaves the old generation intact.
-- p_seal: artifact_prefix, manifest_key, work_version, chapters[{chapter_uid, free_file, full_file}],
-- keys[{chapter_uid|null, wrapped_key (base64), key_version}] (new keys only), anchors[], prices[],
-- anchor_migrations[], diff{inserted_words, deleted_words, changed_pct, chapters_added,
-- chapters_removed, changed_chapter_uids, added_chapter_uids, cover_changed, metadata_changed, diff_key}.
create function public.complete_seal(p_rev uuid, p_generation int, p_seal jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  v_reasons text[];
  v_status public.revision_status;
  v_author uuid;
begin
  perform public._require_service('complete_seal');
  v_rev := public._lock_revision(p_rev);
  if v_rev.generation <> p_generation or v_rev.sealed_generation is not distinct from p_generation
     or v_rev.status not in ('processing', 'needs_fixes', 'ready_for_review') then
    return jsonb_build_object('applied', false);
  end if;
  if nullif(p_seal ->> 'artifact_prefix', '') is null or nullif(p_seal ->> 'manifest_key', '') is null then
    raise exception 'complete_seal: artifact_prefix and manifest_key required' using errcode = 'invalid_parameter_value';
  end if;

  update public.chapters c set free_file = s.free_file, full_file = s.full_file
  from jsonb_to_recordset(coalesce(p_seal -> 'chapters', '[]')) as s(chapter_uid uuid, free_file text, full_file text)
  where c.revision_id = p_rev and c.chapter_uid = s.chapter_uid;

  update public.chapter_keys k set revoked_at = now()
  from jsonb_to_recordset(coalesce(p_seal -> 'keys', '[]')) as n(chapter_uid uuid)
  where k.revision_id = p_rev and k.revoked_at is null and k.chapter_uid is not distinct from n.chapter_uid;
  insert into public.chapter_keys (revision_id, chapter_uid, wrapped_key, key_version, generation)
  select p_rev, n.chapter_uid, decode(n.wrapped_key, 'base64'), coalesce(n.key_version, 1), p_generation
  from jsonb_to_recordset(coalesce(p_seal -> 'keys', '[]')) as n(chapter_uid uuid, wrapped_key text, key_version int);

  if p_seal ? 'anchors' then
    delete from public.paragraph_anchors where revision_id = p_rev;
    insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint, words, words_before)
    select p_rev, a.para_id, a.chapter_uid, a.ord, a.fingerprint, coalesce(a.words, 0), coalesce(a.words_before, 0)
    from jsonb_to_recordset(p_seal -> 'anchors') as a(para_id text, chapter_uid uuid, ord int, fingerprint text,
                                                      words int, words_before int);
  end if;
  if p_seal ? 'anchor_migrations' and v_rev.base_revision_id is not null then
    delete from public.anchor_migrations where new_revision_id = p_rev;
    insert into public.anchor_migrations (base_revision_id, new_revision_id, old_para_id, new_para_id,
                                          nearest_para_id, method)
    select v_rev.base_revision_id, p_rev, m.old_para_id, m.new_para_id, m.nearest_para_id, m.method
    from jsonb_to_recordset(p_seal -> 'anchor_migrations')
      as m(old_para_id text, new_para_id text, nearest_para_id text, method public.anchor_method);
  end if;
  if p_seal ? 'prices' then
    perform public._set_chapter_prices(p_rev, p_seal -> 'prices');
  end if;

  update public.book_revisions set
    artifact_prefix = p_seal ->> 'artifact_prefix',
    manifest_key = p_seal ->> 'manifest_key',
    sealed_generation = p_generation,
    sealed_work_version = coalesce((p_seal ->> 'work_version')::int, work_version)
  where id = p_rev;

  if p_seal ? 'diff' and v_rev.base_revision_id is not null then
    select author_id into v_author from public.books where id = v_rev.book_id;
    insert into public.revision_diffs (revision_id, base_revision_id, inserted_words, deleted_words, changed_pct,
                                       chapters_added, chapters_removed, changed_chapter_uids, added_chapter_uids,
                                       cover_changed, metadata_changed, author_in_good_standing, diff_key)
    select p_rev, v_rev.base_revision_id, coalesce(d.inserted_words, 0), coalesce(d.deleted_words, 0),
           coalesce(d.changed_pct, 0), coalesce(d.chapters_added, 0), coalesce(d.chapters_removed, 0),
           coalesce(d.changed_chapter_uids, '{}'), coalesce(d.added_chapter_uids, '{}'),
           coalesce(d.cover_changed, false), coalesce(d.metadata_changed, false),
           public.author_in_good_standing(v_author), d.diff_key
    from jsonb_to_record(p_seal -> 'diff') as d(inserted_words int, deleted_words int, changed_pct numeric,
                                                chapters_added int, chapters_removed int,
                                                changed_chapter_uids text[], added_chapter_uids text[],
                                                cover_changed boolean, metadata_changed boolean, diff_key text)
    on conflict (revision_id) do update set
      inserted_words = excluded.inserted_words, deleted_words = excluded.deleted_words,
      changed_pct = excluded.changed_pct, chapters_added = excluded.chapters_added,
      chapters_removed = excluded.chapters_removed, changed_chapter_uids = excluded.changed_chapter_uids,
      added_chapter_uids = excluded.added_chapter_uids, cover_changed = excluded.cover_changed,
      metadata_changed = excluded.metadata_changed, author_in_good_standing = excluded.author_in_good_standing,
      diff_key = excluded.diff_key;
  end if;

  if v_rev.status <> 'processing' then
    -- A reseal after staff fixes: artefacts updated, stage unchanged.
    return jsonb_build_object('applied', true, 'status', v_rev.status);
  end if;

  if exists (select 1 from public.revision_diffs where revision_id = p_rev) then
    v_reasons := public._fast_lane_check(p_rev);
    update public.revision_diffs
       set fast_lane_eligible = cardinality(v_reasons) = 0, reasons = v_reasons
     where revision_id = p_rev;
    if cardinality(v_reasons) = 0 and coalesce(public._chapter_prices_ok(p_rev), false)
       and v_rev.preview_cut_para_id is not null then
      perform public._step(p_rev, 'scored');
      perform public._publish_now(p_rev, null, false, 'fast_lane');
      return jsonb_build_object('applied', true, 'status', 'live', 'fast_lane', true);
    end if;
  end if;

  v_status := public._route(p_rev);
  return jsonb_build_object('applied', true, 'status', v_status, 'fast_lane', false);
end $$;

create function public.set_chapter_prices(p_rev uuid, p_prices jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('set_chapter_prices');
  perform public._lock_revision(p_rev);
  perform public._set_chapter_prices(p_rev, p_prices);
end $$;

-- Re-run of checks on the chapters a staff fix touched (rule 31). p_result (counts and chapters, as
-- for confirm_chapters) replaces the chapter rows when the fix changed them. Only the open flags of
-- the re-run checks (p_check_keys; null = all) on those chapters are replaced.
create function public.complete_rescore(p_rev uuid, p_work_version int, p_chapter_uids uuid[],
                                        p_flags jsonb, p_result jsonb default null,
                                        p_check_keys text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
begin
  perform public._require_service('complete_rescore');
  v_rev := public._lock_revision(p_rev);
  if v_rev.work_version <> p_work_version or v_rev.status <> 'needs_fixes' then
    return jsonb_build_object('applied', false);
  end if;
  if p_result is not null then
    perform public._apply_counts(p_rev, p_result);
    perform public._replace_chapters(p_rev, p_result -> 'chapters');
  end if;
  delete from public.book_flags
   where revision_id = p_rev and source = 'worker' and status = 'open'
     and (location ->> 'chapter_uid')::uuid = any (p_chapter_uids)
     and (p_check_keys is null or check_key = any (p_check_keys));
  perform public._insert_flags(p_rev, p_flags, 'worker');
  return jsonb_build_object('applied', true, 'readiness', public._rescore(p_rev),
                            'blocking', public.has_blocking_flag(p_rev));
end $$;

-- New generation for a reseal of a revision staff changed.
create function public.begin_reseal(p_rev uuid, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
begin
  perform public._require_service('begin_reseal');
  perform public._actor(p_actor, array['publisher']::public.staff_role[], 'begin_reseal');
  v_rev := public._lock_revision(p_rev);
  if v_rev.status not in ('needs_fixes', 'ready_for_review') then
    raise exception 'begin_reseal: nothing to reseal' using errcode = 'check_violation';
  end if;
  update public.book_revisions set generation = generation + 1 where id = p_rev returning * into v_rev;
  return jsonb_build_object('generation', v_rev.generation, 'work_version', v_rev.work_version);
end $$;

-- A staff fix the Worker applied to the working copy (rule 30). Version-checked.
create function public.record_fix(p_rev uuid, p_flag uuid, p_op jsonb, p_inverse jsonb,
                                  p_expected_version int, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_rev public.book_revisions;
  v_fix uuid;
  v_dismiss boolean := p_op ->> 'op' = 'dismiss_flag';
begin
  perform public._require_service('record_fix');
  v_actor := public._actor(p_actor, array['publisher']::public.staff_role[], 'record_fix');
  v_rev := public._lock_revision(p_rev);
  if v_rev.status <> 'needs_fixes' then
    raise exception 'record_fix: book is not in Needs fixes' using errcode = 'check_violation';
  end if;
  if v_rev.work_version <> p_expected_version then
    raise exception 'record_fix: someone else changed this book; reload' using errcode = 'serialization_failure';
  end if;
  if p_op ->> 'op' not in ('shrink_image', 'set_heading', 'rename_chapter', 'merge_chapter_up',
                           'remove_paragraph', 'insert_copyright_page', 'dismiss_flag') then
    raise exception 'record_fix: unknown operation' using errcode = 'invalid_parameter_value';
  end if;
  if v_dismiss and nullif(trim(p_op ->> 'reason'), '') is null then
    raise exception 'record_fix: dismissing needs a reason' using errcode = 'invalid_parameter_value';
  end if;
  if p_flag is not null and not exists (select 1 from public.book_flags where id = p_flag and revision_id = p_rev) then
    raise exception 'record_fix: flag not on this revision' using errcode = 'invalid_parameter_value';
  end if;

  update public.book_revisions set work_version = work_version + 1, last_activity_at = now()
   where id = p_rev returning * into v_rev;
  insert into public.book_fixes (revision_id, flag_id, op, inverse, work_version, staff_id)
  values (p_rev, p_flag, p_op, coalesce(p_inverse, '{}'), v_rev.work_version, v_actor)
  returning id into v_fix;
  if p_flag is not null then
    update public.book_flags
       set status = case when v_dismiss then 'dismissed' else 'fixed' end::public.flag_status,
           fixed_by = v_actor, dismiss_reason = case when v_dismiss then p_op ->> 'reason' end
     where id = p_flag;
  end if;
  perform public._audit(v_actor, 'books', 'book.fix', 'book_revision', p_rev::text, null,
    format('Applied %s', p_op ->> 'op'), null, jsonb_build_object('fix_id', v_fix, 'op', p_op, 'flag_id', p_flag));
  return jsonb_build_object('fix_id', v_fix, 'work_version', v_rev.work_version, 'readiness', public._rescore(p_rev),
                            'blocking', public.has_blocking_flag(p_rev));
end $$;

-- Undo the latest fix: the Worker wrote the restored copy as a new version.
create function public.undo_fix(p_fix uuid, p_expected_version int, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_fix public.book_fixes;
  v_rev public.book_revisions;
begin
  perform public._require_service('undo_fix');
  v_actor := public._actor(p_actor, array['publisher']::public.staff_role[], 'undo_fix');
  select * into v_fix from public.book_fixes where id = p_fix;
  if not found then
    raise exception 'undo_fix: not found' using errcode = 'no_data_found';
  end if;
  v_rev := public._lock_revision(v_fix.revision_id);
  if v_rev.status <> 'needs_fixes' or v_rev.work_version <> p_expected_version or v_fix.undone_at is not null
     or v_fix.work_version <> (select max(work_version) from public.book_fixes
                                where revision_id = v_rev.id and undone_at is null) then
    raise exception 'undo_fix: only the latest fix can be undone' using errcode = 'serialization_failure';
  end if;
  update public.book_fixes set undone_at = now() where id = p_fix;
  if v_fix.flag_id is not null then
    update public.book_flags set status = 'open', fixed_by = null, dismiss_reason = null where id = v_fix.flag_id;
  end if;
  update public.book_revisions set work_version = work_version + 1, last_activity_at = now()
   where id = v_rev.id returning * into v_rev;
  perform public._audit(v_actor, 'books', 'book.fix_undo', 'book_revision', v_rev.id::text, null,
    format('Undid %s', v_fix.op ->> 'op'), jsonb_build_object('fix_id', p_fix), null);
  return jsonb_build_object('work_version', v_rev.work_version, 'readiness', public._rescore(v_rev.id),
                            'blocking', public.has_blocking_flag(v_rev.id));
end $$;

-- pgmq wrappers for the Worker.
create function public.book_queue_read(p_queue text, p_vt int default 600, p_qty int default 5)
returns setof pgmq.message_record
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('book_queue_read');
  if p_queue not in ('book_verify', 'book_desk', 'book_notify') then
    raise exception 'book_queue_read: unknown queue' using errcode = 'invalid_parameter_value';
  end if;
  return query select * from pgmq.read(p_queue, p_vt, p_qty);
end $$;

create function public.book_queue_ack(p_queue text, p_msg_id bigint, p_archive boolean default true) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('book_queue_ack');
  if p_queue not in ('book_verify', 'book_desk', 'book_notify') then
    raise exception 'book_queue_ack: unknown queue' using errcode = 'invalid_parameter_value';
  end if;
  return case when p_archive then pgmq.archive(p_queue, p_msg_id) else pgmq.delete(p_queue, p_msg_id) end;
end $$;

-- ─── Staff RPCs ─────────────────────────────────────────────────────────────
-- "On it" (rule 4): opening Fix or Quick review assigns the book if nobody is on it (or it lapsed).
create function public.claim_revision(p_rev uuid, p_screen text, p_take_over boolean default false,
                                      p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'claim_revision');
  v_rev public.book_revisions := public._lock_revision(p_rev);
  v_lapsed boolean;
begin
  if v_rev.status not in ('needs_fixes', 'ready_for_review') then
    raise exception 'claim_revision: book is not waiting for staff' using errcode = 'check_violation';
  end if;
  v_lapsed := v_rev.last_activity_at is null
           or v_rev.last_activity_at < now() - make_interval(hours => public._threshold('assign_lapse_hours')::int);
  if v_rev.assigned_to is null or v_rev.assigned_to = v_actor or v_lapsed or p_take_over then
    update public.book_revisions set assigned_to = v_actor, last_activity_at = now(),
      review_opened_at = case when p_screen = 'review' then coalesce(review_opened_at, now()) else review_opened_at end
    where id = p_rev returning * into v_rev;
  elsif p_screen = 'review' then
    update public.book_revisions set review_opened_at = coalesce(review_opened_at, now())
     where id = p_rev returning * into v_rev;
  end if;
  return jsonb_build_object('assigned_to', v_rev.assigned_to, 'mine', v_rev.assigned_to = v_actor,
    'assigned_name', (select full_name from public.profiles where id = v_rev.assigned_to));
end $$;

-- Mark fixed and send to review (rule 32). The Worker reseals changed chapters first.
create function public.release_to_review(p_rev uuid, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'release_to_review');
  v_rev public.book_revisions := public._lock_revision(p_rev);
begin
  if v_rev.status <> 'needs_fixes' then
    raise exception 'release_to_review: book is not in Needs fixes' using errcode = 'check_violation';
  end if;
  if public.has_blocking_flag(p_rev) then
    raise exception 'release_to_review: blocking issues are still open' using errcode = 'check_violation';
  end if;
  if v_rev.sealed_generation is distinct from v_rev.generation
     or v_rev.sealed_work_version is distinct from v_rev.work_version then
    raise exception 'release_to_review: changes are not sealed yet' using errcode = 'check_violation';
  end if;
  update public.book_revisions set status = 'ready_for_review', routed_at = now(), review_opened_at = null,
    assigned_to = null,
    due_at = coalesce(submitted_at, now()) + make_interval(days => public._threshold('review_days')::int)
  where id = p_rev;
  perform public._audit(v_actor, 'books', 'book.release_to_review', 'book_revision', p_rev::text, null,
    'Marked fixed and sent to review', jsonb_build_object('status', 'needs_fixes'),
    jsonb_build_object('status', 'ready_for_review', 'readiness', v_rev.readiness));
  return jsonb_build_object('status', 'ready_for_review', 'readiness', public._rescore(p_rev));
end $$;

-- Undo on the release toast: back to Needs fixes while nobody has opened Quick review.
create function public.undo_release_to_review(p_rev uuid, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'undo_release_to_review');
  v_rev public.book_revisions := public._lock_revision(p_rev);
begin
  if v_rev.status <> 'ready_for_review' or v_rev.review_opened_at is not null then
    raise exception 'undo_release_to_review: too late to undo' using errcode = 'check_violation';
  end if;
  update public.book_revisions set status = 'needs_fixes', assigned_to = v_actor, last_activity_at = now()
   where id = p_rev;
  perform public._audit(v_actor, 'books', 'book.release_undo', 'book_revision', p_rev::text, null,
    'Undid send to review', jsonb_build_object('status', 'ready_for_review'), jsonb_build_object('status', 'needs_fixes'));
  return jsonb_build_object('status', 'needs_fixes');
end $$;

-- Send back to the author (rules 34, 36). At least one issue or a note.
create function public.send_back_revision(p_rev uuid, p_issues jsonb, p_note text,
                                          p_source public.send_back_source default 'quick_review',
                                          p_actor uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'send_back_revision');
  v_rev public.book_revisions := public._lock_revision(p_rev);
  v_id uuid;
begin
  if v_rev.status not in ('needs_fixes', 'ready_for_review', 'with_desk') then
    raise exception 'send_back_revision: book is not waiting for staff' using errcode = 'check_violation';
  end if;
  if p_source not in ('fixer', 'quick_review') and not (p_source = 'desk_auto' and v_rev.status = 'with_desk') then
    raise exception 'send_back_revision: bad source' using errcode = 'invalid_parameter_value';
  end if;
  if (p_issues is null or jsonb_typeof(p_issues) <> 'array' or jsonb_array_length(p_issues) = 0)
     and nullif(trim(p_note), '') is null then
    raise exception 'send_back_revision: add at least one issue or a note' using errcode = 'invalid_parameter_value';
  end if;
  v_id := public._send_back(p_rev, v_actor, p_source, p_issues, nullif(trim(p_note), ''));
  perform public._audit(v_actor, 'books', 'book.send_back', 'book_revision', p_rev::text, null,
    'Sent back to author', jsonb_build_object('status', v_rev.status),
    jsonb_build_object('status', 'sent_back', 'issues', p_issues, 'note', p_note));
  return v_id;
end $$;

create function public.reject_revision(p_rev uuid, p_reason text, p_actor uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'reject_revision');
  v_rev public.book_revisions := public._lock_revision(p_rev);
begin
  if v_rev.status not in ('needs_fixes', 'ready_for_review', 'with_desk', 'scheduled') then
    raise exception 'reject_revision: cannot reject at this stage' using errcode = 'check_violation';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'reject_revision: reason required' using errcode = 'invalid_parameter_value';
  end if;
  update public.book_revisions set status = 'rejected', status_reason = trim(p_reason), assigned_to = null,
    due_at = null, schedule_at = null where id = p_rev;
  update public.books set status = 'rejected'
   where id = v_rev.book_id and current_revision_id is null;
  perform public._audit(v_actor, 'books', 'book.reject', 'book_revision', p_rev::text, null, 'Rejected',
    jsonb_build_object('status', v_rev.status), jsonb_build_object('status', 'rejected'), p_reason);
  perform public._notify('rejected', jsonb_build_object('revision_id', p_rev, 'book_id', v_rev.book_id,
    'author_id', (select author_id from public.books where id = v_rev.book_id), 'reason', p_reason));
end $$;

-- Approve and publish, now or scheduled (rules 37–38). Idempotent for a revision already live.
create function public.publish_revision(p_rev uuid, p_schedule_at timestamptz default null,
                                        p_notify_followers boolean default true,
                                        p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'publish_revision');
  v_rev public.book_revisions := public._lock_revision(p_rev);
  v_book public.books;
begin
  select * into v_book from public.books where id = v_rev.book_id;
  if v_rev.status = 'live' and v_book.current_revision_id = p_rev then
    return jsonb_build_object('status', 'live', 'revision_id', p_rev, 'already', true);
  end if;
  if v_rev.status not in ('ready_for_review', 'scheduled') then
    raise exception 'publish_revision: not ready for review' using errcode = 'check_violation';
  end if;
  if v_actor = v_book.author_id or v_actor = v_rev.uploaded_by then
    raise exception 'publish_revision: you cannot publish your own book' using errcode = 'insufficient_privilege';
  end if;
  if public.has_blocking_flag(p_rev) then
    raise exception 'publish_revision: blocking issues are open' using errcode = 'check_violation';
  end if;
  if v_rev.sealed_generation is distinct from v_rev.generation or v_rev.manifest_key is null then
    raise exception 'publish_revision: the sealed book is not ready' using errcode = 'check_violation';
  end if;
  if v_rev.price_credits is null or not coalesce(public._chapter_prices_ok(p_rev), false) then
    raise exception 'publish_revision: chapter prices do not add up to the book price' using errcode = 'check_violation';
  end if;
  if v_rev.preview_cut_para_id is null or v_rev.preview_percent is null then
    raise exception 'publish_revision: preview cut missing' using errcode = 'check_violation';
  end if;

  if p_schedule_at is not null and p_schedule_at > now() then
    update public.book_revisions set status = 'scheduled', schedule_at = p_schedule_at, published_by = v_actor,
      notify_followers = p_notify_followers, assigned_to = null, due_at = null where id = p_rev;
    update public.books set status = 'scheduled' where id = v_book.id and current_revision_id is null;
    perform public._audit(v_actor, 'books', 'book.schedule', 'book_revision', p_rev::text, v_book.title,
      format('Scheduled for %s', p_schedule_at), jsonb_build_object('status', v_rev.status),
      jsonb_build_object('status', 'scheduled', 'schedule_at', p_schedule_at));
    return jsonb_build_object('status', 'scheduled', 'revision_id', p_rev, 'schedule_at', p_schedule_at);
  end if;

  return public._publish_now(p_rev, v_actor, p_notify_followers, 'manual');
end $$;

-- Republish an earlier revision (fast-lane audit "problem", rule 44).
create function public.revert_to_revision(p_rev uuid, p_reason text, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'revert_to_revision');
  v_rev public.book_revisions := public._lock_revision(p_rev);
  v_res jsonb;
begin
  if v_rev.status <> 'superseded' or v_rev.manifest_key is null then
    raise exception 'revert_to_revision: only an earlier published revision' using errcode = 'check_violation';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'revert_to_revision: reason required' using errcode = 'invalid_parameter_value';
  end if;
  v_res := public._publish_now(p_rev, v_actor, false, 'revert');
  perform public._audit(v_actor, 'books', 'book.revert', 'book_revision', p_rev::text, null,
    format('Reverted to revision %s', v_rev.revision_no), null, v_res, p_reason);
  return v_res;
end $$;

-- Unpublish (rule 52). Keep access: owners keep reading. Remove access (policy violations, Super
-- admin): entitlements revoked and credits paid for the book refunded, reversing author earnings.
create function public.unpublish_book(p_book uuid, p_reason public.unpublish_reason, p_remove_access boolean,
                                      p_notify_readers boolean, p_confirm_title text,
                                      p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'unpublish_book');
  v_book public.books;
  v_txn uuid := gen_random_uuid();
  v_users int := 0;
  v_credits int := 0;
begin
  select * into v_book from public.books where id = p_book for update;
  if not found then
    raise exception 'unpublish_book: not found' using errcode = 'no_data_found';
  end if;
  if v_book.status <> 'live' then
    raise exception 'unpublish_book: book is not live' using errcode = 'check_violation';
  end if;
  if lower(trim(coalesce(p_confirm_title, ''))) <> lower(trim(v_book.title)) then
    raise exception 'unpublish_book: type the title to confirm' using errcode = 'invalid_parameter_value';
  end if;
  if p_remove_access then
    if not public._has_staff_role(v_actor, array['super_admin']::public.staff_role[]) then
      raise exception 'unpublish_book: only a Super admin can remove access' using errcode = 'insufficient_privilege';
    end if;
    if p_reason <> 'policy_violation' then
      raise exception 'unpublish_book: remove access is for policy violations' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  update public.books set status = 'unpublished', unpublish_reason = p_reason, unpublished_at = now(),
    access_removed_at = case when p_remove_access then now() end
  where id = p_book;
  update public.book_revisions set status = 'unpublished' where id = v_book.current_revision_id and status = 'live';

  if p_remove_access then
    update public.entitlements set revoked_at = now(), revoked_reason = 'book_unpublished'
     where book_id = p_book and revoked_at is null;
    with net as (
      select l.user_id, -sum(l.delta)::int as credits, sum(l.author_earning_kobo)::int as kobo
      from public.credit_ledger l
      where l.book_id = p_book and l.reason in ('unlock_all', 'chapter', 'undo', 'refund')
      group by l.user_id
      having -sum(l.delta) > 0
    ), ins as (
      insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, ref_type, ref_id, idempotency_key,
                                        book_id, author_id, author_earning_kobo, actor_id, note)
      select n.user_id, n.credits, 'refund', 'topup', v_txn, 'book', p_book::text,
             format('unpublish_refund:%s:%s:%s', p_book, n.user_id, v_txn), p_book, v_book.author_id, -n.kobo,
             v_actor, 'Book removed from Arpedia'
      from net n
      returning delta
    )
    select count(*), coalesce(sum(delta), 0) into v_users, v_credits from ins;
  end if;

  perform public._audit(v_actor, case when p_remove_access then 'money' else 'books' end, 'book.unpublish', 'book',
    p_book::text, v_book.title, 'Unpublished', jsonb_build_object('status', 'live'),
    jsonb_build_object('status', 'unpublished', 'remove_access', p_remove_access, 'refunded_users', v_users,
                       'refunded_credits', v_credits), p_reason::text);
  if p_notify_readers then
    perform public._notify('book_unpublished', jsonb_build_object('book_id', p_book,
      'remove_access', p_remove_access));
  end if;
  return jsonb_build_object('status', 'unpublished', 'refunded_users', v_users, 'refunded_credits', v_credits);
end $$;

create function public.republish_book(p_book uuid, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'republish_book');
  v_book public.books;
begin
  select * into v_book from public.books where id = p_book for update;
  if not found or v_book.status <> 'unpublished' or v_book.current_revision_id is null then
    raise exception 'republish_book: book is not unpublished' using errcode = 'check_violation';
  end if;
  update public.book_revisions set status = 'live' where id = v_book.current_revision_id;
  update public.books set status = 'live', unpublish_reason = null, unpublished_at = null where id = p_book;
  perform public._audit(v_actor, 'books', 'book.republish', 'book', p_book::text, v_book.title, 'Republished',
    jsonb_build_object('status', 'unpublished'), jsonb_build_object('status', 'live'));
  return jsonb_build_object('status', 'live');
end $$;

create function public.remind_author(p_rev uuid, p_actor uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'remind_author');
  v_sb public.send_backs;
  v_book uuid;
begin
  select s.* into v_sb from public.send_backs s join public.book_revisions r on r.id = s.revision_id
   where s.revision_id = p_rev and r.status = 'sent_back' order by s.sent_at desc limit 1 for update of s;
  if not found then
    raise exception 'remind_author: book is not sent back' using errcode = 'check_violation';
  end if;
  if v_sb.reminded_at is not null and v_sb.reminded_at > now() - interval '1 day' then
    raise exception 'remind_author: already reminded today' using errcode = 'check_violation';
  end if;
  update public.send_backs set reminded_at = now() where id = v_sb.id;
  select book_id into v_book from public.book_revisions where id = p_rev;
  perform public._notify('sent_back_reminder', jsonb_build_object('revision_id', p_rev, 'book_id', v_book,
    'author_id', (select author_id from public.books where id = v_book)));
  perform public._audit(v_actor, 'books', 'book.remind', 'book_revision', p_rev::text, null, 'Reminded the author');
end $$;

create function public.audit_fast_lane(p_rev uuid, p_result public.fast_lane_result, p_note text,
                                       p_actor uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'audit_fast_lane');
begin
  if p_result = 'pending' then
    raise exception 'audit_fast_lane: choose ok or problem' using errcode = 'invalid_parameter_value';
  end if;
  update public.fast_lane_audits set status = p_result, note = p_note, audited_by = v_actor, audited_at = now()
   where revision_id = p_rev and status = 'pending';
  if not found then
    raise exception 'audit_fast_lane: not in the audit queue' using errcode = 'no_data_found';
  end if;
  perform public._audit(v_actor, 'books', 'book.fast_lane_audit', 'book_revision', p_rev::text, null,
    format('Fast-lane audit: %s', p_result), null, jsonb_build_object('result', p_result, 'note', p_note));
  if p_result = 'problem' then
    perform public._notify('fast_lane_problem', jsonb_build_object('revision_id', p_rev, 'role', 'publisher',
      'note', p_note));
  end if;
end $$;

-- Paragraph links for an update (Revisions, rule 46): base paragraphs kept, and the highlights and
-- discussions on removed paragraphs that move (or moved, once published) to the nearest one.
create function public.revision_links(p_rev uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  v_paras int;
  v_gone int;
  v_hl int := 0;
  v_hl_moving int := 0;
  v_pc_moving int := 0;
begin
  if not public.is_staff('publisher') then
    raise exception 'revision_links: publishers only' using errcode = 'insufficient_privilege';
  end if;
  select * into v_rev from public.book_revisions where id = p_rev;
  if not found or v_rev.base_revision_id is null then
    return null;
  end if;
  select count(*) into v_paras from public.paragraph_anchors where revision_id = v_rev.base_revision_id;
  select count(*) into v_gone from public.anchor_migrations
   where base_revision_id = v_rev.base_revision_id and new_revision_id = p_rev and new_para_id is null;
  if v_rev.anchors_moved is not null then
    -- Published: what migrate_anchors actually moved.
    v_hl_moving := coalesce((v_rev.anchors_moved ->> 'highlights')::int, 0);
    v_pc_moving := coalesce((v_rev.anchors_moved ->> 'comments')::int, 0);
  else
    if to_regclass('public.annotations') is not null then
      execute 'select count(*) from public.annotations a where a.book_id = $1 and exists (
                 select 1 from public.anchor_migrations m where m.base_revision_id = $2 and m.new_revision_id = $3
                   and m.new_para_id is null and m.old_para_id in (a.start_para_id, a.end_para_id))'
        into v_hl_moving using v_rev.book_id, v_rev.base_revision_id, p_rev;
    end if;
    if to_regclass('public.passage_comments') is not null then
      execute 'select count(*) from public.passage_comments c where c.book_id = $1 and exists (
                 select 1 from public.anchor_migrations m where m.base_revision_id = $2 and m.new_revision_id = $3
                   and m.new_para_id is null and m.old_para_id = c.para_id)'
        into v_pc_moving using v_rev.book_id, v_rev.base_revision_id, p_rev;
    end if;
  end if;
  if to_regclass('public.annotations') is not null then
    execute 'select count(*) from public.annotations a where a.book_id = $1' into v_hl using v_rev.book_id;
  end if;
  return jsonb_build_object('paragraphs', v_paras, 'kept', v_paras - v_gone, 'highlights', v_hl,
                            'highlights_kept', greatest(v_hl - v_hl_moving, 0), 'comments_moved', v_pc_moving,
                            'published', v_rev.anchors_moved is not null);
end $$;

-- ─── Desk RPCs ──────────────────────────────────────────────────────────────
-- Claim the oldest desk job (or a given one) with a lease; heartbeats extend it.
create function public.desk_claim(p_rev uuid default null, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['operations_admin', 'publisher']::public.staff_role[], 'desk_claim');
  v_rev public.book_revisions;
begin
  select * into v_rev from public.book_revisions r
   where r.status = 'with_desk' and (p_rev is null or r.id = p_rev)
     and (r.desk_lease_until is null or r.desk_lease_until < now() or r.desk_claimed_by = v_actor)
   order by r.updated_at
   limit 1 for update skip locked;
  if not found then
    return null;
  end if;
  update public.book_revisions set desk_claimed_by = v_actor,
    desk_lease_until = now() + make_interval(mins => public._threshold('desk_lease_minutes')::int)
  where id = v_rev.id returning * into v_rev;
  delete from pgmq.q_book_desk where message ->> 'revision_id' = v_rev.id::text;
  perform public._audit(v_actor, 'books', 'book.desk_claim', 'book_revision', v_rev.id::text, null, 'Desk job claimed');
  return jsonb_build_object('revision_id', v_rev.id, 'book_id', v_rev.book_id, 'source_type', v_rev.source_type,
    'source_key', v_rev.source_key, 'desk_reason', v_rev.desk_reason, 'lease_until', v_rev.desk_lease_until,
    'title', (select title from public.books where id = v_rev.book_id));
end $$;

create function public.desk_heartbeat(p_rev uuid, p_actor uuid default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['operations_admin', 'publisher']::public.staff_role[], 'desk_heartbeat');
  v_until timestamptz;
begin
  update public.book_revisions
     set desk_lease_until = now() + make_interval(mins => public._threshold('desk_lease_minutes')::int)
   where id = p_rev and status = 'with_desk' and desk_claimed_by = v_actor and desk_lease_until >= now()
  returning desk_lease_until into v_until;
  if v_until is null then
    raise exception 'desk_heartbeat: lease lost' using errcode = 'check_violation';
  end if;
  return v_until;
end $$;

-- Scanned, corrupt or password-protected files go back to the author automatically (rule 21).
create function public.desk_reject_unreadable(p_rev uuid, p_reason text default null,
                                              p_actor uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['operations_admin', 'publisher']::public.staff_role[],
                                'desk_reject_unreadable', true);
  v_rev public.book_revisions := public._lock_revision(p_rev);
  v_id uuid;
begin
  if v_rev.status <> 'with_desk' or (v_actor is not null and v_rev.desk_claimed_by is distinct from v_actor) then
    raise exception 'desk_reject_unreadable: claim the job first' using errcode = 'check_violation';
  end if;
  v_id := public._send_back(p_rev, v_actor, 'desk_auto', '[]',
                            'We could not read this file. Please send the Word version.');
  perform public._audit(v_actor, 'books', 'book.desk_unreadable', 'book_revision', p_rev::text, null,
    'Sent back automatically: file could not be read', null, null, p_reason);
  return v_id;
end $$;

-- ─── Cron jobs ──────────────────────────────────────────────────────────────
create function public.publish_due() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_n int := 0;
begin
  for v in select id, notify_followers from public.book_revisions
           where status = 'scheduled' and schedule_at <= now() order by schedule_at
  loop
    perform public._publish_now(v.id, null, v.notify_followers, 'scheduled');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create function public.pipeline_sla() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_n int := 0;
begin
  for v in
    update public.book_revisions set late_alerted_at = now()
     where status in ('needs_fixes', 'ready_for_review', 'with_desk') and due_at < now() and late_alerted_at is null
    returning id, status
  loop
    perform public._notify('pipeline_late', jsonb_build_object('revision_id', v.id, 'status', v.status,
      'role', case when v.status = 'with_desk' then 'operations_admin' else 'publisher' end));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create function public.sent_back_reminder() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_n int := 0;
begin
  for v in
    update public.send_backs s set reminded_at = now()
     from public.book_revisions r
     where r.id = s.revision_id and r.status = 'sent_back' and s.reminded_at is null
       and s.sent_at < now() - make_interval(days => public._threshold('remind_after_days')::int)
       and s.sent_at = (select max(sent_at) from public.send_backs x where x.revision_id = s.revision_id)
    returning s.revision_id, r.book_id
  loop
    perform public._notify('sent_back_reminder', jsonb_build_object('revision_id', v.revision_id,
      'book_id', v.book_id, 'author_id', (select author_id from public.books b where b.id = v.book_id)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Weekly: a random 10% (at least 3 if available) of last week's fast-lane publishes go to audit.
create function public.select_fast_lane_audits() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  with pool as (
    select r.id from public.book_revisions r
    where r.fast_lane and r.published_at > now() - interval '7 days'
      and not exists (select 1 from public.fast_lane_audits a where a.revision_id = r.id)
  ), pick as (
    select id from pool order by random()
    limit greatest(public._threshold('audit_min')::int,
                   ceil((select count(*) from pool) * public._threshold('audit_share'))::int)
  ), ins as (
    insert into public.fast_lane_audits (revision_id) select id from pick returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end $$;

create function public.desk_lease_reaper() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  update public.book_revisions set desk_claimed_by = null, desk_lease_until = null
   where status = 'with_desk' and desk_lease_until < now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

select cron.schedule('publish_due', '* * * * *', 'select public.publish_due()');
select cron.schedule('pipeline_sla', '0 * * * *', 'select public.pipeline_sla()');
select cron.schedule('sent_back_reminder', '0 8 * * *', 'select public.sent_back_reminder()');
select cron.schedule('fast_lane_audit_pick', '0 7 * * 1', 'select public.select_fast_lane_audits()');
select cron.schedule('desk_lease_reaper', '*/5 * * * *', 'select public.desk_lease_reaper()');

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.pipeline_config enable row level security;
alter table public.chapter_keys enable row level security;
alter table public.paragraph_anchors enable row level security;
alter table public.anchor_migrations enable row level security;
alter table public.book_flags enable row level security;
alter table public.book_fixes enable row level security;
alter table public.send_backs enable row level security;
alter table public.revision_diffs enable row level security;
alter table public.fast_lane_audits enable row level security;

-- Is the caller the author of this revision's book?
create function public._is_revision_author(p_rev uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.book_revisions r join public.books b on b.id = r.book_id
                 where r.id = p_rev and b.author_id = auth.uid())
$$;

create policy pipeline_config_select on public.pipeline_config for select to authenticated
  using ((select public.is_staff()));
-- chapter_keys: no policy; service role only.
create policy paragraph_anchors_select on public.paragraph_anchors for select to authenticated
  using (exists (select 1 from public.book_revisions r where r.id = revision_id));
create policy anchor_migrations_select on public.anchor_migrations for select to authenticated
  using ((select public.is_staff('publisher')));
create policy book_flags_select on public.book_flags for select to authenticated
  using ((select public.is_staff_any(array['publisher', 'operations_admin']::public.staff_role[]))
         or public._is_revision_author(revision_id));
create policy book_fixes_select on public.book_fixes for select to authenticated
  using ((select public.is_staff('publisher')));
create policy send_backs_select on public.send_backs for select to authenticated
  using ((select public.is_staff_any(array['publisher', 'operations_admin']::public.staff_role[]))
         or public._is_revision_author(revision_id));
create policy revision_diffs_select on public.revision_diffs for select to authenticated
  using ((select public.is_staff('publisher')));
create policy fast_lane_audits_select on public.fast_lane_audits for select to authenticated
  using ((select public.is_staff('publisher')));

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on public.pipeline_config, public.chapter_keys, public.paragraph_anchors, public.anchor_migrations,
  public.book_flags, public.book_fixes, public.send_backs, public.revision_diffs, public.fast_lane_audits
  from anon, authenticated;
grant select on public.pipeline_config, public.paragraph_anchors, public.anchor_migrations, public.book_flags,
  public.book_fixes, public.send_backs, public.revision_diffs, public.fast_lane_audits
  to authenticated;
revoke all on schema pgmq from anon, authenticated;

-- Functions: nothing is callable by default; then exactly who may call what.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        '_pipeline_defaults', '_pipeline_setting', '_threshold', '_is_service', '_has_staff_role', '_actor',
        '_require_service', '_audit', '_notify', '_lock_revision', 'has_blocking_flag', 'revision_score',
        '_rescore', '_insert_flags', '_replace_chapters', '_apply_counts', '_step', '_chapter_prices_ok',
        '_set_chapter_prices', 'author_in_good_standing', '_send_back', '_route', 'migrate_anchors',
        '_publish_now', '_fast_lane_check', 'create_revision', 'finalize_revision', 'complete_verify',
        'confirm_chapters', 'submit_revision', 'get_revision_status', 'complete_seal', 'set_chapter_prices',
        'complete_rescore', 'begin_reseal', 'record_fix', 'undo_fix', 'book_queue_read', 'book_queue_ack',
        'claim_revision', 'release_to_review', 'undo_release_to_review', 'send_back_revision', 'reject_revision',
        'publish_revision', 'revert_to_revision', 'unpublish_book', 'republish_book', 'remind_author',
        'audit_fast_lane', 'revision_links', 'desk_claim', 'desk_heartbeat', 'desk_reject_unreadable', 'publish_due',
        'pipeline_sla', 'sent_back_reminder', 'select_fast_lane_audits', 'desk_lease_reaper',
        '_is_revision_author')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

-- RLS helper used inside policies.
grant execute on function public._is_revision_author(uuid) to authenticated;

-- Authors and staff, with their own JWT.
grant execute on function
  public.create_revision(jsonb, uuid),
  public.submit_revision(uuid),
  public.get_revision_status(uuid),
  public.has_blocking_flag(uuid),
  public.revision_score(uuid)
  to authenticated, service_role;

-- Staff (own JWT), or a Worker acting for them (service role + p_actor).
grant execute on function
  public.claim_revision(uuid, text, boolean, uuid),
  public.release_to_review(uuid, uuid),
  public.undo_release_to_review(uuid, uuid),
  public.send_back_revision(uuid, jsonb, text, public.send_back_source, uuid),
  public.reject_revision(uuid, text, uuid),
  public.publish_revision(uuid, timestamptz, boolean, uuid),
  public.revert_to_revision(uuid, text, uuid),
  public.unpublish_book(uuid, public.unpublish_reason, boolean, boolean, text, uuid),
  public.republish_book(uuid, uuid),
  public.remind_author(uuid, uuid),
  public.audit_fast_lane(uuid, public.fast_lane_result, text, uuid),
  public.revision_links(uuid),
  public.desk_claim(uuid, uuid),
  public.desk_heartbeat(uuid, uuid),
  public.desk_reject_unreadable(uuid, text, uuid)
  to authenticated, service_role;

-- Workers only.
grant execute on function
  public.finalize_revision(uuid, uuid, jsonb),
  public.complete_verify(uuid, int, jsonb),
  public.confirm_chapters(uuid, uuid, jsonb),
  public.complete_seal(uuid, int, jsonb),
  public.set_chapter_prices(uuid, jsonb),
  public.complete_rescore(uuid, int, uuid[], jsonb, jsonb, text[]),
  public.begin_reseal(uuid, uuid),
  public.record_fix(uuid, uuid, jsonb, jsonb, int, uuid),
  public.undo_fix(uuid, int, uuid),
  public.book_queue_read(text, int, int),
  public.book_queue_ack(text, bigint, boolean),
  public.author_in_good_standing(uuid)
  to service_role;

-- Seed the editable settings with the defaults so Settings (flow 16) shows them.
insert into public.pipeline_config (key, value)
select key, value from jsonb_each(public._pipeline_defaults());
