-- Flow 11 · Author Studio: author applications, author profiles, Studio read models, staff decisions.
-- Conversion, readiness and publishing are flow 12 (create_revision, confirm_chapters, submit_revision).
-- Earnings cycles and payouts are flow 13; this flow only reads the ledger.
--
-- The author's club lives in flow 06's `groups` (kind 'author'), created on approval with the author
-- as its owner member (see _create_club).

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.application_status as enum ('draft', 'new', 'needs_info', 'approved', 'rejected', 'withdrawn');
create type public.application_event_kind as enum (
  'submitted', 'assigned', 'info_asked', 'info_given', 'approved', 'rejected'
);
create type public.author_visibility as enum ('public', 'private');
create type public.author_status as enum ('active', 'suspended');
create type public.payee_type as enum ('individual', 'company');

-- ─── author_applications ────────────────────────────────────────────────────
create table public.author_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.application_status not null default 'draft',
  step_reached int not null default 1 check (step_reached between 1 and 4),
  legal_name text not null default '' check (char_length(legal_name) <= 80),
  email text not null default '' check (char_length(email) <= 254),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  pen_name text check (char_length(pen_name) <= 60),
  social_handle text check (char_length(social_handle) <= 80),
  -- Open question 3 default: date of birth (never public) and state are asked in step 1.
  date_of_birth date,
  state text check (char_length(state) <= 40),
  categories text[] not null default '{}',
  bio text not null default '' check (char_length(bio) <= 300),
  experience text not null default '' check (char_length(experience) <= 2000),
  sample_file_key text,
  sample_file_name text check (char_length(sample_file_name) <= 200),
  sample_text text check (char_length(sample_text) <= 30000),
  sample_pages int check (sample_pages between 1 and 10),
  -- Plain text of the uploaded file's opening, for the reviewer's excerpt and the similarity check.
  sample_excerpt text check (char_length(sample_excerpt) <= 4000),
  agreement_version int,
  agreement_accepted_at timestamptz,
  submitted_at timestamptz,
  assigned_to uuid references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 1000),
  reapply_after date,
  info_request text check (char_length(info_request) <= 1000),
  info_step int check (info_step between 1 and 4),
  checks jsonb not null default '{}',
  sla_alerted_at timestamptz,
  legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sample_file_key is null or sample_file_key like 'applications/' || user_id::text || '/%')
);
-- One open application per user.
create unique index author_applications_open_idx on public.author_applications (user_id)
  where status in ('draft', 'new', 'needs_info');
create index author_applications_queue_idx on public.author_applications (status, submitted_at);
create trigger author_applications_updated_at before update on public.author_applications
  for each row execute function public.set_updated_at();

create table public.author_application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.author_applications (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  kind public.application_event_kind not null,
  note text,
  created_at timestamptz not null default now()
);
create index author_application_events_app_idx on public.author_application_events (application_id, created_at);
create trigger author_application_events_no_update before update or delete on public.author_application_events
  for each row execute function public.reject_change();

-- ─── author_profiles ────────────────────────────────────────────────────────
create table public.author_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pen_name text not null check (char_length(btrim(pen_name)) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 300),
  photo_url text check (char_length(photo_url) <= 500),
  location text check (char_length(location) <= 60),
  visibility public.author_visibility not null default 'public',
  status public.author_status not null default 'active',
  suspended_reason text,
  approved_at timestamptz not null default now(),
  application_id uuid references public.author_applications (id),
  club_group_id uuid references public.groups (id) on delete set null,
  -- Payee and payout fields are owned by flow 13.
  payee_type public.payee_type not null default 'individual',
  legal_name text not null default '',
  payouts_paused boolean not null default false,
  payouts_paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger author_profiles_updated_at before update on public.author_profiles
  for each row execute function public.set_updated_at();

select pgmq.create('application_checks');
select pgmq.create('author_notify');

-- ─── Helpers ────────────────────────────────────────────────────────────────
create function public._agreement_version() returns int
language sql immutable set search_path = '' as $$ select 1 $$;

