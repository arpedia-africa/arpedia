-- Flow 14 · Trust, safety and support. Builds the report queue and decisions on flow 06's
-- `reports`, plus sanctions (enforced in post_block_for and at sign-in), safety rules, appeals,
-- copyright claims, the support inbox, help articles and staff returns of chapter charges.
-- Content types whose tables belong to later flows (reviews, discussion and post comments, author
-- posts: flows 03, 04, 08) are refused by create_report until those flows extend _report_target.

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.moderation_action_kind as enum (
  'keep', 'remove', 'mark_spoiler', 'warn', 'mute', 'suspend', 'ban', 'lock_chat', 'restore'
);
create type public.sanction_kind as enum ('warn', 'mute', 'suspend', 'ban');
create type public.sanction_state as enum ('pending', 'active', 'ended', 'overturned');
create type public.appeal_subject as enum ('sanction', 'application', 'book_rejection', 'content_removal');
create type public.appeal_status as enum ('new', 'in_review', 'upheld', 'reduced', 'overturned');
create type public.claim_type as enum ('copyright', 'plagiarism', 'impersonation');
create type public.claim_status as enum ('new', 'waiting_on_author', 'upheld', 'rejected');
create type public.ticket_channel as enum ('email', 'app');
create type public.ticket_category as enum ('billing', 'book_access', 'account', 'author_help', 'bug', 'other');
create type public.ticket_status as enum ('open', 'waiting_on_reader', 'solved');
create type public.ticket_message_kind as enum ('reader', 'staff', 'note');
create type public.help_category as enum (
  'getting_started', 'credits_plans', 'reading', 'community', 'authors', 'account_privacy'
);
create type public.credit_return_reason as enum ('skipped_ahead', 'did_not_open', 'wrong_book');
create type public.credit_return_state as enum ('done', 'pending_approval', 'declined');

-- Outbox for reporter/sanction notices, staff alerts, ticket email and live pushes to the chat
-- Durable Object. Flow 15 delivers notices; the api Worker drains `live` and `email` items.
select pgmq.create('trust_notify');

create function public._trust_notify(p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  select pgmq.send('trust_notify', jsonb_build_object('kind', p_kind, 'at', now()) || p_payload);
$$;

-- ─── Safety rules ───────────────────────────────────────────────────────────
create table public.automod_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.automod_settings (key, value) values
  ('severity', '{"hate":"high","sexual":"high","violence":"high","self_harm":"high","spam":"medium","harassment":"medium","impersonation":"medium","copyright":"medium","spoilers":"low","other":"low"}'),
  ('auto_hide_threshold', '3'),
  ('hide_at_one_reasons', '["violence","sexual"]'),
  ('reports_per_day', '20'),
  ('reporter_min_age_hours', '24'),
  ('spam_suspend_reports', '6'),
  ('promise_hours', '{"high":24,"medium":72,"low":72}'),
  ('links', '{"block_new_accounts_days":7,"block_dm_links_to_authors":true,"allowed_domains":["arpedia.africa"]}'),
  ('rate_limits', '{"messages_per_minute":20,"dms_per_day":50,"reports_per_day":20}'),
  ('new_accounts', '{"no_room_posts_days":7,"review_wait_days":3}'),
  ('spam', '{"identical_messages":3,"identical_window_minutes":5,"cross_channel":5,"cross_channel_window_minutes":60,"phone_numbers":"hide_and_ask"}');

create table public.automod_words (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 1 and 80),
  is_phrase boolean not null default false,
  category text not null default 'abuse',
  scope text not null default 'everywhere' check (scope in ('everywhere', 'chat_dms', 'reviews')),
  action text not null default 'hide' check (action in ('hide', 'hide_and_report', 'blur', 'warn')),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (text, scope)
);

-- Rule hits reported by the moderate-text Worker (for "hits in 7 days").
create table public.automod_hits (
  word_id uuid not null references public.automod_words (id) on delete cascade,
  at timestamptz not null default now()
);
create index automod_hits_word_idx on public.automod_hits (word_id, at desc);

create function public.automod_value(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.automod_settings where key = p_key
$$;

-- ─── reports: the queue's extra columns ─────────────────────────────────────
alter table public.reports
  add column eligible boolean not null default true,
  add column brigading boolean not null default false,
  add column staff_only boolean not null default false,
  add column decided_by uuid references public.profiles (id),
  add column late_alerted_at timestamptz,
  add column reported_at timestamptz;
create index reports_content_idx on public.reports (content_type, content_id);
create index reports_user_idx on public.reports (reported_user_id, created_at desc);
create index reports_reporter_day_idx on public.reports (reporter_id, created_at desc);

-- ─── moderation_actions, user_sanctions ─────────────────────────────────────
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  content_ref jsonb,
  action public.moderation_action_kind not null,
  duration_days int check (duration_days > 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  internal_note text check (char_length(internal_note) <= 2000),
  message_to_user text check (char_length(message_to_user) <= 2000),
  decided_by uuid references public.profiles (id),
  confirmed_by uuid references public.profiles (id),
  expires_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_actions_report_idx on public.moderation_actions (report_id);
create index moderation_actions_target_idx on public.moderation_actions (target_user_id, created_at desc);

create table public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.sanction_kind not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  action_id uuid references public.moderation_actions (id) on delete set null,
  state public.sanction_state not null default 'active',
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index user_sanctions_user_idx on public.user_sanctions (user_id, state);

-- ─── appeals ────────────────────────────────────────────────────────────────
create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject_type public.appeal_subject not null,
  subject_id uuid not null,
  original_decider uuid references public.profiles (id),
  text text not null check (char_length(btrim(text)) between 1 and 1000),
  status public.appeal_status not null default 'new',
  reduce_to_days int check (reduce_to_days > 0),
  decided_by uuid references public.profiles (id),
  decision_note text check (char_length(decision_note) <= 2000),
  due_at timestamptz not null default (now() + interval '3 days'),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (decided_by is null or original_decider is null or decided_by <> original_decider)
);
create unique index appeals_open_idx on public.appeals (subject_type, subject_id)
  where status in ('new', 'in_review');
create index appeals_user_idx on public.appeals (user_id, created_at desc);

-- ─── copyright_claims ───────────────────────────────────────────────────────
create sequence public.claim_ref_seq start 400;
create table public.copyright_claims (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('CLM-' || lpad(nextval('public.claim_ref_seq')::text, 4, '0')),
  book_id uuid not null references public.books (id),
  report_id uuid references public.reports (id) on delete set null,
  claimant_id uuid references public.profiles (id) on delete set null,
  claimant_name text not null,
  claimant_contact text,
  type public.claim_type not null default 'copyright',
  details text check (char_length(details) <= 4000),
  evidence jsonb not null default '[]',
  similarity jsonb,
  author_response text check (char_length(author_response) <= 4000),
  status public.claim_status not null default 'new',
  author_due_at timestamptz,
  due_at timestamptz not null default (now() + interval '7 days'),
  decided_by uuid references public.profiles (id),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index copyright_claims_book_idx on public.copyright_claims (book_id);

-- A book held for a claim: out of Discover, author earnings frozen (flow 13 reads this).
alter table public.books add column claim_hold_at timestamptz;

-- ─── support ────────────────────────────────────────────────────────────────
create sequence public.ticket_ref_seq start 3300;
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('TKT-' || nextval('public.ticket_ref_seq')),
  user_id uuid references public.profiles (id) on delete set null,
  email text,
  channel public.ticket_channel not null,
  category public.ticket_category not null default 'other',
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  status public.ticket_status not null default 'open',
  assignee_id uuid references public.profiles (id),
  book_id uuid references public.books (id),
  context jsonb,
  first_reply_due_at timestamptz not null default (now() + interval '24 hours'),
  first_replied_at timestamptz,
  solved_at timestamptz,
  reopen_until timestamptz,
  linked_ticket_id uuid references public.support_tickets (id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (user_id is not null or email is not null)
);
create index support_tickets_status_idx on public.support_tickets (status, first_reply_due_at);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);

create table public.support_macros (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(body) between 1 and 4000),
  category public.ticket_category,
  variables text[] not null default '{}',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  kind public.ticket_message_kind not null,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 20000),
  macro_id uuid references public.support_macros (id) on delete set null,
  email_message_id text,
  attachments jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);
create unique index ticket_messages_email_idx on public.ticket_messages (email_message_id)
  where email_message_id is not null;

-- ─── help articles ──────────────────────────────────────────────────────────
create table public.help_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category public.help_category not null,
  shows_in text[] not null default '{app,web}' check (shows_in <@ array['app', 'web'] and cardinality(shows_in) > 0),
  current_version_id uuid,
  state text not null default 'draft' check (state in ('draft', 'published')),
  related uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger help_articles_updated_at before update on public.help_articles
  for each row execute function public.set_updated_at();

create table public.help_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.help_articles (id) on delete cascade,
  number int not null check (number > 0),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(body) <= 50000),
  edited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (article_id, number)
);
alter table public.help_articles add foreign key (current_version_id)
  references public.help_article_versions (id) on delete set null;

create table public.help_votes (
  article_id uuid not null references public.help_articles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  helpful boolean not null,
  at timestamptz not null default now(),
  primary key (article_id, user_id)
);
create table public.help_views (
  article_id uuid not null references public.help_articles (id) on delete cascade,
  at timestamptz not null default now()
);
create index help_views_article_idx on public.help_views (article_id, at desc);