create function public._author_notify(p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  select pgmq.send('author_notify', jsonb_build_object('kind', p_kind) || p_payload);
$$;

create function public._app_event(p_app uuid, p_actor uuid, p_kind public.application_event_kind,
                                  p_note text default null) returns void
language sql security definer set search_path = '' as $$
  insert into public.author_application_events (application_id, actor_id, kind, note)
  values (p_app, p_actor, p_kind, p_note);
$$;

-- Creates the author's club (flow 06 group, kind 'author') with the author as its owner member.
create function public._create_club(p_owner uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.groups (kind, name, owner_id)
  values ('author', left(split_part(btrim(p_name), ' ', 1), 48) || '’s Readers', p_owner)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, p_owner, 'owner');
  return v_id;
end $$;

-- What an applicant may see of their own application: no review internals (checks, SLA alert,
-- legacy flag), so a resubmission can't be tuned against the duplicate or similarity checks.
create function public._applicant_view(v public.author_applications) returns public.author_applications
language plpgsql immutable set search_path = '' as $$
begin
  if v.id is not null then
    v.checks := '{}';
    v.sla_alerted_at := null;
    v.legacy := false;
  end if;
  return v;
end $$;

-- The open application of the caller, locked.
create function public._my_open_application() returns public.author_applications
language plpgsql security definer set search_path = '' as $$
declare
  v public.author_applications;
begin
  select * into v from public.author_applications
  where user_id = auth.uid() and status in ('draft', 'new', 'needs_info')
  for update;
  return v;
end $$;

-- Automated checks (rule 10). Similarity is filled in by the application_checks Worker.
create function public._application_checks(p_app uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.author_applications;
  u auth.users;
  v_dup int;
  v_age int;
begin
  select * into a from public.author_applications where id = p_app;
  select * into u from auth.users where id = a.user_id;
  select count(distinct x.user_id) into v_dup
  from public.author_applications x
  where x.user_id <> a.user_id
    and (lower(x.email) = lower(a.email)
         or (a.phone is not null and x.phone = a.phone)
         or (a.legal_name <> '' and lower(btrim(x.legal_name)) = lower(btrim(a.legal_name))));
  v_age := extract(year from age(current_date, a.date_of_birth))::int;
  return jsonb_build_object(
    'email_verified', u.email_confirmed_at is not null and lower(u.email) = lower(a.email),
    'phone_verified', a.phone is not null and u.phone_confirmed_at is not null
                      and '+' || ltrim(u.phone, '+') = a.phone,
    'duplicate', v_dup > 0,
    'duplicate_count', v_dup,
    'similarity_pct', (a.checks ->> 'similarity_pct')::numeric,
    'age', v_age,
    'age_ok', v_age is not null and v_age >= 18
  );
end $$;

-- ─── Applicant RPCs ─────────────────────────────────────────────────────────
-- Opens (or returns) the caller's application, prefilled from the account (rule 3).
create function public.start_application() returns public.author_applications
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v public.author_applications;
  v_last public.author_applications;
  p public.profiles;
begin
  if v_uid is null then
    raise exception 'start_application: sign in first' using errcode = 'insufficient_privilege';
  end if;
  select * into p from public.profiles where id = v_uid;
  if p.is_author then
    raise exception 'already_author' using errcode = 'P0001';
  end if;
  v := public._my_open_application();
  if v.id is not null then
    return public._applicant_view(v);
  end if;
  select * into v_last from public.author_applications
  where user_id = v_uid and status = 'rejected' order by decided_at desc limit 1;
  if v_last.id is not null and (v_last.reapply_after is null or v_last.reapply_after > current_date) then
    raise exception 'reapply_locked' using errcode = 'P0001',
      detail = jsonb_build_object('reapply_after', v_last.reapply_after)::text;
  end if;
  insert into public.author_applications (user_id, legal_name, email, phone, date_of_birth)
  values (v_uid, coalesce(p.full_name, ''), coalesce((select email from auth.users where id = v_uid), ''),
          p.phone, p.date_of_birth)
  returning * into v;
  return public._applicant_view(v);
end $$;

-- Saves fields of the open draft (debounced autosave and Save draft). Unknown keys are ignored;
-- keys present with null clear the field. Last save wins per field.
create function public.save_application_draft(p_patch jsonb) returns public.author_applications
language plpgsql security definer set search_path = '' as $$
declare
  v public.author_applications;
  v_cats text[];
  v_allowed constant text[] := array['Christian fiction', 'Clean romance', 'African stories', 'Poetry',
                                     'Devotionals', 'Non-fiction', 'Short stories'];
begin
  v := public._my_open_application();
  if v.id is null then
    raise exception 'no_application' using errcode = 'P0001';
  end if;
  if v.status not in ('draft', 'needs_info') then
    raise exception 'application_sent' using errcode = 'P0001';
  end if;
  if p_patch ? 'categories' then
    select coalesce(array_agg(distinct c), '{}') into v_cats
    from jsonb_array_elements_text(coalesce(nullif(p_patch -> 'categories', 'null'), '[]')) c;
    if not v_cats <@ v_allowed then
      raise exception 'bad_category' using errcode = 'P0001';
    end if;
  end if;
  update public.author_applications set
    legal_name = case when p_patch ? 'legal_name' then coalesce(btrim(p_patch ->> 'legal_name'), '') else legal_name end,
    email = case when p_patch ? 'email' then coalesce(lower(btrim(p_patch ->> 'email')), '') else email end,
    phone = case when p_patch ? 'phone' then nullif(btrim(p_patch ->> 'phone'), '') else phone end,
    pen_name = case when p_patch ? 'pen_name' then nullif(btrim(p_patch ->> 'pen_name'), '') else pen_name end,
    social_handle = case when p_patch ? 'social_handle' then nullif(btrim(p_patch ->> 'social_handle'), '') else social_handle end,
    date_of_birth = case when p_patch ? 'date_of_birth' then (p_patch ->> 'date_of_birth')::date else date_of_birth end,
    state = case when p_patch ? 'state' then nullif(btrim(p_patch ->> 'state'), '') else state end,
    categories = case when p_patch ? 'categories' then v_cats else categories end,
    bio = case when p_patch ? 'bio' then coalesce(p_patch ->> 'bio', '') else bio end,
    experience = case when p_patch ? 'experience' then coalesce(p_patch ->> 'experience', '') else experience end,
    sample_text = case when p_patch ? 'sample_text' then nullif(btrim(p_patch ->> 'sample_text'), '') else sample_text end,
    -- Removing the file is allowed here; attaching one goes through the Worker (set_application_sample).
    sample_file_key = case when p_patch ? 'sample_file_key' and p_patch -> 'sample_file_key' = 'null'::jsonb
                           then null else sample_file_key end,
    sample_file_name = case when p_patch ? 'sample_file_key' and p_patch -> 'sample_file_key' = 'null'::jsonb
                            then null else sample_file_name end,
    sample_pages = case when p_patch ? 'sample_file_key' and p_patch -> 'sample_file_key' = 'null'::jsonb
                        then null else sample_pages end,
    sample_excerpt = case when p_patch ? 'sample_file_key' and p_patch -> 'sample_file_key' = 'null'::jsonb
                          then null else sample_excerpt end,
    step_reached = greatest(step_reached, least(4, coalesce((p_patch ->> 'step')::int, step_reached)))
  where id = v.id
  returning * into v;
  return public._applicant_view(v);
end $$;

-- Called by the api Worker after it checked the uploaded sample in R2 (type, size, pages).
create function public.set_application_sample(p_user uuid, p_key text, p_name text, p_pages int,
                                              p_excerpt text default null)
returns public.author_applications
language plpgsql security definer set search_path = '' as $$
declare
  v public.author_applications;
begin
  perform public._require_service('set_application_sample');
  update public.author_applications set
    sample_file_key = p_key, sample_file_name = left(p_name, 200), sample_pages = p_pages,
    sample_excerpt = left(p_excerpt, 4000)
  where user_id = p_user and status in ('draft', 'needs_info')
  returning * into v;
  if v.id is null then
    raise exception 'no_application' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Send application (rule 6). Resending after Ask for info restarts the review clock (rule 9).
create function public.submit_application(p_accept_terms boolean) returns public.author_applications
language plpgsql security definer set search_path = '' as $$
declare
  v public.author_applications;
  v_missing text[] := '{}';
  v_resend boolean;
begin
  v := public._my_open_application();
  if v.id is null then
    raise exception 'no_application' using errcode = 'P0001';
  end if;
  if v.status not in ('draft', 'needs_info') then
    raise exception 'application_sent' using errcode = 'P0001';
  end if;
  if btrim(v.legal_name) = '' then v_missing := array_append(v_missing, 'legal_name'); end if;
  if v.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_missing := array_append(v_missing, 'email'); end if;
  if v.date_of_birth is null then v_missing := array_append(v_missing, 'date_of_birth'); end if;
  if v.state is null then v_missing := array_append(v_missing, 'state'); end if;
  if cardinality(v.categories) = 0 then v_missing := array_append(v_missing, 'categories'); end if;
  if btrim(v.bio) = '' then v_missing := array_append(v_missing, 'bio'); end if;
  if v.sample_file_key is null and v.sample_text is null then v_missing := array_append(v_missing, 'sample'); end if;
  if not coalesce(p_accept_terms, false) then v_missing := array_append(v_missing, 'terms'); end if;
  if cardinality(v_missing) > 0 then
    raise exception 'incomplete' using errcode = 'P0001',
      detail = jsonb_build_object('missing', to_jsonb(v_missing))::text;
  end if;
  v_resend := v.status = 'needs_info';
  update public.author_applications set
    status = 'new', step_reached = 4, submitted_at = now(), sla_alerted_at = null,
    agreement_version = public._agreement_version(), agreement_accepted_at = now()
  where id = v.id;
  update public.author_applications set checks = checks || public._application_checks(v.id)
  where id = v.id
  returning * into v;
  perform public._app_event(v.id, v.user_id, (case when v_resend then 'info_given' else 'submitted' end)::public.application_event_kind);
  perform pgmq.send('application_checks', jsonb_build_object('application_id', v.id));
  perform public._author_notify('application_received', jsonb_build_object(
    'application_id', v.id, 'user_id', v.user_id, 'resend', v_resend));
  return public._applicant_view(v);
end $$;

-- Cancel keeps the draft (rule 4); withdrawing a sent application is explicit.
create function public.withdraw_application() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.author_applications;
begin
  v := public._my_open_application();
  if v.id is null or v.status = 'draft' then
    raise exception 'no_application' using errcode = 'P0001';
  end if;
  update public.author_applications set status = 'withdrawn' where id = v.id;
end $$;

-- The Worker writes the sample similarity (and anything else it finds) into checks.
create function public.complete_application_checks(p_app uuid, p_checks jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('complete_application_checks');
  update public.author_applications set checks = checks || coalesce(p_checks, '{}')
  where id = p_app;
end $$;

-- pgmq wrappers for the Worker (application checks; author pushes are consumed by flow 15).
create function public.author_queue_read(p_queue text, p_vt int default 300, p_qty int default 10)
returns setof pgmq.message_record
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('author_queue_read');
  if p_queue not in ('application_checks', 'author_notify') then
    raise exception 'author_queue_read: unknown queue' using errcode = 'invalid_parameter_value';
  end if;
  return query select * from pgmq.read(p_queue, p_vt, p_qty);
end $$;

create function public.author_queue_ack(p_queue text, p_msg_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('author_queue_ack');
  if p_queue not in ('application_checks', 'author_notify') then
    raise exception 'author_queue_ack: unknown queue' using errcode = 'invalid_parameter_value';
  end if;
  return pgmq.archive(p_queue, p_msg_id);
end $$;

-- What the similarity check needs: this sample and other people's sent samples.
create function public.application_similarity_corpus(p_app uuid) returns table (id uuid, mine boolean, body text)
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('application_similarity_corpus');
  return query
  select a.id, a.id = p_app, coalesce(a.sample_text, a.sample_excerpt)
  from public.author_applications a
  join public.author_applications me on me.id = p_app
  where (a.id = p_app or (a.user_id <> me.user_id and a.status <> 'draft'))
    and coalesce(a.sample_text, a.sample_excerpt) is not null
  order by a.id = p_app desc, a.submitted_at desc nulls last
  limit 2001;
end $$;

-- ─── Staff RPCs ─────────────────────────────────────────────────────────────
-- Automatic checks of one application (rule 10); the column is not granted to authenticated.
create function public.admin_application_checks(p_app uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff_any(array['publisher', 'support']::public.staff_role[]) then
    raise exception 'admin_application_checks: staff only' using errcode = 'insufficient_privilege';
  end if;
  return (select checks from public.author_applications where id = p_app);
end $$;

create function public.assign_application(p_app uuid, p_staff uuid default null, p_actor uuid default null)
returns public.author_applications
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'assign_application');
  v_to uuid := coalesce(p_staff, v_actor);
  v public.author_applications;
begin
  if not public._has_staff_role(v_to, array['publisher']::public.staff_role[]) then
    raise exception 'assign_application: assignee is not a reviewer' using errcode = 'P0001';
  end if;
  update public.author_applications set assigned_to = v_to
  where id = p_app and status in ('new', 'needs_info')
  returning * into v;
  if v.id is null then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  perform public._app_event(p_app, v_actor, 'assigned',
    (select full_name from public.profiles where id = v_to));
  perform public._audit(v_actor, 'authors', 'application.assign', 'author_application', p_app::text,
    v.legal_name, null, null, jsonb_build_object('assigned_to', v_to));
  return v;
end $$;

-- Approve, ask for info or reject (rule 9). Approve is one transaction: is_author, author profile,
-- club, event, audit; push and email are queued.
create function public.decide_application(p_app uuid, p_decision text, p_reason text default null,
                                          p_info_request text default null, p_allow_reapply boolean default true,
                                          p_info_step int default 3, p_actor uuid default null)
returns public.author_applications
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'decide_application');
  v public.author_applications;
  v_before jsonb;
  v_pen text;
  v_club uuid;
begin
  select * into v from public.author_applications where id = p_app for update;
  if v.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v.status <> 'new' then
    raise exception 'not_open' using errcode = 'P0001', detail = v.status::text;
  end if;
  v_before := jsonb_build_object('status', v.status);

  if p_decision = 'approve' then
    -- legal_name allows 80 characters, pen_name 60.
    v_pen := left(btrim(coalesce(v.pen_name, v.legal_name)), 60);
    update public.profiles set is_author = true where id = v.user_id;
    insert into public.author_profiles (user_id, pen_name, bio, legal_name, application_id)
    values (v.user_id, v_pen, v.bio, v.legal_name, v.id);
    v_club := public._create_club(v.user_id, v_pen);
    update public.author_profiles set club_group_id = v_club where user_id = v.user_id;
    update public.author_applications set status = 'approved', decided_by = v_actor, decided_at = now(),
      decision_reason = p_reason
    where id = p_app returning * into v;
    perform public._app_event(p_app, v_actor, 'approved', p_reason);
    perform public._author_notify('application_approved', jsonb_build_object(
      'application_id', v.id, 'user_id', v.user_id, 'email', true));
  elsif p_decision = 'ask_info' then
    if coalesce(btrim(p_info_request), '') = '' then
      raise exception 'info_request_required' using errcode = 'P0001';
    end if;
    update public.author_applications set status = 'needs_info', info_request = btrim(p_info_request),
      info_step = coalesce(p_info_step, 3), step_reached = least(step_reached, coalesce(p_info_step, 3))
    where id = p_app returning * into v;
    perform public._app_event(p_app, v_actor, 'info_asked', p_info_request);
    perform public._author_notify('application_needs_info', jsonb_build_object(
      'application_id', v.id, 'user_id', v.user_id, 'email', true));
  elsif p_decision = 'reject' then
    if coalesce(btrim(p_reason), '') = '' then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    update public.author_applications set status = 'rejected', decided_by = v_actor, decided_at = now(),
      decision_reason = btrim(p_reason),
      reapply_after = case when coalesce(p_allow_reapply, true) then current_date + 30 end
    where id = p_app returning * into v;
    perform public._app_event(p_app, v_actor, 'rejected', p_reason);
    perform public._author_notify('application_rejected', jsonb_build_object(
      'application_id', v.id, 'user_id', v.user_id, 'email', true));
  else
    raise exception 'bad_decision' using errcode = 'P0001';
  end if;

  perform public._audit(v_actor, 'authors', 'application.' || p_decision, 'author_application', p_app::text,
    v.legal_name, null, v_before, jsonb_build_object('status', v.status, 'reapply_after', v.reapply_after),
    coalesce(p_reason, p_info_request));
  return v;
end $$;

-- Suspend author rights (Super admin or Support): hides Submit and tips, live books stay readable.
create function public.suspend_author(p_user uuid, p_reason text, p_actor uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['support']::public.staff_role[], 'suspend_author');
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  update public.author_profiles set status = 'suspended', suspended_reason = btrim(p_reason)
  where user_id = p_user and status = 'active';
  if not found then
    raise exception 'not_active_author' using errcode = 'P0001';
  end if;
  perform public._audit(v_actor, 'authors', 'author.suspend', 'author', p_user::text,
    (select pen_name from public.author_profiles where user_id = p_user), null,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'suspended'), p_reason);
  perform public._author_notify('author_suspended', jsonb_build_object('user_id', p_user));
end $$;

create function public.reinstate_author(p_user uuid, p_reason text default null, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['support']::public.staff_role[], 'reinstate_author');
begin
  update public.author_profiles set status = 'active', suspended_reason = null
  where user_id = p_user and status = 'suspended';
  if not found then
    raise exception 'not_suspended' using errcode = 'P0001';
  end if;
  perform public._audit(v_actor, 'authors', 'author.reinstate', 'author', p_user::text,
    (select pen_name from public.author_profiles where user_id = p_user), null,
    jsonb_build_object('status', 'suspended'), jsonb_build_object('status', 'active'), p_reason);
end $$;

-- Suspended authors cannot submit (flow 12 calls this from create_revision and submit_revision).
create or replace function public.author_in_good_standing(p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_author is not null and not exists (
    select 1 from public.author_profiles a where a.user_id = p_author and a.status = 'suspended'
  )
$$;

-- Club settings (rule 33), stored on the club row in flow 06's groups.
create function public.set_club_settings(p_who_can_post text, p_slow_mode_seconds int) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_club uuid;
begin
  select club_group_id into v_club from public.author_profiles where user_id = auth.uid();
  if v_club is null then
    raise exception 'club_not_ready' using errcode = 'P0001';
  end if;
  if p_slow_mode_seconds not in (0, 10, 30, 60, 300) then
    raise exception 'bad_slow_mode' using errcode = 'P0001';
  end if;
  if p_who_can_post not in ('members', 'staff', 'owner_and_followers') then
    raise exception 'bad_who_can_post' using errcode = 'P0001';
  end if;
  update public.groups
     set who_can_post = p_who_can_post::public.group_who_can_post, slow_mode_seconds = p_slow_mode_seconds
   where id = v_club and owner_id = auth.uid();
end $$;

-- ─── Studio read models ─────────────────────────────────────────────────────
-- Earnings rows for an author in [p_from, p_to): every ledger row tied to their books, tips and
-- messages, excluding their own reading. Undo and refunds carry negative earnings and net out.
create function public._author_earning_rows(p_author uuid, p_from timestamptz, p_to timestamptz)
returns table (book_id uuid, reason public.ledger_reason, credits int, earned_kobo bigint, at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.book_id, l.reason, -l.delta, l.author_earning_kobo::bigint, l.created_at
  from public.credit_ledger l
  where l.author_id = p_author and l.user_id <> p_author
    and l.reason in ('unlock_all', 'chapter', 'tip', 'message', 'undo', 'refund')
    and l.created_at >= p_from and l.created_at < p_to
$$;
-- Studio and admin read earnings per author and month (replaces flow 03's author-only index).
drop index if exists public.credit_ledger_author_idx;
create index credit_ledger_author_idx on public.credit_ledger (author_id, created_at)
  where author_id is not null;

create function public._month_start(p_month date) returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('month', coalesce(p_month, (now() at time zone 'Africa/Lagos')::date))::date)::timestamp
         at time zone 'Africa/Lagos'
$$;

-- Earnings for one calendar month (Lagos time): split upfront vs pay as you read (rule 27).
create function public._author_month(p_author uuid, p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (
    select * from public._author_earning_rows(p_author, public._month_start(p_month),
                                              public._month_start(p_month) + interval '1 month')
  )
  select jsonb_build_object(
    'month', to_char(public._month_start(p_month) at time zone 'Africa/Lagos', 'YYYY-MM'),
    'credits', coalesce(sum(credits), 0),
    'earned_kobo', coalesce(sum(earned_kobo), 0),
    'unlock_all_credits', coalesce(sum(credits) filter (where reason = 'unlock_all'), 0),
    'unlock_all_kobo', coalesce(sum(earned_kobo) filter (where reason = 'unlock_all'), 0),
    'paygo_credits', coalesce(sum(credits) filter (where reason in ('chapter', 'undo')), 0),
    'paygo_kobo', coalesce(sum(earned_kobo) filter (where reason in ('chapter', 'undo')), 0),
    'tips_credits', coalesce(sum(credits) filter (where reason in ('tip', 'message')), 0),
    'tips_kobo', coalesce(sum(earned_kobo) filter (where reason in ('tip', 'message')), 0),
    'refund_kobo', coalesce(sum(earned_kobo) filter (where reason = 'refund'), 0)
  ) from r
$$;

-- Studio home (rules 11, 12). Earnings equal studio_earnings() for the same month.
create function public.studio_home() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  a public.author_profiles;
  v_from timestamptz := public._month_start(null);
  v_month jsonb;
  v_books jsonb;
  v_counts jsonb;
  v_followers int := 0;
  v_minutes int := 0;
  v_banner boolean;
begin
  select * into a from public.author_profiles where user_id = v_uid;
  if a.user_id is null then
    raise exception 'not_author' using errcode = 'P0001';
  end if;
  v_month := public._author_month(v_uid, null);
  select coalesce(jsonb_agg(jsonb_build_object(
           'book_id', b.id, 'title', b.title, 'credits', coalesce(e.credits, 0),
           'earned_kobo', coalesce(e.kobo, 0)) order by coalesce(e.kobo, 0) desc, b.title), '[]')
  into v_books
  from public.books b
  left join (
    select book_id, sum(credits)::int as credits, sum(earned_kobo)::bigint as kobo
    from public._author_earning_rows(v_uid, v_from, v_from + interval '1 month')
    where book_id is not null group by book_id
  ) e on e.book_id = b.id
  where b.author_id = v_uid and b.status = 'live';
  select jsonb_build_object(
    'live', count(*) filter (where b.status = 'live'),
    'all', count(*),
    'in_review', count(*) filter (where exists (
      select 1 from public.book_revisions r where r.book_id = b.id
        and r.status in ('processing', 'with_desk', 'needs_fixes', 'ready_for_review'))),
    'changes_requested', count(*) filter (where exists (
      select 1 from public.book_revisions r where r.book_id = b.id and r.status = 'sent_back'
        and r.revision_no = (select max(revision_no) from public.book_revisions x where x.book_id = b.id))),
    -- Never-published books whose latest revision is still a draft (not in review or sent back).
    'drafts', count(*) filter (where b.status = 'draft' and coalesce((
      select r.status from public.book_revisions r where r.book_id = b.id
      order by r.revision_no desc limit 1), 'draft') = 'draft'))
  into v_counts
  from public.books b where b.author_id = v_uid;
  -- Follows (flows 03/08) and reading minutes (flow 04) are read when those tables exist.
  if to_regclass('public.follows') is not null then
    execute 'select count(*)::int from public.follows where followee_id = $1' into v_followers using v_uid;
  end if;
  if to_regclass('public.reading_days') is not null then
    execute 'select coalesce(sum(d.minutes), 0)::int from public.reading_days d
             join public.books b on b.id = d.book_id
             where b.author_id = $1 and d.day >= $2::date and d.user_id <> $1'
      into v_minutes using v_uid, v_from;
  end if;
  v_banner := a.approved_at > now() - interval '14 days'
              and not exists (select 1 from public.books b where b.author_id = v_uid);
  return jsonb_build_object(
    'pen_name', a.pen_name, 'status', a.status, 'suspended_reason', a.suspended_reason,
    'approved_at', a.approved_at, 'show_approval_banner', v_banner,
    'month', v_month, 'books', v_books, 'book_counts', v_counts,
    'followers', v_followers, 'minutes_read', v_minutes,
    'club_group_id', a.club_group_id, 'payouts_paused', a.payouts_paused,
    'payout_account_status', 'not_set',
    'min_payout_kobo', 100000
  );
end $$;

-- Earnings screen (rule 27): one month plus monthly history.
create function public.studio_earnings(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_history jsonb;
begin
  if not exists (select 1 from public.author_profiles where user_id = v_uid) then
    raise exception 'not_author' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(public._author_month(v_uid, m::date) order by m desc), '[]')
  into v_history
  from generate_series(
    date_trunc('month', (select approved_at from public.author_profiles where user_id = v_uid)
                        at time zone 'Africa/Lagos'),
    date_trunc('month', now() at time zone 'Africa/Lagos'),
    interval '1 month') m;
  return jsonb_build_object('month', public._author_month(v_uid, p_month), 'history', v_history,
                            'min_payout_kobo', 100000, 'kobo_per_credit', 160);
end $$;

-- My books (rules 14–16): every book with its author-facing status and the revision to act on.
create function public.studio_books() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x ->> 'updated_at' desc), '[]') from (
    select jsonb_build_object(
      'book_id', b.id, 'title', b.title, 'book_status', b.status, 'updated_at', greatest(b.updated_at, r.updated_at),
      'revision_id', r.id, 'revision_no', r.revision_no, 'revision_status', r.status, 'draft_step', r.draft_step,
      'price_credits', coalesce(r.price_credits, cur.price_credits), 'live_revision_no', cur.revision_no,
      'chapters', (select count(*) from public.chapters c where c.revision_id = coalesce(cur.id, r.id)),
      'author_status',
        case
          when b.status = 'taken_down' then 'taken_down'
          when b.status = 'rejected' or r.status = 'rejected' then 'rejected'
          when r.status = 'sent_back' then 'changes_requested'
          when r.status in ('processing', 'with_desk', 'needs_fixes', 'ready_for_review') then
            case when b.status = 'live' then 'update_in_review' else 'in_review' end
          when r.status = 'draft' then case when b.status = 'live' then 'update_draft' else 'draft' end
          when b.status = 'scheduled' then 'scheduled'
          when b.status = 'unpublished' then 'unpublished'
          when b.status = 'live' then 'live'
          else 'draft'
        end,
      'issues', (select coalesce(jsonb_agg(f.message order by f.created_at), '[]')
                 from public.book_flags f where f.revision_id = r.id and f.status = 'open'),
      'unpublish_reason', b.unpublish_reason
    ) as x
    from public.books b
    join lateral (select * from public.book_revisions r where r.book_id = b.id
                  order by r.revision_no desc limit 1) r on true
    left join public.book_revisions cur on cur.id = b.current_revision_id
    where b.author_id = auth.uid()
  ) t
$$;

-- ─── Admin read models ──────────────────────────────────────────────────────
create function public.admin_authors() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_last date := (date_trunc('month', now() at time zone 'Africa/Lagos') - interval '1 month')::date;
begin
  if not public.is_staff_any(array['publisher', 'finance', 'support', 'operations_admin', 'analyst']::public.staff_role[]) then
    raise exception 'admin_authors: staff only' using errcode = 'insufficient_privilege';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', a.user_id, 'pen_name', a.pen_name, 'photo_url', a.photo_url, 'status', a.status,
      'approved_at', a.approved_at, 'payouts_paused', a.payouts_paused, 'club_group_id', a.club_group_id,
      'payout_account_status', 'not_set',
      'books_live', (select count(*) from public.books b where b.author_id = a.user_id and b.status = 'live'),
      'genres', (select coalesce(jsonb_agg(distinct g), '[]') from public.books b, unnest(b.genres) g
                 where b.author_id = a.user_id),
      'reads', (select count(distinct e.user_id) from public.entitlements e join public.books b on b.id = e.book_id
                where b.author_id = a.user_id and e.user_id <> a.user_id and e.revoked_at is null),
      'last_month_kobo', (public._author_month(a.user_id, v_last) ->> 'earned_kobo')::bigint
    ) order by a.pen_name), '[]')
    from public.author_profiles a
  );
end $$;

create function public.admin_author(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.author_profiles;
  v_history jsonb;
begin
  if not public.is_staff_any(array['publisher', 'finance', 'support', 'operations_admin', 'analyst']::public.staff_role[]) then
    raise exception 'admin_author: staff only' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.author_profiles where user_id = p_user;
  if a.user_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(public._author_month(p_user, m::date) order by m desc), '[]') into v_history
  from generate_series(date_trunc('month', a.approved_at at time zone 'Africa/Lagos'),
                       date_trunc('month', now() at time zone 'Africa/Lagos'), interval '1 month') m;
  return jsonb_build_object(
    'profile', to_jsonb(a) - case when public.is_staff_any(array['finance']::public.staff_role[])
                                  then '{}'::text[] else array['legal_name', 'payee_type'] end,
    'full_name', (select full_name from public.profiles where id = p_user),
    'books', (select coalesce(jsonb_agg(jsonb_build_object(
                'book_id', b.id, 'title', b.title, 'status', b.status,
                'price_credits', r.price_credits) order by b.created_at desc), '[]')
              from public.books b left join public.book_revisions r on r.id = b.current_revision_id
              where b.author_id = p_user),
    'months', v_history,
    'reads', (select count(distinct e.user_id) from public.entitlements e join public.books b on b.id = e.book_id
              where b.author_id = p_user and e.user_id <> p_user and e.revoked_at is null),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'summary', l.summary)
                 order by l.at desc), '[]')
               from (select * from public.audit_log where object_type in ('author', 'book')
                       and (object_id = p_user::text or object_id in
                            (select id::text from public.books where author_id = p_user))
                     order by at desc limit 10) l)
  );