-- ─── credit_returns ─────────────────────────────────────────────────────────
create table public.credit_returns (
  id uuid primary key default gen_random_uuid(),
  ledger_id bigint not null unique references public.credit_ledger (id),
  user_id uuid not null references public.profiles (id),
  book_id uuid references public.books (id),
  chapter_id uuid references public.chapters (id),
  credits int not null check (credits > 0),
  reason public.credit_return_reason not null,
  requested_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  state public.credit_return_state not null,
  return_txn_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index credit_returns_user_idx on public.credit_returns (user_id, created_at desc);

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- Staff with two-step who hold one of the roles (Super admin always passes).
create function public._trust_staff(p_roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.staff_mfa_ok() and public.is_staff_any(p_roles)
$$;

create function public._require_trust_staff(p_roles public.staff_role[], p_fn text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._trust_staff(p_roles) then
    raise exception '%: not allowed', p_fn using errcode = 'insufficient_privilege';
  end if;
  return auth.uid();
end $$;

-- Who decides reports: Moderator, Operations admin, Super admin. Who reads the queue: those
-- plus Support (escalate only).
create function public.can_moderate() returns boolean
language sql stable security definer set search_path = '' as $$
  select public._trust_staff(array['moderator', 'operations_admin']::public.staff_role[])
$$;
create function public.can_read_reports() returns boolean
language sql stable security definer set search_path = '' as $$
  select public._trust_staff(array['moderator', 'operations_admin', 'support']::public.staff_role[])
$$;
create function public.can_support() returns boolean
language sql stable security definer set search_path = '' as $$
  select public._trust_staff(array['support', 'operations_admin']::public.staff_role[])
$$;

create function public._is_active_staff(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_roles s where s.user_id = p_user and s.active)
$$;

create function public._staff_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select nullif(full_name, '') from public.profiles where id = p_user), 'Another staff member')
$$;

-- Severity of a reason from the safety settings (rule 4), falling back to flow 06's mapping.
create function public.report_severity_setting(p_reason public.report_reason) returns public.report_severity
language sql stable security definer set search_path = '' as $$
  select coalesce((public.automod_value('severity') ->> p_reason::text)::public.report_severity,
                  public.report_severity_for(p_reason))
$$;

create function public.report_due_at(p_severity public.report_severity, p_from timestamptz default now())
returns timestamptz
language sql stable security definer set search_path = '' as $$
  select p_from + make_interval(hours => coalesce((public.automod_value('promise_hours') ->> p_severity::text)::int,
                                                  case when p_severity = 'high' then 24 else 72 end))
$$;

-- The strongest live sanction on a user: ban > suspend > mute (warnings never block).
create function public.active_sanction(p_user uuid)
returns table (kind public.sanction_kind, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.kind, s.ends_at from public.user_sanctions s
  where s.user_id = p_user and s.state = 'active' and s.kind <> 'warn'
    and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
  order by case s.kind when 'ban' then 0 when 'suspend' then 1 else 2 end, s.ends_at desc nulls first
  limit 1
$$;

-- Sign-in follows suspensions and bans: GoTrue refuses a banned_until user and their sessions end.
create function public._sync_auth_ban(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  select * into v from public.user_sanctions s
  where s.user_id = p_user and s.state = 'active' and s.kind in ('suspend', 'ban')
    and (s.ends_at is null or s.ends_at > now())
  order by s.ends_at desc nulls first limit 1;
  update auth.users set banned_until = case when v.kind is null then null
                                            else coalesce(v.ends_at, 'infinity'::timestamptz) end
  where id = p_user;
  if v.kind is not null then
    delete from auth.sessions where user_id = p_user;
  end if;
end $$;

-- Why a person can't post right now. Flow 06's rules, with account sanctions checked first so a
-- mute, suspension or ban stops chats, rooms and DMs (the Durable Object caches this for 60 s).
create or replace function public.post_block_for(p_group uuid, p_user uuid)
returns table (reason text, until timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  g public.groups;
  m public.group_members;
  s record;
  v_staff boolean := exists (select 1 from public.staff_roles st where st.user_id = p_user and st.active);
begin
  select * into s from public.active_sanction(p_user);
  if s.kind is not null then
    return query select case s.kind when 'mute' then 'sanction_muted' when 'suspend' then 'suspended'
                                    else 'account_banned' end, s.ends_at;
    return;
  end if;
  select * into g from public.groups where id = p_group;
  select * into m from public.group_members where group_id = p_group and user_id = p_user;
  if g.id is null or g.archived_at is not null then
    return query select 'archived', null::timestamptz;
  elsif m.user_id is null then
    return query select 'not_member', null::timestamptz;
  elsif m.banned_at is not null then
    return query select 'banned', null::timestamptz;
  elsif m.muted_until > now() then
    return query select 'muted', m.muted_until;
  elsif g.locked_until > now() and not v_staff then
    return query select 'locked', g.locked_until;
  elsif g.muted_until > now() and not v_staff then
    return query select 'channel_muted', g.muted_until;
  elsif g.who_can_post = 'staff' and not v_staff and m.role = 'member' then
    return query select 'staff_only', null::timestamptz;
  elsif g.who_can_post = 'owner_and_followers' and m.role = 'member' and not v_staff then
    return query select 'owner_only', null::timestamptz;
  elsif g.kind = 'dm' and exists (select 1 from public.group_members o
                                  where o.group_id = p_group and o.user_id <> p_user
                                    and public.has_blocked(o.user_id, p_user)) then
    return query select 'blocked', null::timestamptz;
  end if;
end $$;

-- What a report points at, checked as the reporter sees it. Later flows add their content types
-- here (review, discussion_comment, post_comment, author_post). Raises not_found when hidden.
create function public._report_target(p_type public.report_content_type, p_id uuid, p_viewer uuid)
returns table (reported_user uuid, group_id uuid, book_id uuid, snapshot jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  x public.messages;
  g public.groups;
  b public.books;
  p public.profiles;
begin
  if p_type in ('message', 'dm') then
    select * into x from public.messages where id = p_id;
    if x.id is null or x.state <> 'visible' or not public.is_group_member(x.group_id, p_viewer) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    select * into g from public.groups where id = x.group_id;
    if (g.kind = 'dm') <> (p_type = 'dm') then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select x.sender_id, x.group_id, null::uuid, jsonb_build_object(
      'body', x.body, 'quote', x.quote, 'sender_id', x.sender_id, 'sender_name', public.sender_name(x.sender_id),
      'group_name', g.name, 'group_kind', g.kind, 'created_at', x.created_at,
      -- Chat: 5 messages either side. DM: the last 50 messages of the thread (rule 6).
      'context', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'sender_id', c.sender_id,
                    'sender_name', public.sender_name(c.sender_id), 'body', c.body, 'created_at', c.created_at)
                    order by c.created_at, c.id), '[]'::jsonb)
                  from (
                    (select * from public.messages m where m.group_id = x.group_id and m.state = 'visible'
                       and g.kind <> 'dm' and (m.created_at, m.id) < (x.created_at, x.id)
                     order by m.created_at desc, m.id desc limit 5)
                    union all
                    (select * from public.messages m where m.group_id = x.group_id and m.state = 'visible'
                       and g.kind <> 'dm' and (m.created_at, m.id) > (x.created_at, x.id)
                     order by m.created_at, m.id limit 5)
                    union all
                    (select * from public.messages m where m.group_id = x.group_id and m.state <> 'deleted'
                       and g.kind = 'dm'
                     order by m.created_at desc, m.id desc limit 50)
                  ) c));
  elsif p_type = 'book' then
    select * into b from public.books where id = p_id;
    if b.id is null or (b.status <> 'live' and b.author_id <> p_viewer) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select b.author_id, null::uuid, b.id, jsonb_build_object(
      'title', b.title, 'author_name', public.sender_name(b.author_id), 'status', b.status,
      'revision_id', b.current_revision_id);
  elsif p_type = 'profile' then
    select * into p from public.profiles where id = p_id and deleted_at is null;
    if p.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    return query select p.id, null::uuid, null::uuid, jsonb_build_object(
      'full_name', p.full_name, 'username', p.username, 'bio', p.bio, 'avatar_url', p.avatar_url);
  else
    raise exception 'unsupported_content' using errcode = '0A000';
  end if;
end $$;

-- Hide, restore or remove reported content. Later flows add their content types.
create function public._set_content_state(p_type public.report_content_type, p_id uuid, p_state text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_type in ('message', 'dm') then
    update public.messages set
      state = case p_state when 'hidden' then 'auto_hidden' when 'visible' then 'visible' else 'removed' end::public.message_state,
      state_changed_at = now()
    where id = p_id and state <> 'deleted'
      and not (p_state = 'hidden' and state = 'removed');
    if p_state = 'removed' then
      insert into public.message_retained (message_id, body)
      select id, body from public.messages where id = p_id and body is not null
      on conflict (message_id) do nothing;
    end if;
  end if;
end $$;

-- Reasons allowed per content type (rule 3).
create function public.report_reasons_for(p_type public.report_content_type) returns public.report_reason[]
language sql immutable set search_path = '' as $$
  select case
    when p_type = 'book' then array['copyright', 'sexual', 'other']::public.report_reason[]
    when p_type = 'profile' then array['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm',
                                       'impersonation', 'other']::public.report_reason[]
    when p_type in ('review', 'discussion_comment') then array['spam', 'harassment', 'hate', 'sexual', 'violence',
                                       'self_harm', 'copyright', 'spoilers', 'other']::public.report_reason[]
    else array['spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'copyright', 'other']::public.report_reason[]
  end
$$;

-- ─── Reader: create_report ──────────────────────────────────────────────────
-- One report per reader per item, at most `reports_per_day` a day. Snapshots the content so staff
-- see it after an edit or delete. `p_at` is the original time of a report queued offline.
create function public.create_report(p_content_type public.report_content_type, p_content_id uuid,
                                     p_reason public.report_reason, p_details text default null,
                                     p_also_block boolean default false, p_at timestamptz default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  t record;
  v_sev public.report_severity := public.report_severity_setting(p_reason);
  v_ref text;
  v_id uuid;
  v_age_hours numeric;
  v_at timestamptz := least(greatest(coalesce(p_at, now()), now() - interval '7 days'), now());
begin
  if uid is null then
    raise exception 'create_report: sign in' using errcode = 'insufficient_privilege';
  end if;
  if not (p_reason = any (public.report_reasons_for(p_content_type))) then
    raise exception 'reason_not_allowed' using errcode = '22023';
  end if;
  if char_length(p_details) > 500 then
    raise exception 'details too long' using errcode = '22001';
  end if;
  select * into t from public._report_target(p_content_type, p_content_id, uid);
  if t.reported_user = uid then
    raise exception 'own_content' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = uid and r.created_at > now() - interval '1 day')
     >= coalesce((public.automod_value('reports_per_day'))::int, 20) then
    raise exception 'daily_limit' using errcode = '54000';
  end if;
  select extract(epoch from now() - u.created_at) / 3600 into v_age_hours from auth.users u where u.id = uid;

  begin
    insert into public.reports (reporter_id, content_type, content_id, reported_user_id, group_id, book_id,
                                reason, details, severity, due_at, snapshot, eligible, staff_only, reported_at)
    values (uid, p_content_type, p_content_id, t.reported_user, t.group_id, t.book_id, p_reason,
            nullif(btrim(p_details), ''), v_sev, public.report_due_at(v_sev, v_at), t.snapshot,
            coalesce(v_age_hours, 0) >= coalesce((public.automod_value('reporter_min_age_hours'))::int, 24),
            public._is_active_staff(t.reported_user), v_at)
    returning id, ref into v_id, v_ref;
  exception when unique_violation then
    raise exception 'already_reported' using errcode = '23505';
  end;

  -- Copyright on a book opens a claim with the reporter as claimant (rule 33).
  if p_content_type = 'book' and p_reason = 'copyright' then
    insert into public.copyright_claims (book_id, report_id, claimant_id, claimant_name, claimant_contact, type, details)
    select t.book_id, v_id, uid, coalesce(nullif(p.full_name, ''), 'Arpedia reader'), u.email, 'copyright',
           nullif(btrim(p_details), '')
    from public.profiles p join auth.users u on u.id = p.id where p.id = uid;
  end if;

  if p_also_block and t.reported_user is not null and not public._is_active_staff(t.reported_user) then
    perform public.block_user(t.reported_user, t.group_id);
  end if;
  return v_ref;
end $$;

-- Flow 06's message report now goes through the same path (auto-hide, limits, snapshot).
create or replace function public.report_message(p_message uuid, p_reason public.report_reason,
                                                 p_details text default null, p_also_block boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_kind public.group_kind;
begin
  select g.kind into v_kind from public.messages m join public.groups g on g.id = m.group_id where m.id = p_message;
  return public.create_report(case when v_kind = 'dm' then 'dm' else 'message' end::public.report_content_type,
                              p_message, p_reason, p_details, p_also_block);
end $$;

-- ─── Trigger: auto-hide, brigading, spam auto-suspend ───────────────────────
create function public.report_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
  v_threshold int := coalesce((public.automod_value('auto_hide_threshold'))::int, 3);
  v_hide_one boolean := new.reason::text in (select jsonb_array_elements_text(public.automod_value('hide_at_one_reasons')));
  v_days int;
  v_spam int;
begin
  if new.reporter_id is null or new.status <> 'open' then
    return null;
  end if;
  select count(distinct r.reporter_id), count(distinct (u.created_at at time zone 'Africa/Lagos')::date)
    into v_count, v_days
  from public.reports r join auth.users u on u.id = r.reporter_id
  where r.content_type = new.content_type and r.content_id = new.content_id and r.eligible and r.status <> 'resolved';

  if (new.eligible and v_hide_one) or v_count >= v_threshold then
    update public.reports set status = 'auto_hidden',
      -- Several reporters who all signed up on one day: possible brigading (Q84).
      brigading = brigading or (v_count >= v_threshold and v_days = 1)
    where content_type = new.content_type and content_id = new.content_id and status = 'open';
    perform public._set_content_state(new.content_type, new.content_id, 'hidden');
    perform public._trust_notify('staff_alert', jsonb_build_object('report_id', new.id, 'severity', new.severity,
      'reason', new.reason, 'auto_hidden', true));
    if new.group_id is not null then
      perform public._trust_notify('live', jsonb_build_object('group_id', new.group_id, 'message_id', new.content_id,
        'op', 'hide'));
    end if;
  elsif new.severity = 'high' then
    perform public._trust_notify('staff_alert', jsonb_build_object('report_id', new.id, 'severity', 'high'));
  end if;

  -- Spam accounts reported by 6 different readers in 7 days: suspended 24 hours pending staff.
  if new.reason = 'spam' and new.reported_user_id is not null and not public._is_active_staff(new.reported_user_id) then
    select count(distinct reporter_id) into v_spam from public.reports
    where reported_user_id = new.reported_user_id and reason = 'spam' and eligible
      and created_at > now() - interval '7 days';
    if v_spam >= coalesce((public.automod_value('spam_suspend_reports'))::int, 6)
       and not exists (select 1 from public.active_sanction(new.reported_user_id) a where a.kind in ('suspend', 'ban')) then
      insert into public.user_sanctions (user_id, kind, ends_at)
      values (new.reported_user_id, 'suspend', now() + interval '24 hours');
      perform public._sync_auth_ban(new.reported_user_id);
      perform public._trust_notify('staff_alert', jsonb_build_object('report_id', new.id, 'auto_suspended', new.reported_user_id));
    end if;
  end if;
  return null;
end $$;
create trigger report_after_insert after insert on public.reports
  for each row execute function public.report_after_insert();

-- ─── Staff: queue ───────────────────────────────────────────────────────────
create function public._report_visible_to_me(r public.reports) returns boolean
language sql stable security definer set search_path = '' as $$
  -- Reports on staff content go to Super admin only.
  select public.can_read_reports() and (not r.staff_only or public.is_staff('super_admin'))
$$;

-- Queue rows: tab open | mine | resolved | auto_hidden; quick filter by content type;
-- reason, severity, assignee filters. Order: severity, then oldest first.
create function public.admin_list_reports(p_tab text default 'open', p_type text default null,
                                          p_reason public.report_reason default null,
                                          p_severity public.report_severity default null,
                                          p_assignee uuid default null, p_limit int default 50,
                                          p_offset int default 0)
returns table (id uuid, ref text, content_type public.report_content_type, content_id uuid, quote text,
               place text, author_name text, reason public.report_reason, severity public.report_severity,
               reporters int, created_at timestamptz, due_at timestamptz, late boolean,
               status public.report_status, outcome public.report_outcome, assignee_id uuid,
               assignee_name text, escalated boolean, brigading boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_read_reports() then
    raise exception 'admin_list_reports: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  with items as (
    -- One row per reported item: the earliest report carries it, others count as reporters.
    select distinct on (r.content_type, r.content_id) r.*
    from public.reports r
    where (not r.staff_only or public.is_staff('super_admin'))
      and case p_tab
            when 'resolved' then r.status = 'resolved'
            when 'auto_hidden' then r.status = 'auto_hidden'
            when 'mine' then r.status <> 'resolved' and r.assignee_id = auth.uid()
            else r.status <> 'resolved' end
      and (p_type is null or r.content_type::text = p_type
           or (p_type = 'rooms' and r.content_type = 'message'
               and exists (select 1 from public.groups g where g.id = r.group_id and g.kind in ('room', 'readalong'))))
      and (p_reason is null or r.reason = p_reason)
      and (p_severity is null or r.severity = p_severity)
      and (p_assignee is null or r.assignee_id = p_assignee)
    order by r.content_type, r.content_id, r.created_at
  )
  select i.id, i.ref, i.content_type, i.content_id,
         left(coalesce(i.snapshot ->> 'body', i.snapshot ->> 'title', i.snapshot ->> 'full_name', ''), 200),
         coalesce(i.snapshot ->> 'group_name', i.snapshot ->> 'title', ''),
         coalesce(i.snapshot ->> 'sender_name', i.snapshot ->> 'author_name', i.snapshot ->> 'full_name'),
         i.reason, i.severity,
         (select count(*)::int from public.reports x where x.content_type = i.content_type and x.content_id = i.content_id
            and x.reporter_id is not null),
         i.created_at, i.due_at, i.status <> 'resolved' and i.due_at < now(), i.status, i.outcome, i.assignee_id,
         case when i.assignee_id is not null then public._staff_name(i.assignee_id) end,
         i.escalated_at is not null, i.brigading, count(*) over ()
  from items i
  order by case when p_tab = 'resolved' then 0 else array_position(array['high', 'medium', 'low'], i.severity::text) end,
           case when p_tab = 'resolved' then i.resolved_at end desc nulls last, i.created_at
  limit greatest(least(p_limit, 200), 1) offset greatest(p_offset, 0);
end $$;

create function public.admin_report_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._trust_staff(array['moderator', 'operations_admin', 'support', 'analyst']::public.staff_role[]) then
    raise exception 'admin_report_counts: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return (
    with items as (
      select distinct on (content_type, content_id) * from public.reports r
      where not r.staff_only or public.is_staff('super_admin')
      order by content_type, content_id, created_at)
    select jsonb_build_object(
      'open', count(*) filter (where status <> 'resolved'),
      'mine', count(*) filter (where status <> 'resolved' and assignee_id = auth.uid()),
      'resolved', count(*) filter (where status = 'resolved'),
      'auto_hidden', count(*) filter (where status = 'auto_hidden'),
      'late', count(*) filter (where status <> 'resolved' and due_at < now()),
      'high_open', count(*) filter (where status <> 'resolved' and severity = 'high'),
      'next_high_due', min(due_at) filter (where status <> 'resolved' and severity = 'high'))
    from items);
end $$;

-- Report detail: content in context, reported user card, reporters, automatic checks.
-- Opening a DM report writes an audit entry (staff see only that thread).
create function public.admin_get_report(p_report uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
  v_user uuid;
begin
  select * into r from public.reports where id = p_report;
  if r.id is null or not public._report_visible_to_me(r) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_user := r.reported_user_id;
  if r.content_type = 'dm' then
    perform public.write_audit('trust', 'report.view_dm', 'report', r.id::text, r.ref,
      'Opened a reported DM thread', null, null, null);
  end if;
  return jsonb_build_object(
    'report', to_jsonb(r) - 'snapshot',
    'snapshot', r.snapshot,
    'assignee_name', case when r.assignee_id is not null then public._staff_name(r.assignee_id) end,
    'decided_by_name', case when r.decided_by is not null then public._staff_name(r.decided_by) end,
    'late', r.status <> 'resolved' and r.due_at < now(),
    'current_state', (select m.state from public.messages m where m.id = r.content_id and r.content_type in ('message', 'dm')),
    'user', case when v_user is not null then (
      select jsonb_build_object(
        'id', p.id, 'name', public.sender_name(p.id), 'avatar_url', p.avatar_url, 'joined_at', u.created_at,
        'deleted', p.deleted_at is not null, 'is_minor', public.is_minor(p.id),
        'warnings', (select count(*) from public.user_sanctions s where s.user_id = p.id and s.kind = 'warn'
                       and s.state <> 'overturned'),
        'warnings_90d', (select count(*) from public.user_sanctions s where s.user_id = p.id and s.kind = 'warn'
                           and s.state <> 'overturned' and s.created_at > now() - interval '90 days'),
        'other_reports', (select count(*) from public.reports x where x.reported_user_id = p.id and x.id <> r.id),
        'messages_sent', (select count(*) from public.messages m where m.sender_id = p.id),
        'sanction', (select jsonb_build_object('kind', a.kind, 'ends_at', a.ends_at) from public.active_sanction(p.id) a),
        'blocked_count', (select count(*) from public.user_blocks b where b.blocker_id = p.id))
      from public.profiles p left join auth.users u on u.id = p.id where p.id = v_user) end,
    'reporters', (select coalesce(jsonb_agg(jsonb_build_object('name', public.sender_name(x.reporter_id),
                    'reason', x.reason, 'details', x.details, 'at', x.created_at, 'eligible', x.eligible)
                    order by x.created_at), '[]'::jsonb)
                  from public.reports x where x.content_type = r.content_type and x.content_id = r.content_id
                    and x.reporter_id is not null),
    'checks', jsonb_build_object(
      'links', coalesce((r.snapshot ->> 'body') ~* '(https?://|www\.)', false),
      'phone', coalesce((r.snapshot ->> 'body') ~ '(\+?234|0)[789][01]\d{8}', false),
      'new_account', coalesce((select u.created_at > r.created_at - interval '7 days' from auth.users u where u.id = v_user), false),
      'matched', (select w.text from public.automod_words w
                  where (r.snapshot ->> 'body') ~* ('\m' || regexp_replace(w.text, '([^a-zA-Z0-9 ])', '\\\1', 'g') || '\M')
                  limit 1),
      'abuse_score', least(100, (case r.severity when 'high' then 60 when 'medium' then 35 else 15 end)
                                + 10 * (select count(*)::int from public.reports x where x.content_type = r.content_type
                                          and x.content_id = r.content_id and x.reporter_id is not null))),
    'actions', (select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'by', public._staff_name(a.decided_by),
                  'at', a.created_at, 'reason', a.reason, 'duration_days', a.duration_days,
                  'confirmed', a.confirmed_by is not null) order by a.created_at), '[]'::jsonb)
                from public.moderation_actions a where a.report_id = r.id));
end $$;

create function public.assign_report(p_report uuid, p_user uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['moderator', 'operations_admin']::public.staff_role[], 'assign_report');
  r public.reports;
begin
  select * into r from public.reports where id = p_report for update;
  if r.id is null or not public._report_visible_to_me(r) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.reports set assignee_id = coalesce(p_user, v_me)
  where content_type = r.content_type and content_id = r.content_id and status <> 'resolved';
  perform public.write_audit('trust', 'report.assign', 'report', r.id::text, r.ref, 'Assigned',
    jsonb_build_object('assignee', r.assignee_id), jsonb_build_object('assignee', coalesce(p_user, v_me)), null);
end $$;

-- Escalate to Super admin (rule 12). Support may escalate too.
create function public.escalate_report(p_report uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  if not public.can_read_reports() then
    raise exception 'escalate_report: not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.reports where id = p_report for update;
  if r.id is null or not public._report_visible_to_me(r) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.reports set escalated_at = coalesce(escalated_at, now())
  where content_type = r.content_type and content_id = r.content_id and status <> 'resolved';
  perform public.write_audit('trust', 'report.escalate', 'report', r.id::text, r.ref, 'Escalated to Super admin',
    null, null, p_note);
  perform public._trust_notify('staff_alert', jsonb_build_object('report_id', r.id, 'escalated', true, 'to', 'super_admin'));
end $$;

create function public.set_report_severity(p_report uuid, p_severity public.report_severity) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  perform public._require_trust_staff(array['moderator', 'operations_admin']::public.staff_role[], 'set_report_severity');
  select * into r from public.reports where id = p_report for update;
  if r.id is null or not public._report_visible_to_me(r) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.reports set severity = p_severity, due_at = public.report_due_at(p_severity, created_at)
  where content_type = r.content_type and content_id = r.content_id and status <> 'resolved';
  perform public.write_audit('trust', 'report.severity', 'report', r.id::text, r.ref, 'Severity changed',
    jsonb_build_object('severity', r.severity), jsonb_build_object('severity', p_severity), null);
end $$;

-- Apply a sanction (shared by decisions and appeals). Ban waits for a Super admin (pending).
create function public._apply_sanction(p_user uuid, p_kind public.sanction_kind, p_days int, p_action uuid,
                                       p_pending boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.user_sanctions (user_id, kind, ends_at, action_id, state)
  values (p_user, p_kind,
          case when p_kind in ('mute', 'suspend') then now() + make_interval(days => p_days)
               when p_kind = 'warn' then now() + interval '90 days' end,
          p_action, case when p_pending then 'pending' else 'active' end::public.sanction_state)
  returning id into v_id;
  if not p_pending and p_kind in ('suspend', 'ban') then
    perform public._sync_auth_ban(p_user);
  end if;
  if not p_pending and p_kind <> 'warn' then
    perform public._trust_notify('live', jsonb_build_object('user_id', p_user, 'op', 'refresh_user'));
  end if;
  return v_id;
end $$;

-- One decision, one transaction (rule 14 to 21). p_decision: keep | remove | spoiler | action.
-- p_action (with action): warn | mute | suspend | ban. A second decider gets already_decided.
create function public.staff_decide_report(p_report uuid, p_decision text, p_action text default null,
                                           p_duration_days int default null, p_reason text default null,
                                           p_internal_note text default null, p_message_to_user text default null,
                                           p_notify_reporters boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['moderator', 'operations_admin']::public.staff_role[], 'staff_decide_report');
  r public.reports;
  v_action_id uuid;
  v_kind public.moderation_action_kind;
  v_sanction public.sanction_kind;
  v_days int;
  v_outcome public.report_outcome;
  v_warns int;
  v_reporters uuid[];
begin
  if p_decision not in ('keep', 'remove', 'spoiler', 'action') then
    raise exception 'bad_decision' using errcode = '22023';
  end if;
  if nullif(btrim(p_reason), '') is null and p_decision <> 'keep' then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into r from public.reports where id = p_report for update;
  if r.id is null or not public._report_visible_to_me(r) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status = 'resolved' then
    raise exception 'already_decided:%', public._staff_name(r.decided_by) using errcode = '40001';
  end if;
  if r.reported_user_id = v_me then
    raise exception 'own_content' using errcode = 'insufficient_privilege';
  end if;
  if p_decision = 'spoiler' and r.content_type not in ('review', 'discussion_comment') then
    raise exception 'spoiler_reviews_only' using errcode = '22023';
  end if;
  -- Lock the sibling reports on the same item so two staff can't both decide it.
  perform 1 from public.reports where content_type = r.content_type and content_id = r.content_id for update;

  if p_decision = 'action' then
    -- A deleted account still gets the action recorded; there is just nobody to sanction.
    if coalesce(p_action, '') not in ('warn', 'mute', 'suspend', 'ban') then
      raise exception 'bad_action' using errcode = '22023';
    end if;
    v_sanction := p_action::public.sanction_kind;
    v_kind := p_action::public.moderation_action_kind;
    v_days := case v_sanction when 'mute' then coalesce(p_duration_days, 7)
                              when 'suspend' then coalesce(p_duration_days, 30) end;
    v_outcome := 'actioned';
  else
    v_kind := case p_decision when 'keep' then 'keep' when 'remove' then 'remove' else 'mark_spoiler' end;
    v_outcome := case p_decision when 'keep' then 'dismissed' when 'remove' then 'removed' else 'spoiler' end;
  end if;

  insert into public.moderation_actions (report_id, target_user_id, content_ref, action, duration_days, reason,
                                         internal_note, message_to_user, decided_by, expires_at)
  values (r.id, r.reported_user_id, jsonb_build_object('type', r.content_type, 'id', r.content_id, 'group_id', r.group_id),
          v_kind, v_days, coalesce(nullif(btrim(p_reason), ''), 'No rule broken'), nullif(btrim(p_internal_note), ''),
          nullif(btrim(p_message_to_user), ''), v_me,
          case when v_days is not null then now() + make_interval(days => v_days) end)
  returning id into v_action_id;

  -- Content: keep restores, every other outcome removes (spoiler keeps it, blurred).
  perform public._set_content_state(r.content_type, r.content_id,
    case p_decision when 'keep' then 'visible' when 'spoiler' then 'spoiler' else 'removed' end);
  if r.group_id is not null and r.content_type in ('message', 'dm') then
    perform public._trust_notify('live', jsonb_build_object('group_id', r.group_id, 'message_id', r.content_id,
      'op', case when p_decision = 'keep' then 'restore' else 'remove' end));
  end if;

  if v_sanction is not null and exists (select 1 from public.profiles where id = r.reported_user_id and deleted_at is null) then
    perform public._apply_sanction(r.reported_user_id, v_sanction, v_days, v_action_id, v_sanction = 'ban');
  end if;

  select array_agg(distinct reporter_id) filter (where reporter_id is not null) into v_reporters
  from public.reports where content_type = r.content_type and content_id = r.content_id and status <> 'resolved';
  update public.reports set status = 'resolved', outcome = v_outcome, decided_by = v_me, resolved_at = now(),
    first_action_at = coalesce(first_action_at, now())
  where content_type = r.content_type and content_id = r.content_id and status <> 'resolved';

  if p_decision <> 'keep' and r.reported_user_id is not null and nullif(btrim(p_message_to_user), '') is not null then
    perform public._trust_notify('sanction_notice', jsonb_build_object('user_id', r.reported_user_id,
      'action_id', v_action_id, 'message', p_message_to_user, 'email', true));
  end if;
  if p_notify_reporters and p_decision <> 'keep' and v_reporters is not null then
    perform public._trust_notify('reporter_notice', jsonb_build_object('user_ids', to_jsonb(v_reporters),
      'message', 'We took action on your report.'));
  end if;

  perform public.write_audit('trust', 'report.decide', 'report', r.id::text, r.ref,
    format('%s%s', v_outcome, case when p_action is not null then ' · ' || p_action else '' end),
    jsonb_build_object('status', r.status),
    jsonb_build_object('outcome', v_outcome, 'action', p_action, 'days', v_days, 'action_id', v_action_id),
    p_reason);

  select count(*) into v_warns from public.user_sanctions
  where user_id = r.reported_user_id and kind = 'warn' and state <> 'overturned' and created_at > now() - interval '90 days';
  return jsonb_build_object('action_id', v_action_id, 'outcome', v_outcome,
    'group_id', r.group_id, 'message_id', case when r.content_type in ('message', 'dm') then r.content_id end,
    'user_id', r.reported_user_id, 'ban_pending', v_sanction = 'ban',
    'suggest', case when v_sanction = 'warn' and v_warns >= 3 then 'mute' end);
end $$;

-- A ban needs a Super admin who is not the decider (rule 17).
create function public.confirm_ban(p_action uuid, p_confirm boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  a public.moderation_actions;
begin
  if not (public.staff_mfa_ok() and public.is_staff('super_admin')) then
    raise exception 'confirm_ban: Super admin only' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.moderation_actions where id = p_action and action = 'ban' for update;
  if a.id is null or a.confirmed_by is not null or a.undone_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if a.decided_by = v_me then
    raise exception 'second_person' using errcode = 'insufficient_privilege';
  end if;
  if p_confirm then
    update public.moderation_actions set confirmed_by = v_me where id = a.id;
    update public.user_sanctions set state = 'active', starts_at = now() where action_id = a.id and state = 'pending';
    perform public._sync_auth_ban(a.target_user_id);
    perform public._trust_notify('live', jsonb_build_object('user_id', a.target_user_id, 'op', 'refresh_user'));
  else
    update public.moderation_actions set undone_at = now() where id = a.id;
    update public.user_sanctions set state = 'overturned' where action_id = a.id and state = 'pending';
  end if;
  perform public.write_audit('trust', case when p_confirm then 'ban.confirm' else 'ban.decline' end, 'user',
    a.target_user_id::text, public.sender_name(a.target_user_id), case when p_confirm then 'Ban confirmed' else 'Ban declined' end,
    null, jsonb_build_object('action_id', a.id), null);
end $$;

-- Bans waiting for a Super admin.
create function public.admin_pending_bans()
returns table (action_id uuid, user_id uuid, user_name text, decided_by_name text, reason text, created_at timestamptz,
               is_minor boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.target_user_id, public.sender_name(a.target_user_id), public._staff_name(a.decided_by), a.reason,
         a.created_at, public.is_minor(a.target_user_id)
  from public.moderation_actions a
  where a.action = 'ban' and a.confirmed_by is null and a.undone_at is null and public.can_moderate()
  order by a.created_at
$$;

-- ─── Safety rules RPCs ──────────────────────────────────────────────────────
create function public.admin_get_automod() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_read_reports() then
    raise exception 'admin_get_automod: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'settings', (select jsonb_object_agg(key, value) from public.automod_settings),
    'words', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'text', w.text, 'is_phrase', w.is_phrase,
                'category', w.category, 'scope', w.scope, 'action', w.action,
                'hits_7d', (select count(*) from public.automod_hits h where h.word_id = w.id and h.at > now() - interval '7 days'))
                order by w.created_at), '[]'::jsonb) from public.automod_words w),
    'can_edit', public._trust_staff(array['moderator']::public.staff_role[]));
end $$;

-- Only Moderators and Super admins edit safety rules (rule 24).
create function public.set_automod_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  perform public._require_trust_staff(array['moderator']::public.staff_role[], 'set_automod_setting');
  select value into v_before from public.automod_settings where key = p_key for update;
  if not found then
    raise exception 'unknown_setting' using errcode = '22023';
  end if;
  if jsonb_typeof(p_value) <> jsonb_typeof(v_before) then
    raise exception 'bad_value' using errcode = '22023';
  end if;
  update public.automod_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  perform public.write_audit('trust', 'automod.setting', 'automod', p_key, p_key, 'Safety rule changed', v_before, p_value, null);
  perform public._trust_notify('rules_changed', '{}'::jsonb);
end $$;

create function public.save_automod_word(p_text text, p_is_phrase boolean, p_category text, p_scope text,
                                         p_action text, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public._require_trust_staff(array['moderator']::public.staff_role[], 'save_automod_word');
  if p_id is null then
    insert into public.automod_words (text, is_phrase, category, scope, action, created_by)
    values (lower(btrim(p_text)), p_is_phrase, p_category, p_scope, p_action, auth.uid()) returning id into v_id;
  else
    update public.automod_words set text = lower(btrim(p_text)), is_phrase = p_is_phrase, category = p_category,
      scope = p_scope, action = p_action where id = p_id returning id into v_id;
  end if;
  perform public.write_audit('trust', 'automod.word', 'automod_word', v_id::text, lower(btrim(p_text)), 'Muted word saved',
    null, jsonb_build_object('scope', p_scope, 'action', p_action, 'phrase', p_is_phrase), null);
  perform public._trust_notify('rules_changed', '{}'::jsonb);
  return v_id;
end $$;

create function public.delete_automod_word(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_text text;
begin
  perform public._require_trust_staff(array['moderator']::public.staff_role[], 'delete_automod_word');
  delete from public.automod_words where id = p_id returning text into v_text;
  perform public.write_audit('trust', 'automod.word_delete', 'automod_word', p_id::text, v_text, 'Muted word removed',
    null, null, null);
  perform public._trust_notify('rules_changed', '{}'::jsonb);
end $$;

-- The moderate-text Worker's cached rules (service role) and its hit log.
create function public.get_moderation_rules() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'settings', (select jsonb_object_agg(key, value) from public.automod_settings),
    'words', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', text, 'is_phrase', is_phrase,
                'scope', scope, 'action', action)), '[]'::jsonb) from public.automod_words),
    'version', (select extract(epoch from max(updated_at))::bigint from public.automod_settings)
               + (select count(*) from public.automod_words))