end $$;

-- ─── Cron ───────────────────────────────────────────────────────────────────
-- Review promise is 5 days in admin (open question 2): flag late ones once and alert publishers.
create function public.application_sla() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  with late as (
    update public.author_applications set sla_alerted_at = now()
    where status = 'new' and submitted_at < now() - interval '5 days' and sla_alerted_at is null
    returning id
  )
  select count(*) into v_n from late;
  if v_n > 0 then
    perform public._author_notify('application_sla', jsonb_build_object('count', v_n, 'role', 'publisher'));
  end if;
  return v_n;
end $$;

-- Drafts older than 90 days go (rule 4); abandoned book drafts with no file after 30 days go.
create function public.draft_cleanup() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.author_applications where status = 'draft' and updated_at < now() - interval '90 days';
  delete from public.books b
  where b.status = 'draft' and b.current_revision_id is null
    and b.created_at < now() - interval '30 days'
    and not exists (select 1 from public.book_revisions r where r.book_id = b.id
                    and (r.source_key is not null or r.status <> 'draft'));
end $$;

select cron.schedule('application_sla', '0 * * * *', 'select public.application_sla()');
select cron.schedule('draft_cleanup', '30 3 * * *', 'select public.draft_cleanup()');

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.author_applications enable row level security;
alter table public.author_application_events enable row level security;
alter table public.author_profiles enable row level security;

-- Applicants read their own; writes go through RPCs (draft and needs_info only).
create policy author_applications_select on public.author_applications for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.is_staff_any(array['publisher', 'support']::public.staff_role[])));
create policy author_application_events_select on public.author_application_events for select to authenticated
  using ((select public.is_staff_any(array['publisher', 'support']::public.staff_role[]))
         or exists (select 1 from public.author_applications a
                    where a.id = application_id and a.user_id = (select auth.uid())));
-- Author profiles: public ones for every signed-in reader, own row, staff. Payee fields stay in the
-- table but are only selectable by the owner and staff (column grants below).
create policy author_profiles_select on public.author_profiles for select to authenticated
  using (visibility = 'public' or user_id = (select auth.uid()) or (select public.is_staff()));
create policy author_profiles_update_own on public.author_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on public.author_applications, public.author_application_events, public.author_profiles
  from anon, authenticated;
-- Review internals (checks, sla_alerted_at, legacy) stay server-side; staff read checks through
-- admin_application_checks.
grant select (id, user_id, status, step_reached, legal_name, email, phone, pen_name, social_handle,
              date_of_birth, state, categories, bio, experience, sample_file_key, sample_file_name,
              sample_text, sample_pages, sample_excerpt, agreement_version, agreement_accepted_at,
              submitted_at, assigned_to, decided_by, decided_at, decision_reason, reapply_after,
              info_request, info_step, created_at, updated_at)
  on public.author_applications to authenticated;