$$;

create function public.record_automod_hits(p_word_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.automod_hits (word_id)
  select w.id from public.automod_words w where w.id = any (p_word_ids)
$$;

-- ─── Appeals ────────────────────────────────────────────────────────────────
-- What the caller can appeal (s-notifications / the decision message): sanctions and removals in
-- the last 14 days, and rejected books.
create function public.create_appeal(p_subject_type public.appeal_subject, p_subject_id uuid, p_text text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_at timestamptz;
  v_decider uuid;
  v_id uuid;
begin
  if uid is null then
    raise exception 'create_appeal: sign in' using errcode = 'insufficient_privilege';
  end if;
  if p_subject_type = 'sanction' then
    select s.created_at, a.decided_by into v_at, v_decider
    from public.user_sanctions s left join public.moderation_actions a on a.id = s.action_id
    where s.id = p_subject_id and s.user_id = uid and s.state in ('active', 'ended');
  elsif p_subject_type = 'content_removal' then
    select a.created_at, a.decided_by into v_at, v_decider from public.moderation_actions a
    where a.id = p_subject_id and a.target_user_id = uid and a.undone_at is null
      and a.action in ('remove', 'mark_spoiler', 'warn', 'mute', 'suspend', 'ban');
  elsif p_subject_type = 'book_rejection' then
    select rv.updated_at into v_at from public.book_revisions rv join public.books b on b.id = rv.book_id
    where rv.id = p_subject_id and b.author_id = uid and rv.status = 'rejected';
  else
    raise exception 'unsupported_subject' using errcode = '0A000';
  end if;
  if v_at is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_at < now() - interval '14 days' then
    raise exception 'appeal_window_closed' using errcode = '22023';
  end if;
  begin
    insert into public.appeals (user_id, subject_type, subject_id, original_decider, text)
    values (uid, p_subject_type, p_subject_id, v_decider, btrim(p_text)) returning id into v_id;
  exception when unique_violation then
    raise exception 'already_appealed' using errcode = '23505';
  end;
  return v_id;
end $$;

create function public.admin_list_appeals(p_status text default 'open')
returns table (id uuid, user_id uuid, user_name text, subject_type public.appeal_subject, subject_id uuid,
               summary text, original_decision text, original_decider_name text, created_at timestamptz,
               due_at timestamptz, late boolean, status public.appeal_status)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._trust_staff(array['moderator', 'operations_admin', 'publisher']::public.staff_role[]) then
    raise exception 'admin_list_appeals: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select a.id, a.user_id, public.sender_name(a.user_id), a.subject_type, a.subject_id, left(a.text, 160),
         coalesce((select coalesce(ma.action::text, '') || coalesce(' ' || ma.duration_days || ' days', '')
                   from public.user_sanctions s join public.moderation_actions ma on ma.id = s.action_id
                   where a.subject_type = 'sanction' and s.id = a.subject_id),
                  (select ma.action::text from public.moderation_actions ma
                   where a.subject_type = 'content_removal' and ma.id = a.subject_id),
                  case when a.subject_type = 'book_rejection' then 'book rejected' end),
         case when a.original_decider is not null then public._staff_name(a.original_decider) end,
         a.created_at, a.due_at, a.status in ('new', 'in_review') and a.due_at < now(), a.status
  from public.appeals a
  where case when p_status = 'decided' then a.status not in ('new', 'in_review') else a.status in ('new', 'in_review') end
  order by a.created_at;
end $$;

create function public.admin_get_appeal(p_appeal uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.appeals;
  v_action public.moderation_actions;
begin
  if not public._trust_staff(array['moderator', 'operations_admin', 'publisher']::public.staff_role[]) then
    raise exception 'admin_get_appeal: not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.appeals where id = p_appeal;
  if a.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select ma.* into v_action from public.moderation_actions ma
  where (a.subject_type = 'content_removal' and ma.id = a.subject_id)
     or (a.subject_type = 'sanction' and ma.id = (select s.action_id from public.user_sanctions s where s.id = a.subject_id));
  if a.status = 'new' and a.original_decider is distinct from auth.uid() then
    update public.appeals set status = 'in_review' where id = a.id;
    a.status := 'in_review';
  end if;
  return jsonb_build_object(
    'appeal', to_jsonb(a),
    'user_name', public.sender_name(a.user_id),
    'original_decider_name', case when a.original_decider is not null then public._staff_name(a.original_decider) end,
    'can_decide', a.original_decider is distinct from auth.uid() and a.status in ('new', 'in_review'),
    'action', to_jsonb(v_action),
    'report', (select jsonb_build_object('id', r.id, 'ref', r.ref, 'reason', r.reason, 'snapshot', r.snapshot,
                 'content_type', r.content_type)
               from public.reports r where r.id = v_action.report_id),
    'sanction', (select to_jsonb(s) from public.user_sanctions s
                 where (a.subject_type = 'sanction' and s.id = a.subject_id) or (v_action.id is not null and s.action_id = v_action.id)
                 order by s.created_at desc limit 1));
end $$;

-- Decide an appeal (rule 28): a different staff member than the original decider.
create function public.decide_appeal(p_appeal uuid, p_outcome public.appeal_status, p_reduce_to_days int default null,
                                     p_reply text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['moderator', 'operations_admin', 'publisher']::public.staff_role[], 'decide_appeal');
  a public.appeals;
  v_action public.moderation_actions;
  s public.user_sanctions;
begin
  if p_outcome not in ('upheld', 'reduced', 'overturned') then
    raise exception 'bad_outcome' using errcode = '22023';
  end if;
  select * into a from public.appeals where id = p_appeal for update;
  if a.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if a.status not in ('new', 'in_review') then
    raise exception 'already_decided:%', public._staff_name(a.decided_by) using errcode = '40001';
  end if;
  if a.original_decider = v_me then
    raise exception 'original_decider' using errcode = 'insufficient_privilege';
  end if;
  select ma.* into v_action from public.moderation_actions ma
  where (a.subject_type = 'content_removal' and ma.id = a.subject_id)
     or (a.subject_type = 'sanction' and ma.id = (select x.action_id from public.user_sanctions x where x.id = a.subject_id));
  select * into s from public.user_sanctions x
  where (a.subject_type = 'sanction' and x.id = a.subject_id)
     or (a.subject_type = 'content_removal' and v_action.id is not null and x.action_id = v_action.id)
  order by x.created_at desc limit 1;

  if p_outcome = 'reduced' then
    if s.id is null or s.kind not in ('mute', 'suspend', 'ban') or coalesce(p_reduce_to_days, 0) < 1 then
      raise exception 'nothing_to_reduce' using errcode = '22023';
    end if;
    update public.user_sanctions set
      kind = case when kind = 'ban' then 'suspend' else kind end,
      ends_at = starts_at + make_interval(days => p_reduce_to_days),
      state = case when starts_at + make_interval(days => p_reduce_to_days) <= now() then 'ended' else state end
    where id = s.id;
    perform public._sync_auth_ban(s.user_id);
  elsif p_outcome = 'overturned' then
    if s.id is not null then
      update public.user_sanctions set state = 'overturned' where id = s.id;
      perform public._sync_auth_ban(s.user_id);
    end if;
    if v_action.id is not null then
      update public.moderation_actions set undone_at = now() where id = v_action.id;
      if v_action.content_ref ? 'type' then
        perform public._set_content_state((v_action.content_ref ->> 'type')::public.report_content_type,
          (v_action.content_ref ->> 'id')::uuid, 'visible');
        if v_action.content_ref ->> 'group_id' is not null then
          perform public._trust_notify('live', jsonb_build_object('group_id', v_action.content_ref ->> 'group_id',
            'message_id', v_action.content_ref ->> 'id', 'op', 'restore'));
        end if;
      end if;
    end if;
  end if;
  if s.id is not null then
    perform public._trust_notify('live', jsonb_build_object('user_id', s.user_id, 'op', 'refresh_user'));
  end if;

  update public.appeals set status = p_outcome, decided_by = v_me, decided_at = now(), decision_note = nullif(btrim(p_reply), ''),
    reduce_to_days = case when p_outcome = 'reduced' then p_reduce_to_days end
  where id = a.id;
  perform public._trust_notify('appeal_decided', jsonb_build_object('user_id', a.user_id, 'appeal_id', a.id,
    'outcome', p_outcome, 'message', p_reply, 'email', true));
  perform public.write_audit('trust', 'appeal.decide', 'appeal', a.id::text, public.sender_name(a.user_id),
    'Appeal ' || p_outcome::text, jsonb_build_object('status', a.status),
    jsonb_build_object('status', p_outcome, 'reduce_to_days', p_reduce_to_days), p_reply);
end $$;

-- ─── Copyright claims ───────────────────────────────────────────────────────
create function public._can_claims(p_decide boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select public._trust_staff(case when p_decide then array['publisher', 'operations_admin']::public.staff_role[]
                                  else array['publisher', 'operations_admin', 'moderator']::public.staff_role[] end)
$$;

create function public.admin_list_claims(p_status text default 'open')
returns table (id uuid, ref text, book_id uuid, book_title text, author_name text, claimant_name text,
               type public.claim_type, status public.claim_status, created_at timestamptz, due_at timestamptz,
               author_due_at timestamptz, late boolean, held boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._can_claims(false) then
    raise exception 'admin_list_claims: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select c.id, c.ref, c.book_id, b.title, public.sender_name(b.author_id), c.claimant_name, c.type, c.status,
         c.created_at, c.due_at, c.author_due_at, c.status in ('new', 'waiting_on_author') and c.due_at < now(),
         b.claim_hold_at is not null
  from public.copyright_claims c join public.books b on b.id = c.book_id
  where case when p_status = 'decided' then c.status in ('upheld', 'rejected') else c.status in ('new', 'waiting_on_author') end
  order by c.due_at;
end $$;

create function public.admin_get_claim(p_claim uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.copyright_claims;
begin
  if not public._can_claims(false) then
    raise exception 'admin_get_claim: not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.copyright_claims where id = p_claim;
  if c.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'claim', to_jsonb(c),
    'book', (select jsonb_build_object('id', b.id, 'title', b.title, 'status', b.status, 'author_id', b.author_id,
               'author_name', public.sender_name(b.author_id), 'held', b.claim_hold_at is not null,
               'readers', (select count(distinct e.user_id) from public.entitlements e where e.book_id = b.id and e.revoked_at is null))
             from public.books b where b.id = c.book_id),
    'can_decide', public._can_claims(true),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'by', l.actor_name,
                   'summary', l.summary) order by l.at), '[]'::jsonb)
                 from public.audit_log l where l.object_type = 'claim' and l.object_id = c.id::text));
end $$;

-- Ask the author to respond (7 days by default; again to extend). Holds the book meanwhile.
create function public.claim_ask_author(p_claim uuid, p_days int default 7, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.copyright_claims;
begin
  perform public._require_trust_staff(array['publisher', 'operations_admin', 'moderator']::public.staff_role[], 'claim_ask_author');
  select * into c from public.copyright_claims where id = p_claim for update;
  if c.id is null or c.status not in ('new', 'waiting_on_author') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.copyright_claims set status = 'waiting_on_author',
    author_due_at = now() + make_interval(days => greatest(least(p_days, 30), 1)) where id = c.id;
  update public.books set claim_hold_at = coalesce(claim_hold_at, now()) where id = c.book_id;
  perform public._trust_notify('claim_author', jsonb_build_object('book_id', c.book_id, 'claim_id', c.id,
    'author_due_at', now() + make_interval(days => greatest(least(p_days, 30), 1)), 'message', p_note, 'email', true));
  perform public.write_audit('trust', 'claim.ask_author', 'claim', c.id::text, c.ref, 'Asked the author to respond',
    null, jsonb_build_object('days', p_days), p_note);
end $$;

-- The author answers a claim on their book (flow 11 shows it in Studio).
create function public.respond_to_claim(p_claim uuid, p_response text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.copyright_claims;
begin
  select cc.* into c from public.copyright_claims cc join public.books b on b.id = cc.book_id
  where cc.id = p_claim and b.author_id = auth.uid() and cc.status in ('new', 'waiting_on_author') for update;
  if c.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.copyright_claims set author_response = btrim(p_response) where id = c.id;
end $$;

-- Reject (release hold and earnings) or uphold (take the book down, earnings held back).
create function public.decide_claim(p_claim uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['publisher', 'operations_admin']::public.staff_role[], 'decide_claim');
  c public.copyright_claims;
  b public.books;
begin
  if p_decision not in ('reject', 'uphold') then
    raise exception 'bad_decision' using errcode = '22023';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into c from public.copyright_claims where id = p_claim for update;
  if c.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.status in ('upheld', 'rejected') then
    raise exception 'already_decided:%', public._staff_name(c.decided_by) using errcode = '40001';
  end if;
  select * into b from public.books where id = c.book_id for update;
  if p_decision = 'uphold' then
    update public.books set status = 'taken_down', claim_hold_at = coalesce(claim_hold_at, now()) where id = b.id;
    update public.book_revisions set status = 'taken_down' where id = b.current_revision_id and status = 'live';
  elsif not exists (select 1 from public.copyright_claims x where x.book_id = b.id and x.id <> c.id
                      and x.status in ('new', 'waiting_on_author')) then
    update public.books set claim_hold_at = null where id = b.id;
  end if;
  update public.copyright_claims set status = case when p_decision = 'uphold' then 'upheld' else 'rejected' end::public.claim_status,
    decided_by = v_me, decided_at = now(), decision_note = btrim(p_note)
  where id = c.id;
  if c.report_id is not null then
    update public.reports set status = 'resolved', outcome = case when p_decision = 'uphold' then 'removed' else 'dismissed' end::public.report_outcome,
      decided_by = v_me, resolved_at = now(), first_action_at = coalesce(first_action_at, now())
    where content_type = 'book' and content_id = b.id and reason = 'copyright' and status <> 'resolved';
  end if;
  perform public._trust_notify('claim_decided', jsonb_build_object('book_id', b.id, 'claim_id', c.id,
    'decision', p_decision, 'message', p_note, 'email', true));
  perform public.write_audit('trust', 'claim.' || p_decision, 'claim', c.id::text, c.ref,
    case when p_decision = 'uphold' then 'Claim upheld, book taken down' else 'Claim rejected' end,
    jsonb_build_object('book_status', b.status), jsonb_build_object('book_status',
      case when p_decision = 'uphold' then 'taken_down' else b.status::text end), p_note);
end $$;

-- ─── Support ────────────────────────────────────────────────────────────────
-- In-app ticket (Q85 form) and the reader menu's "Report a problem with this book" (rule 2).
create function public.create_support_ticket(p_category public.ticket_category, p_subject text, p_body text,
                                             p_book uuid default null, p_context jsonb default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
  v_ref text;
begin
  if uid is null then
    raise exception 'create_support_ticket: sign in' using errcode = 'insufficient_privilege';
  end if;
  if (select count(*) from public.support_tickets where user_id = uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'daily_limit' using errcode = '54000';
  end if;
  insert into public.support_tickets (user_id, email, channel, category, subject, book_id, context)
  values (uid, (select email from auth.users where id = uid), 'app', p_category, btrim(p_subject), p_book, p_context)
  returning id, ref into v_id, v_ref;
  insert into public.ticket_messages (ticket_id, kind, author_id, body) values (v_id, 'reader', uid, btrim(p_body));
  return v_ref;
end $$;

-- Inbound email from the support-inbound-email Worker (service role). Threads by TKT ref in the
-- subject or by In-Reply-To; reopens a solved ticket within 7 days; later replies open a linked one.
create function public.ingest_support_email(p_from text, p_subject text, p_body text, p_message_id text,
                                            p_in_reply_to text default null, p_attachments jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_from));
  v_user uuid;
  t public.support_tickets;
  v_ref text := substring(coalesce(p_subject, '') from 'TKT-[0-9]+');
  v_new uuid;
  v_status text;
begin
  if not public._is_service() then
    raise exception 'ingest_support_email: service only' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.ticket_messages where email_message_id = p_message_id) then
    return jsonb_build_object('status', 'duplicate');
  end if;
  select u.id into v_user from auth.users u join public.profiles p on p.id = u.id
  where lower(u.email) = v_email and p.deleted_at is null;
  select * into t from public.support_tickets s
  where (v_ref is not null and s.ref = v_ref)
     or (p_in_reply_to is not null and s.id = (select m.ticket_id from public.ticket_messages m where m.email_message_id = p_in_reply_to))
  order by s.created_at desc limit 1 for update;
  -- Only the ticket's own reader may continue it.
  if t.id is not null and coalesce(lower(t.email), '') <> v_email and t.user_id is distinct from v_user then
    t := null;
  end if;

  if t.id is not null and (t.status <> 'solved' or t.reopen_until > now()) then
    update public.support_tickets set status = 'open', solved_at = null, last_message_at = now() where id = t.id;
    v_new := t.id;
    v_status := case when t.status = 'solved' then 'reopened' else 'appended' end;
  else
    insert into public.support_tickets (user_id, email, channel, subject, linked_ticket_id)
    values (v_user, v_email, 'email', left(coalesce(nullif(btrim(p_subject), ''), '(no subject)'), 200), t.id)
    returning id into v_new;
    v_status := case when t.id is not null then 'linked' else 'created' end;
  end if;
  insert into public.ticket_messages (ticket_id, kind, author_id, body, email_message_id, attachments)
  values (v_new, 'reader', v_user, coalesce(nullif(p_body, ''), '(empty)'), p_message_id, coalesce(p_attachments, '[]'));
  return jsonb_build_object('status', v_status, 'ticket_id', v_new,
    'ref', (select ref from public.support_tickets where id = v_new));
end $$;

-- A reader replies from the app.
create function public.reader_reply_ticket(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets;
begin
  select * into t from public.support_tickets where id = p_ticket and user_id = auth.uid() for update;
  if t.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if t.status = 'solved' and coalesce(t.reopen_until, now()) <= now() then
    raise exception 'ticket_closed' using errcode = '22023';
  end if;
  insert into public.ticket_messages (ticket_id, kind, author_id, body) values (t.id, 'reader', auth.uid(), btrim(p_body));
  update public.support_tickets set status = 'open', solved_at = null, last_message_at = now() where id = t.id;
end $$;

create function public.admin_list_tickets(p_tab text default 'mine', p_category public.ticket_category default null,
                                          p_channel public.ticket_channel default null, p_q text default null,
                                          p_limit int default 50, p_offset int default 0)
returns table (id uuid, ref text, subject text, user_id uuid, reader_name text, email text,
               category public.ticket_category, channel public.ticket_channel, status public.ticket_status,
               assignee_id uuid, assignee_name text, first_reply_due_at timestamptz, first_replied_at timestamptz,
               last_message_at timestamptz, created_at timestamptz, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_support() then
    raise exception 'admin_list_tickets: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select t.id, t.ref, t.subject, t.user_id, case when t.user_id is not null then public.sender_name(t.user_id) end,
         t.email, t.category, t.channel, t.status, t.assignee_id,
         case when t.assignee_id is not null then public._staff_name(t.assignee_id) end,
         t.first_reply_due_at, t.first_replied_at, t.last_message_at, t.created_at, count(*) over ()
  from public.support_tickets t
  where case p_tab
          when 'mine' then t.assignee_id = auth.uid() and t.status = 'open'
          when 'unassigned' then t.assignee_id is null and t.status = 'open'
          when 'waiting' then t.status = 'waiting_on_reader'
          when 'solved' then t.status = 'solved'
          else true end
    and (p_category is null or t.category = p_category)
    and (p_channel is null or t.channel = p_channel)
    and (p_q is null or t.subject ilike '%' || p_q || '%' or t.ref ilike p_q || '%' or t.email ilike '%' || p_q || '%')
  order by case when p_tab = 'solved' then t.solved_at end desc nulls last,
           case when t.first_replied_at is null then t.first_reply_due_at end nulls last, t.last_message_at desc
  limit greatest(least(p_limit, 200), 1) offset greatest(p_offset, 0);
end $$;

create function public.admin_ticket_counts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.can_support() then jsonb_build_object(
    'mine', count(*) filter (where assignee_id = auth.uid() and status = 'open'),
    'unassigned', count(*) filter (where assignee_id is null and status = 'open'),
    'waiting', count(*) filter (where status = 'waiting_on_reader'),
    'solved', count(*) filter (where status = 'solved'),
    'over_sla', count(*) filter (where status = 'open' and first_replied_at is null and first_reply_due_at < now()))
  end
  from public.support_tickets
$$;

create function public.admin_get_ticket(p_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.support_tickets;
begin
  if not public.can_support() then
    raise exception 'admin_get_ticket: not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.support_tickets where id = p_ticket;
  if t.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'ticket', to_jsonb(t),
    'assignee_name', case when t.assignee_id is not null then public._staff_name(t.assignee_id) end,
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'body', m.body,
                   'author_name', case when m.kind = 'reader' then coalesce(public.sender_name(m.author_id), t.email)
                                       else public._staff_name(m.author_id) end,
                   'attachments', m.attachments, 'created_at', m.created_at) order by m.created_at), '[]'::jsonb)
                 from public.ticket_messages m where m.ticket_id = t.id),
    'reader', case when t.user_id is not null then (
      select jsonb_build_object('id', p.id, 'name', public.sender_name(p.id), 'email', u.email, 'joined_at', u.created_at,
        'balance', (select coalesce(sum(l.delta), 0) from public.credit_ledger l where l.user_id = p.id),
        'devices', (select coalesce(jsonb_agg(jsonb_build_object('model', d.model, 'os', d.os, 'app_version', d.app_version,
                      'last_seen_at', d.last_seen_at) order by d.last_seen_at desc), '[]'::jsonb)
                    from public.user_devices d where d.user_id = p.id and d.revoked_at is null),
        'transactions', (select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
                           select l.id, l.delta, l.reason, l.bucket, l.note, l.created_at, l.book_id
                           from public.credit_ledger l where l.user_id = p.id order by l.created_at desc limit 10) x))
      from public.profiles p left join auth.users u on u.id = p.id where p.id = t.user_id) end,
    'linked', (select jsonb_build_object('id', l.id, 'ref', l.ref) from public.support_tickets l where l.id = t.linked_ticket_id));