grant select on public.author_application_events to authenticated;
grant select (user_id, pen_name, bio, photo_url, location, visibility, status, approved_at, club_group_id)
  on public.author_profiles to authenticated;
-- Authors edit only these columns; status and payout fields are server-only.
grant update (pen_name, bio, photo_url, location, visibility) on public.author_profiles to authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        '_agreement_version', '_author_notify', '_app_event', '_create_club', '_my_open_application',
        '_applicant_view', 'admin_application_checks',
        '_application_checks', 'start_application', 'save_application_draft', 'set_application_sample',
        'submit_application', 'withdraw_application', 'complete_application_checks', 'assign_application',
        'author_queue_read', 'author_queue_ack', 'application_similarity_corpus',
        'decide_application', 'suspend_author', 'reinstate_author', 'author_in_good_standing',
        'set_club_settings', '_author_earning_rows', '_month_start', '_author_month', 'studio_home',
        'studio_earnings', 'studio_books', 'admin_authors', 'admin_author', 'application_sla', 'draft_cleanup')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

-- Applicants and authors, with their own JWT.
grant execute on function
  public.start_application(),
  public.save_application_draft(jsonb),
  public.submit_application(boolean),
  public.withdraw_application(),
  public.set_club_settings(text, int),
  public.studio_home(),
  public.studio_earnings(date),
  public.studio_books()
  to authenticated;

-- Staff (own JWT), or a Worker acting for them.
grant execute on function
  public.admin_application_checks(uuid),
  public.assign_application(uuid, uuid, uuid),
  public.decide_application(uuid, text, text, text, boolean, int, uuid),
  public.suspend_author(uuid, text, uuid),
  public.reinstate_author(uuid, text, uuid),
  public.admin_authors(),
  public.admin_author(uuid)
  to authenticated, service_role;

-- Workers only.
grant execute on function
  public.set_application_sample(uuid, text, text, int, text),
  public.complete_application_checks(uuid, jsonb),
  public.author_queue_read(text, int, int),
  public.author_queue_ack(text, bigint),
  public.application_similarity_corpus(uuid)
  to service_role;

-- Called from flow 12 functions (security definer, owned by postgres): no client grant needed.