end $$;

-- Reply to the reader (email out through the Worker, push when they have the app); Send and solve.
create function public.reply_ticket(p_ticket uuid, p_body text, p_solve boolean default false,
                                    p_macro uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  t public.support_tickets;
  v_id uuid;
begin
  if not public.can_support() then
    raise exception 'reply_ticket: not allowed' using errcode = 'insufficient_privilege';
  end if;
  v_me := auth.uid();
  select * into t from public.support_tickets where id = p_ticket for update;
  if t.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.ticket_messages (ticket_id, kind, author_id, body, macro_id)
  values (t.id, 'staff', v_me, btrim(p_body), p_macro) returning id into v_id;
  update public.support_tickets set
    first_replied_at = coalesce(first_replied_at, now()),
    assignee_id = coalesce(assignee_id, v_me),
    status = case when p_solve then 'solved' else 'waiting_on_reader' end::public.ticket_status,
    solved_at = case when p_solve then now() end,
    reopen_until = case when p_solve then now() + interval '7 days' end,
    last_message_at = now()
  where id = t.id;
  perform public._trust_notify('ticket_reply', jsonb_build_object('ticket_id', t.id, 'message_id', v_id,
    'user_id', t.user_id, 'email', t.email, 'ref', t.ref, 'subject', t.subject));
  return v_id;
end $$;

create function public.add_ticket_note(p_ticket uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_support() then
    raise exception 'add_ticket_note: not allowed' using errcode = 'insufficient_privilege';
  end if;
  insert into public.ticket_messages (ticket_id, kind, author_id, body)
  select t.id, 'note', auth.uid(), btrim(p_body) from public.support_tickets t where t.id = p_ticket
  returning id into v_id;
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_id;
end $$;

-- Assign (null = me), change category or status.
create function public.update_ticket(p_ticket uuid, p_assignee uuid default null, p_category public.ticket_category default null,
                                     p_status public.ticket_status default null, p_unassign boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_support() then
    raise exception 'update_ticket: not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_assignee is not null and not exists (select 1 from public.staff_roles s where s.user_id = p_assignee and s.active) then
    raise exception 'not_staff' using errcode = '22023';
  end if;
  update public.support_tickets set
    assignee_id = case when p_unassign then null else coalesce(p_assignee, case when p_category is null and p_status is null
                                                                                 then auth.uid() else assignee_id end) end,
    category = coalesce(p_category, category),
    status = coalesce(p_status, status),
    solved_at = case when p_status = 'solved' then now() when p_status is not null then null else solved_at end,
    reopen_until = case when p_status = 'solved' then now() + interval '7 days' else reopen_until end
  where id = p_ticket;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

create function public.save_support_macro(p_title text, p_body text, p_category public.ticket_category default null,
                                          p_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_support() then
    raise exception 'save_support_macro: not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_id is null then
    insert into public.support_macros (title, body, category, variables, created_by)
    values (btrim(p_title), p_body, p_category,
            array(select distinct m[1] from regexp_matches(p_body, '\{(\w+)\}', 'g') m), auth.uid())
    returning id into v_id;
  else
    update public.support_macros set title = btrim(p_title), body = p_body, category = p_category,
      variables = array(select distinct m[1] from regexp_matches(p_body, '\{(\w+)\}', 'g') m)
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

-- ─── Help articles ──────────────────────────────────────────────────────────
create function public._can_help() returns boolean
language sql stable security definer set search_path = '' as $$
  select public._trust_staff(array['support', 'operations_admin']::public.staff_role[])
$$;

-- Save a draft version (new article when p_article is null). Publish makes it live.
create function public.save_help_draft(p_article uuid, p_slug text, p_category public.help_category,
                                       p_shows_in text[], p_title text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_article uuid := p_article;
  v_version uuid;
  v_no int;
begin
  if not public._can_help() then
    raise exception 'save_help_draft: not allowed' using errcode = 'insufficient_privilege';
  end if;
  if v_article is null then
    insert into public.help_articles (slug, category, shows_in) values (lower(btrim(p_slug)), p_category, p_shows_in)
    returning id into v_article;
  else
    update public.help_articles set slug = lower(btrim(p_slug)), category = p_category, shows_in = p_shows_in
    where id = v_article;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;
  select coalesce(max(number), 0) + 1 into v_no from public.help_article_versions where article_id = v_article;
  insert into public.help_article_versions (article_id, number, title, body, edited_by)
  values (v_article, v_no, btrim(p_title), p_body, auth.uid()) returning id into v_version;
  return jsonb_build_object('article_id', v_article, 'version_id', v_version, 'number', v_no);
end $$;

-- Publish a version (latest by default); restoring an older version publishes it again.
create function public.publish_help_article(p_article uuid, p_version uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_version uuid;
begin
  if not public._can_help() then
    raise exception 'publish_help_article: not allowed' using errcode = 'insufficient_privilege';
  end if;
  select id into v_version from public.help_article_versions
  where article_id = p_article and (p_version is null or id = p_version)
  order by number desc limit 1;
  if v_version is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.help_articles set current_version_id = v_version, state = 'published' where id = p_article;
  perform public.write_audit('support', 'help.publish', 'help_article', p_article::text,
    (select title from public.help_article_versions where id = v_version), 'Help article published', null,
    jsonb_build_object('version_id', v_version), null);
end $$;

create function public.unpublish_help_article(p_article uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._can_help() then
    raise exception 'unpublish_help_article: not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.help_articles set state = 'draft' where id = p_article;
end $$;

create function public.admin_list_help()
returns table (id uuid, slug text, category public.help_category, shows_in text[], state text, title text,
               views_30d bigint, helpful_pct int, votes_30d bigint, needs_rewrite boolean, has_draft boolean,
               updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._can_help() then
    raise exception 'admin_list_help: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select a.id, a.slug, a.category, a.shows_in, a.state,
         (select v.title from public.help_article_versions v where v.article_id = a.id
          order by (v.id = a.current_version_id) desc, v.number desc limit 1),
         (select count(*) from public.help_views w where w.article_id = a.id and w.at > now() - interval '30 days'),
         (select (100 * avg(case when hv.helpful then 1 else 0 end))::int from public.help_votes hv
          where hv.article_id = a.id and hv.at > now() - interval '30 days'),
         (select count(*) from public.help_votes hv where hv.article_id = a.id and hv.at > now() - interval '30 days'),
         coalesce((select avg(case when hv.helpful then 1.0 else 0 end) < 0.7 from public.help_votes hv
                   where hv.article_id = a.id and hv.at > now() - interval '30 days'), false),
         exists (select 1 from public.help_article_versions v where v.article_id = a.id
                 and v.number > coalesce((select c.number from public.help_article_versions c where c.id = a.current_version_id), 0)),
         a.updated_at
  from public.help_articles a
  order by a.category, 6;
end $$;

create function public.admin_get_help(p_article uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._can_help() then
    raise exception 'admin_get_help: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return (select jsonb_build_object('article', to_jsonb(a),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'number', v.number, 'title', v.title, 'body', v.body,
                   'edited_by', public._staff_name(v.edited_by), 'created_at', v.created_at,
                   'current', v.id = a.current_version_id) order by v.number desc), '[]'::jsonb)
                 from public.help_article_versions v where v.article_id = a.id))
    from public.help_articles a where a.id = p_article);
end $$;

-- Reader side: published articles shown in the app, by category or search.
create function public.get_help_articles(p_category public.help_category default null, p_q text default null)
returns table (id uuid, slug text, category public.help_category, title text, excerpt text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.slug, a.category, v.title, left(regexp_replace(v.body, '\s+', ' ', 'g'), 140)
  from public.help_articles a join public.help_article_versions v on v.id = a.current_version_id
  where a.state = 'published' and 'app' = any (a.shows_in)
    and (p_category is null or a.category = p_category)
    and (p_q is null or char_length(btrim(p_q)) < 2 or v.title ilike '%' || btrim(p_q) || '%' or v.body ilike '%' || btrim(p_q) || '%')
  order by a.category, v.title
$$;

create function public.get_help_article(p_slug text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object('id', a.id, 'slug', a.slug, 'category', a.category, 'title', hv.title, 'body', hv.body,
           'updated_at', hv.created_at,
           'my_vote', (select x.helpful from public.help_votes x where x.article_id = a.id and x.user_id = auth.uid()),
           'related', (select coalesce(jsonb_agg(jsonb_build_object('slug', r.slug, 'title', rv.title)), '[]'::jsonb)
                       from public.help_articles r join public.help_article_versions rv on rv.id = r.current_version_id
                       where r.id = any (a.related) and r.state = 'published'))
    into v
  from public.help_articles a join public.help_article_versions hv on hv.id = a.current_version_id
  where a.slug = p_slug and a.state = 'published';
  if v is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.help_views (article_id) values ((v ->> 'id')::uuid);
  return v;
end $$;

create function public.vote_help(p_article uuid, p_helpful boolean) returns void
language sql security definer set search_path = '' as $$
  insert into public.help_votes (article_id, user_id, helpful)
  select a.id, auth.uid(), p_helpful from public.help_articles a
  where a.id = p_article and a.state = 'published' and auth.uid() is not null
  on conflict (article_id, user_id) do update set helpful = excluded.helpful, at = now()
$$;

-- ─── Return a chapter charge (unlock-return) ────────────────────────────────
-- A pay-as-you-read charge is one or more `chapter` rows sharing a txn_id (one per bucket).
create function public._chapter_charge(p_ledger bigint)
returns table (txn_id uuid, user_id uuid, book_id uuid, chapter_id uuid, credits int, kobo int, charged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.txn_id, min(l.user_id::text)::uuid, min(l.book_id::text)::uuid, min(l.chapter_id::text)::uuid,
         -sum(l.delta)::int, sum(l.author_earning_kobo)::int, min(l.created_at)
  from public.credit_ledger l
  where l.txn_id = (select x.txn_id from public.credit_ledger x where x.id = p_ledger) and l.reason = 'chapter'
  group by l.txn_id
$$;

-- The reader's own 10-minute undo (flow 04) already gave this chapter charge back.
create function public._charge_undone(p_user uuid, p_chapter uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.credit_ledger l where l.user_id = p_user and l.chapter_id = p_chapter
                   and l.reason = 'undo' and l.created_at >= p_at)
$$;

create function public.admin_return_preview(p_ledger bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c record;
begin
  if not public._trust_staff(array['support', 'finance', 'operations_admin']::public.staff_role[]) then
    raise exception 'admin_return_preview: not allowed' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public._chapter_charge(p_ledger);
  if c.txn_id is null then
    raise exception 'not_chapter_charge' using errcode = '22023';
  end if;
  return jsonb_build_object('ledger_id', p_ledger, 'credits', c.credits, 'charged_at', c.charged_at,
    'book', (select jsonb_build_object('id', b.id, 'title', b.title) from public.books b where b.id = c.book_id),
    'chapter', (select jsonb_build_object('id', ch.id, 'ord', ch.ord, 'title', ch.title, 'pages', ceil(ch.pages))
                from public.chapters ch where ch.id = c.chapter_id),
    'undo_window_open', c.charged_at > now() - interval '10 minutes',
    'returned', exists (select 1 from public.credit_returns r where r.ledger_id in
                          (select l.id from public.credit_ledger l where l.txn_id = c.txn_id) and r.state <> 'declined')
                or public._charge_undone(c.user_id, c.chapter_id, c.charged_at),
    'needs_approval', c.credits > 50 or (select count(*) from public.credit_returns r where r.user_id = c.user_id
                        and r.created_at > now() - interval '30 days' and r.state <> 'declined') >= 3);
end $$;

create function public._do_credit_return(p_return uuid, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.credit_returns;
  v_txn uuid := gen_random_uuid();
  v_rows int;
begin
  select * into r from public.credit_returns where id = p_return for update;
  -- One staff-return row per bucket row of the charge; author earning reversed on each.
  insert into public.credit_ledger (user_id, delta, reason, bucket, expires_at, txn_id, ref_type, ref_id, idempotency_key,
                                    book_id, chapter_id, author_id, author_earning_kobo, actor_id, note)
  select l.user_id, -l.delta, 'refund', l.bucket, l.expires_at, v_txn, 'credit_return', r.id::text,
         'credit_return:' || l.id, l.book_id, l.chapter_id, l.author_id, -l.author_earning_kobo, p_actor, 'Staff return'
  from public.credit_ledger l
  where l.txn_id = (select x.txn_id from public.credit_ledger x where x.id = r.ledger_id) and l.reason = 'chapter'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'already_returned' using errcode = '23505';
  end if;
  update public.entitlements e set revoked_at = now(), revoked_reason = 'staff_return'
  from public.chapters ch
  where ch.id = r.chapter_id and e.user_id = r.user_id and e.book_id = r.book_id and e.scope = 'chapter'
    and e.chapter_uid = ch.chapter_uid and e.revoked_at is null;
  update public.credit_returns set state = 'done', return_txn_id = v_txn, decided_at = now(),
    approved_by = case when state = 'pending_approval' then p_actor else approved_by end
  where id = r.id;
  return v_txn;
end $$;

-- Staff return (rule 39). Idempotent per charge. Over 50 credits or a 4th return in 30 days waits
-- for Finance.
create function public.staff_return_chapter_charge(p_ledger bigint, p_reason public.credit_return_reason) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['support', 'finance', 'operations_admin']::public.staff_role[], 'staff_return_chapter_charge');
  c record;
  v_first bigint;
  v_id uuid;
  v_pending boolean;
  ex public.credit_returns;
begin
  select * into c from public._chapter_charge(p_ledger);
  if c.txn_id is null then
    raise exception 'not_chapter_charge' using errcode = '22023';
  end if;
  -- Serialise per reader so two staff can't both pass the 30-day count.
  perform 1 from public.profiles where id = c.user_id for update;
  select min(id) into v_first from public.credit_ledger where txn_id = c.txn_id and reason = 'chapter';
  select * into ex from public.credit_returns where ledger_id = v_first;
  if ex.id is not null and ex.state <> 'declined' then
    return jsonb_build_object('id', ex.id, 'state', ex.state, 'credits', ex.credits, 'duplicate', true);
  end if;
  if c.charged_at > now() - interval '10 minutes' then
    raise exception 'undo_window_open' using errcode = '22023';
  end if;
  if public._charge_undone(c.user_id, c.chapter_id, c.charged_at) then
    raise exception 'already_undone' using errcode = '23505';
  end if;
  v_pending := c.credits > 50 or (select count(*) from public.credit_returns r where r.user_id = c.user_id
                                    and r.created_at > now() - interval '30 days' and r.state <> 'declined') >= 3;
  if ex.id is not null then
    delete from public.credit_returns where id = ex.id;
  end if;
  insert into public.credit_returns (ledger_id, user_id, book_id, chapter_id, credits, reason, requested_by, state)
  values (v_first, c.user_id, c.book_id, c.chapter_id, c.credits, p_reason, v_me,
          (case when v_pending then 'pending_approval' else 'done' end)::public.credit_return_state)
  returning id into v_id;
  if not v_pending then
    perform public._do_credit_return(v_id, v_me);
  end if;
  perform public.write_audit('money', case when v_pending then 'credit_return.request' else 'credit_return.done' end,
    'user', c.user_id::text, public.sender_name(c.user_id),
    format('Return %s credits for a chapter%s', c.credits, case when v_pending then ' (needs Finance)' else '' end),
    null, jsonb_build_object('ledger_id', v_first, 'credits', c.credits, 'chapter_id', c.chapter_id), p_reason::text);
  return jsonb_build_object('id', v_id, 'state', case when v_pending then 'pending_approval' else 'done' end,
    'credits', c.credits, 'duplicate', false);
end $$;

create function public.approve_credit_return(p_return uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['finance']::public.staff_role[], 'approve_credit_return');
  r public.credit_returns;
begin
  select * into r from public.credit_returns where id = p_return for update;
  if r.id is null or r.state <> 'pending_approval' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.requested_by = v_me then
    raise exception 'second_person' using errcode = 'insufficient_privilege';
  end if;
  if p_approve then
    perform public._do_credit_return(r.id, v_me);
  else
    update public.credit_returns set state = 'declined', approved_by = v_me, decided_at = now() where id = r.id;
  end if;
  perform public.write_audit('money', case when p_approve then 'credit_return.approve' else 'credit_return.decline' end,
    'user', r.user_id::text, public.sender_name(r.user_id), format('%s credits', r.credits), null, null, null);
end $$;

create function public.admin_list_credit_returns(p_state public.credit_return_state default 'pending_approval')
returns table (id uuid, user_id uuid, user_name text, book_title text, chapter_title text, credits int,
               reason public.credit_return_reason, requested_by_name text, state public.credit_return_state,
               created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._trust_staff(array['support', 'finance', 'operations_admin']::public.staff_role[]) then
    raise exception 'admin_list_credit_returns: not allowed' using errcode = 'insufficient_privilege';
  end if;
  return query
  select r.id, r.user_id, public.sender_name(r.user_id), b.title, ch.title, r.credits, r.reason,
         public._staff_name(r.requested_by), r.state, r.created_at
  from public.credit_returns r left join public.books b on b.id = r.book_id left join public.chapters ch on ch.id = r.chapter_id
  where r.state = p_state order by r.created_at;
end $$;

-- ─── Reader: my sanctions and notices ───────────────────────────────────────
-- The decision message with Appeal (rule 26): active or recent sanctions and removals.
create function public.get_my_moderation()
returns table (action_id uuid, sanction_id uuid, action public.moderation_action_kind, ends_at timestamptz,
               message text, created_at timestamptz, can_appeal boolean, appeal_status public.appeal_status)
language sql stable security definer set search_path = '' as $$
  select a.id, s.id, a.action, coalesce(s.ends_at, a.expires_at), a.message_to_user, a.created_at,
         a.created_at > now() - interval '14 days' and a.undone_at is null
           and not exists (select 1 from public.appeals x where x.user_id = auth.uid()
                             and x.subject_id in (a.id, s.id)),
         (select x.status from public.appeals x where x.user_id = auth.uid() and x.subject_id in (a.id, s.id)
          order by x.created_at desc limit 1)
  from public.moderation_actions a
  left join public.user_sanctions s on s.action_id = a.id
  where a.target_user_id = auth.uid() and a.action not in ('keep', 'restore')
    and a.created_at > now() - interval '90 days'
  order by a.created_at desc
$$;

-- ─── Jobs ───────────────────────────────────────────────────────────────────
-- Every 15 minutes: alert once when a High report passes 12 hours undecided.
create function public.sla_watch() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    update public.reports set late_alerted_at = now()
    where status <> 'resolved' and severity = 'high' and late_alerted_at is null
      and created_at < now() - interval '12 hours' and first_action_at is null
    returning id
  loop
    perform public._trust_notify('staff_alert', jsonb_build_object('report_id', r.id, 'late', true));
  end loop;
end $$;

-- Hourly: end mutes and suspensions whose time has passed, and give sign-in back.
create function public.sanction_expiry() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in
    update public.user_sanctions set state = 'ended'
    where state = 'active' and ends_at is not null and ends_at <= now()
    returning user_id
  loop
    perform public._sync_auth_ban(v);
  end loop;
end $$;

-- Daily: DM thread snapshots purged a year after the report closed; reports and actions after 3 years.
create function public.purge_snapshots() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.reports set snapshot = snapshot - 'context'
  where content_type = 'dm' and status = 'resolved' and resolved_at < now() - interval '1 year' and snapshot ? 'context';
  delete from public.moderation_actions where created_at < now() - interval '3 years';
  delete from public.reports where created_at < now() - interval '3 years';
  delete from public.support_tickets where created_at < now() - interval '3 years';
  delete from public.automod_hits where at < now() - interval '30 days';
  delete from public.help_views where at < now() - interval '90 days';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sla_watch', '*/15 * * * *', 'select public.sla_watch()');
    perform cron.schedule('sanction_expiry', '7 * * * *', 'select public.sanction_expiry()');
    perform cron.schedule('purge_snapshots', '45 2 * * *', 'select public.purge_snapshots()');
  end if;
end $$;

-- Service role: drain the outbox (the api Worker sends email and pushes live changes).
create function public.trust_queue_read(p_qty int default 20, p_vt int default 60)
returns table (msg_id bigint, message jsonb)
language sql security definer set search_path = '' as $$
  select q.msg_id, q.message from pgmq.read('trust_notify', p_vt, p_qty) q
$$;
create function public.trust_queue_ack(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
  select pgmq.delete('trust_notify', p_ids)
$$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.automod_settings enable row level security;
alter table public.automod_words enable row level security;
alter table public.automod_hits enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.user_sanctions enable row level security;
alter table public.appeals enable row level security;
alter table public.copyright_claims enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_macros enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.help_articles enable row level security;
alter table public.help_article_versions enable row level security;
alter table public.help_votes enable row level security;
alter table public.help_views enable row level security;
alter table public.credit_returns enable row level security;

-- reports: reporters see only their own (reason and time, no outcome or snapshot); staff go through
-- the admin RPCs, which audit DM access and keep staff-content reports for Super admin.
drop policy reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
revoke select on public.reports from authenticated;
grant select (id, ref, reporter_id, content_type, content_id, reason, created_at) on public.reports to authenticated;

create policy automod_settings_select on public.automod_settings for select to authenticated
  using ((select public.can_read_reports()));
create policy automod_words_select on public.automod_words for select to authenticated
  using ((select public.can_read_reports()));

create policy moderation_actions_select on public.moderation_actions for select to authenticated
  using ((select public.can_read_reports()));
-- Readers see their own sanctions (the app's "Your account is muted until…").
create policy user_sanctions_select on public.user_sanctions for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_read_reports()));

create policy appeals_select on public.appeals for select to authenticated
  using (user_id = (select auth.uid())
         or (select public._trust_staff(array['moderator', 'operations_admin', 'publisher']::public.staff_role[])));

create policy copyright_claims_select on public.copyright_claims for select to authenticated
  using ((select public._can_claims(false))
         or exists (select 1 from public.books b where b.id = book_id and b.author_id = (select auth.uid())));

create policy support_tickets_select on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_support()));
-- Notes are never shown to readers.
create policy ticket_messages_select on public.ticket_messages for select to authenticated
  using ((kind <> 'note' and exists (select 1 from public.support_tickets t
                                     where t.id = ticket_id and t.user_id = (select auth.uid())))
         or (select public.can_support()));
create policy support_macros_select on public.support_macros for select to authenticated
  using ((select public.can_support()));

create policy help_articles_select on public.help_articles for select to anon, authenticated
  using (state = 'published' or (select public._can_help()));
create policy help_article_versions_select on public.help_article_versions for select to anon, authenticated
  using (exists (select 1 from public.help_articles a where a.id = article_id and a.current_version_id = help_article_versions.id
                   and a.state = 'published')
         or (select public._can_help()));
create policy help_votes_select on public.help_votes for select to authenticated
  using (user_id = (select auth.uid()));

create policy credit_returns_select on public.credit_returns for select to authenticated
  using (user_id = (select auth.uid())
         or (select public._trust_staff(array['support', 'finance', 'operations_admin']::public.staff_role[])));

revoke all on public.automod_settings, public.automod_words, public.automod_hits, public.moderation_actions,
  public.user_sanctions, public.appeals, public.copyright_claims, public.support_tickets, public.support_macros,
  public.ticket_messages, public.help_articles, public.help_article_versions, public.help_votes, public.help_views,
  public.credit_returns
  from anon, authenticated;
grant select on public.automod_settings, public.automod_words, public.moderation_actions, public.user_sanctions,
  public.appeals, public.copyright_claims, public.support_tickets, public.support_macros, public.ticket_messages,
  public.help_articles, public.help_article_versions, public.help_votes, public.credit_returns
  to authenticated;
grant select on public.help_articles, public.help_article_versions to anon;
revoke insert, update, delete, truncate on public.credit_returns, public.moderation_actions, public.user_sanctions
  from service_role;

-- ─── Grants ─────────────────────────────────────────────────────────────────
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
      '_trust_notify', 'automod_value', '_trust_staff', '_require_trust_staff', 'can_moderate', 'can_read_reports',
      'can_support', '_is_active_staff', '_staff_name', 'report_severity_setting', 'report_due_at', 'active_sanction',
      '_sync_auth_ban', 'post_block_for', '_report_target', '_set_content_state', 'report_reasons_for', 'create_report',
      'report_message', 'report_after_insert', '_report_visible_to_me', 'admin_list_reports', 'admin_report_counts',
      'admin_get_report', 'assign_report', 'escalate_report', 'set_report_severity', '_apply_sanction',
      'staff_decide_report', 'confirm_ban', 'admin_pending_bans', 'admin_get_automod', 'set_automod_setting',
      'save_automod_word', 'delete_automod_word', 'get_moderation_rules', 'record_automod_hits', 'create_appeal',
      'admin_list_appeals', 'admin_get_appeal', 'decide_appeal', '_can_claims', 'admin_list_claims', 'admin_get_claim',
      'claim_ask_author', 'respond_to_claim', 'decide_claim', 'create_support_ticket', 'ingest_support_email',
      'reader_reply_ticket', 'admin_list_tickets', 'admin_ticket_counts', 'admin_get_ticket', 'reply_ticket',
      'add_ticket_note', 'update_ticket', 'save_support_macro', '_can_help', 'save_help_draft', 'publish_help_article',
      'unpublish_help_article', 'admin_list_help', 'admin_get_help', 'get_help_articles', 'get_help_article',
      'vote_help', '_chapter_charge', '_charge_undone', 'admin_return_preview', '_do_credit_return', 'staff_return_chapter_charge',
      'approve_credit_return', 'admin_list_credit_returns', 'get_my_moderation', 'sla_watch', 'sanction_expiry',
      'purge_snapshots', 'trust_queue_read', 'trust_queue_ack'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

grant execute on function
  -- readers
  public.create_report(public.report_content_type, uuid, public.report_reason, text, boolean, timestamptz),
  public.report_message(uuid, public.report_reason, text, boolean), public.report_reasons_for(public.report_content_type),
  public.create_appeal(public.appeal_subject, uuid, text), public.get_my_moderation(),
  public.create_support_ticket(public.ticket_category, text, text, uuid, jsonb), public.reader_reply_ticket(uuid, text),
  public.get_help_articles(public.help_category, text), public.get_help_article(text), public.vote_help(uuid, boolean),
  public.respond_to_claim(uuid, text),
  -- staff (each checks its role and two-step)
  public.admin_list_reports(text, text, public.report_reason, public.report_severity, uuid, int, int),
  public.admin_report_counts(), public.admin_get_report(uuid), public.assign_report(uuid, uuid),
  public.escalate_report(uuid, text), public.set_report_severity(uuid, public.report_severity),
  public.staff_decide_report(uuid, text, text, int, text, text, text, boolean), public.confirm_ban(uuid, boolean),
  public.admin_pending_bans(), public.admin_get_automod(), public.set_automod_setting(text, jsonb),
  public.save_automod_word(text, boolean, text, text, text, uuid), public.delete_automod_word(uuid),
  public.admin_list_appeals(text), public.admin_get_appeal(uuid),
  public.decide_appeal(uuid, public.appeal_status, int, text), public.admin_list_claims(text),
  public.admin_get_claim(uuid), public.claim_ask_author(uuid, int, text), public.decide_claim(uuid, text, text),
  public.admin_list_tickets(text, public.ticket_category, public.ticket_channel, text, int, int),
  public.admin_ticket_counts(), public.admin_get_ticket(uuid), public.reply_ticket(uuid, text, boolean, uuid),
  public.add_ticket_note(uuid, text), public.update_ticket(uuid, uuid, public.ticket_category, public.ticket_status, boolean),
  public.save_support_macro(text, text, public.ticket_category, uuid),
  public.save_help_draft(uuid, text, public.help_category, text[], text, text), public.publish_help_article(uuid, uuid),
  public.unpublish_help_article(uuid), public.admin_list_help(), public.admin_get_help(uuid),
  public.admin_return_preview(bigint), public.staff_return_chapter_charge(bigint, public.credit_return_reason),
  public.approve_credit_return(uuid, boolean), public.admin_list_credit_returns(public.credit_return_state),
  -- used inside RLS policies
  public.can_read_reports(), public.can_support(), public._can_claims(boolean), public._can_help(),
  public._trust_staff(public.staff_role[])
  to authenticated;
grant execute on function public.get_help_articles(public.help_category, text) to anon;

-- Workers (service role).
grant execute on function public.get_moderation_rules(), public.record_automod_hits(uuid[]),
  public.ingest_support_email(text, text, text, text, text, jsonb), public.trust_queue_read(int, int),
  public.trust_queue_ack(bigint[]), public.post_block_for(uuid, uuid), public.active_sanction(uuid),
  public.sla_watch(), public.sanction_expiry(), public.purge_snapshots()
  to service_role;
