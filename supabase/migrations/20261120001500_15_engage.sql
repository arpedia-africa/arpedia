-- Flow 15 · Engage and insights: push types and rules, push log and held pushes, staff push
-- campaigns, in-app announcements (banners), system email templates, analytics rollups, exports.
-- Never edit this file after merge.
--
-- Shared with other flows (built there, used here behind to_regclass() checks so this flow
-- applies on its own):
--   * feed rows `public.notifications` and their RPCs: flow 02 (`_create_notification`).
--   * reader preferences `public.notification_preferences`: flow 10 (s-notif-prefs).
--   * push tokens: flow 01's `user_devices.push_token` (one row per device); this flow adds
--     the FCM state columns instead of a second token table.
--   * subscriptions (flow 03), reading_sessions (flow 04), follows (flow 03).

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.push_category as enum ('messages', 'authors', 'reminders', 'marketing', 'account');
-- What a push does when it falls in the reader's quiet hours (Data: per-type table).
--   hold    = held to the end of quiet hours, dropped if older than 12 hours by then
--   deliver = delivered at the end of quiet hours, never dropped
--   drop    = dropped
--   none    = not affected (never used at launch; renewal_failed still waits for morning)
create type public.push_quiet_action as enum ('hold', 'deliver', 'drop', 'none');
create type public.push_status as enum (
  'queued', 'sent', 'delivered', 'opened', 'skipped_cap', 'skipped_quiet', 'skipped_pref', 'failed'
);
create type public.campaign_status as enum ('draft', 'in_review', 'scheduled', 'sending', 'sent', 'paused', 'cancelled');
create type public.banner_placement as enum ('home_top', 'credits', 'launch_modal');
create type public.banner_state as enum ('draft', 'scheduled', 'live', 'ended');
create type public.export_kind as enum ('readers', 'subscriptions', 'transactions', 'author_earnings', 'books', 'reports');
create type public.export_status as enum ('counting', 'building', 'ready', 'failed', 'expired');

-- ─── Push tokens: FCM state on flow 01's devices ────────────────────────────
alter table public.user_devices
  add column push_platform text not null default 'android' check (push_platform in ('android', 'ios')),
  add column push_token_at timestamptz,
  add column push_disabled_at timestamptz;
-- One device row per token (rule 11): a token moved to a new account leaves the old row.
create unique index user_devices_push_token_idx on public.user_devices (push_token) where push_token is not null;

-- ─── push_types (staff switches and wording) ────────────────────────────────
create table public.push_types (
  key text primary key,
  label text not null,
  category public.push_category not null,
  enabled boolean not null default true,
  can_reader_disable boolean not null default true,
  -- Shown under "Automatic notifications" with an on/off switch (can_switch_off) and wording.
  automatic boolean not null default false,
  can_switch_off boolean not null default true,
  quiet_action public.push_quiet_action not null default 'hold',
  -- Capped by the 2-per-7-days marketing rule (rule 7).
  capped boolean not null default false,
  collapse_key text,
  ttl_seconds int not null default 86400 check (ttl_seconds between 60 and 2419200),
  title_template text not null default '',
  body_template text not null default '',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  switched_at timestamptz,
  switched_by uuid references public.profiles (id)
);
create trigger push_types_updated_at before update on public.push_types
  for each row execute function public.set_updated_at();

-- FCM TTL: 24 hours non-urgent, 4 days Account (Offline edge case).
insert into public.push_types (key, label, category, can_reader_disable, automatic, can_switch_off, quiet_action,
                               capped, collapse_key, ttl_seconds, title_template, body_template, enabled) values
  ('club_message', 'Club and room messages', 'messages', true, false, true, 'hold', false, 'group', 86400,
   '{{group_name}}', '{{sender}}: {{preview}}', true),
  ('author_reply', 'Reply from an author', 'messages', true, false, true, 'hold', false, 'dm', 86400,
   'New reply from {{author}}', 'Open to read it', true),
  ('note_reply', 'Replies to your notes', 'messages', true, false, true, 'hold', false, 'note', 86400,
   '{{sender}} replied to your note', '{{preview}}', true),
  ('room_starting', 'Reading room starting', 'messages', true, true, true, 'drop', false, 'room', 3600,
   '{{room_name}} starts in 15 minutes', 'Join the room when you''re ready', true),
  ('room_finished', 'A room member finished', 'messages', true, false, true, 'hold', false, 'room', 86400,
   '{{sender}} finished {{book_title}}', 'Say well done in {{room_name}}', true),
  ('author_new_post', 'New post from an author you follow', 'authors', true, true, true, 'hold', false, 'author', 86400,
   '{{author}} posted', '{{preview}}', true),
  ('author_new_book', 'New chapter or book from an author you follow', 'authors', true, true, true, 'hold', false,
   'author', 86400, '{{author}} has something new', '{{book_title}} is out now', true),
  ('reading_reminder', 'Reading reminder', 'reminders', true, true, true, 'hold', false, 'reminder', 86400,
   'Pick up where you stopped', '{{book_title}} is waiting for you', true),
  ('new_arrival', 'New arrivals', 'marketing', true, false, true, 'drop', true, null, 86400,
   '{{title}}', '{{body}}', true),
  ('offer', 'Offers', 'marketing', true, false, true, 'drop', true, null, 86400, '{{title}}', '{{body}}', true),
  ('campaign', 'Staff push', 'marketing', true, false, true, 'drop', true, null, 86400, '{{title}}', '{{body}}', true),
  ('credits_low', 'Credits running low', 'account', false, true, true, 'deliver', false, 'credits', 345600,
   'You have {{balance}} credits left', 'Top up or change plan to keep reading', false),
  ('renewal_failed', 'Renewal failed', 'account', false, true, false, 'deliver', false, 'billing', 345600,
   'We couldn''t renew your plan', 'Update your payment to keep your credits', true),
  ('author_approved', 'Author application approved', 'account', false, true, true, 'deliver', false, 'author_app',
   345600, 'You''re an Arpedia author', 'Open Studio to add your first book', true),
  ('book_approved', 'Book approved and published', 'account', false, true, true, 'deliver', false, 'book_review',
   345600, '{{book_title}} is live', 'Readers can find it now', true),
  ('changes_requested', 'Changes requested', 'account', false, true, true, 'deliver', false, 'book_review', 345600,
   'Changes needed on {{book_title}}', '{{note_first_line}}', true),
  ('moderation_notice', 'Moderation notice', 'account', false, false, false, 'deliver', false, 'moderation', 345600,
   'About your post', 'Open to see what happened', true),
  ('appeal_decision', 'Appeal decision', 'account', false, false, false, 'deliver', false, 'appeal', 345600,
   'We''ve looked at your appeal', 'Open to see the decision', true),
  ('ticket_reply', 'Support reply', 'account', false, false, false, 'deliver', false, 'ticket', 345600,
   'Arpedia support replied', 'Open to read the reply', true),
  ('report_actioned', 'Report outcome', 'account', false, false, false, 'deliver', false, 'report', 345600,
   'Thanks for your report', 'We''ve acted on it', true);

-- ─── push_log ───────────────────────────────────────────────────────────────
-- One row per recipient per push. Kept 90 days (pg_cron purge; partitioning by month waits
-- until volume needs it). Status only moves forward: see push_status_rank().
create table public.push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null references public.push_types (key),
  category public.push_category not null,
  campaign_id uuid,
  variant text check (variant in ('a', 'b')),
  status public.push_status not null default 'queued',
  skip_reason text,
  collapse_key text,
  data jsonb not null default '{}',
  ticket_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz
);
create index push_log_user_idx on public.push_log (user_id, created_at desc);
create index push_log_marketing_idx on public.push_log (user_id, created_at desc)
  where category = 'marketing' and status in ('queued', 'sent', 'delivered', 'opened');
create index push_log_campaign_idx on public.push_log (campaign_id) where campaign_id is not null;
create index push_log_tickets_idx on public.push_log using gin (ticket_ids);

-- Pushes held by quiet hours, released at release_at (pg_cron every 5 minutes).
create table public.push_held (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null references public.push_types (key),
  payload jsonb not null,
  drop_if_older boolean not null default true,
  release_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index push_held_release_idx on public.push_held (release_at);

-- Last author push per reader and author, for "1 per author per day" (rule 1).
create table public.push_author_daily (
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  primary key (user_id, author_id, day)
);

-- ─── campaigns ──────────────────────────────────────────────────────────────
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (char_length(title) <= 65),
  body text not null default '' check (char_length(body) <= 178),
  -- {kind: all | subscribers | lapsed_30 | genre | authors, genre_id?}
  audience jsonb not null default '{"kind": "all"}',
  -- {kind: book | author | room | screen, id?, screen?}
  open_target jsonb not null default '{"kind": "screen", "screen": "home"}',
  send_at timestamptz,
  status public.campaign_status not null default 'draft',
  is_service boolean not null default false,
  skip_capped boolean not null default true,
  -- {title_b, split: 0.2, decided_at?, winner?}
  ab_test jsonb,
  respect_quiet boolean not null default true,
  quiet_override_reason text,
  reach int,
  confirmed_reach int,
  moved_from timestamptz,
  created_by uuid references public.profiles (id),
  reviewed_by uuid references public.profiles (id),
  review_requested_at timestamptz,
  source_campaign_id uuid references public.campaigns (id) on delete set null,
  resend_unopened boolean not null default false,
  sent_at timestamptz,
  counts jsonb not null default '{"queued": 0, "sent": 0, "delivered": 0, "opened": 0, "conversions": 0, "skipped_cap": 0, "failed": 0}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index campaigns_due_idx on public.campaigns (send_at) where status = 'scheduled';
create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();
alter table public.push_log add foreign key (campaign_id) references public.campaigns (id) on delete set null;

-- ─── banners ────────────────────────────────────────────────────────────────
create table public.banners (
  id uuid primary key default gen_random_uuid(),
  placement public.banner_placement not null,
  headline text not null default '' check (char_length(headline) <= 48),
  body text not null default '' check (char_length(body) <= 120),
  button_label text not null default '' check (char_length(button_label) <= 24),
  -- {kind: book | author | room | screen | web, id?, screen?, url?}
  target jsonb,
  image_url text,
  -- {kind: all | subscribers | genre | below_version, genre_id?, version?}
  audience jsonb not null default '{"kind": "all"}',
  starts_at timestamptz,
  ends_at timestamptz,
  priority int not null default 0,
  dismissible boolean not null default true,
  state public.banner_state not null default 'draft',
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger banners_updated_at before update on public.banners
  for each row execute function public.set_updated_at();

create table public.banner_dismissals (
  banner_id uuid not null references public.banners (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (banner_id, user_id)
);
create table public.banner_daily (
  banner_id uuid not null references public.banners (id) on delete cascade,
  day date not null,
  shown int not null default 0,
  taps int not null default 0,
  primary key (banner_id, day)
);
-- Launch modal: one per reader per day (rule 21).
create table public.banner_modal_seen (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  banner_id uuid not null references public.banners (id) on delete cascade,
  primary key (user_id, day)
);

-- ─── email templates ────────────────────────────────────────────────────────
create table public.email_templates (
  key text primary key,
  name text not null,
  trigger text not null,
  can_disable boolean not null default true,
  enabled boolean not null default true,
  finance_review boolean not null default false,
  variables text[] not null default '{first_name}',
  position int not null default 0
);
create table public.email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_key text not null references public.email_templates (key),
  number int not null,
  subject text not null check (char_length(subject) between 1 and 120),
  preheader text not null default '' check (char_length(preheader) <= 140),
  body text not null check (char_length(body) between 1 and 20000),
  edited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (template_key, number)
);
create trigger email_template_versions_no_update before update or delete on public.email_template_versions
  for each row execute function public.reject_change();
-- Sends and Resend events (volume and open rate, 30 days).
create table public.email_sends (
  id bigint generated always as identity primary key,
  template_key text not null references public.email_templates (key),
  version_id uuid references public.email_template_versions (id),
  user_id uuid references public.profiles (id) on delete set null,
  resend_id text unique,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  bounced_at timestamptz
);
create index email_sends_template_idx on public.email_sends (template_key, sent_at desc);

insert into public.email_templates (key, name, trigger, can_disable, finance_review, variables, position) values
  ('verify_email', 'Verify your email', 'Sign up', false, false, '{first_name,code}', 1),
  ('welcome', 'Welcome to Arpedia', 'Finished onboarding', true, false, '{first_name}', 2),
  ('receipt', 'Payment receipt', 'Plan or top-up paid', false, true, '{first_name,amount,item,date}', 3),
  ('renewal_reminder', 'Your plan renews soon', '3 days before renewal', true, true, '{first_name,plan,amount,date}', 4),
  ('renewal_failed', 'We couldn''t renew your plan', 'Renewal failed (day 1, 3, 5)', false, true,
   '{first_name,plan,amount,date}', 5),
  ('new_device', 'New sign-in to your account', 'Sign-in on a new device', false, false, '{first_name,device,city,date}', 6),
  ('author_approved', 'You''re an Arpedia author', 'Author application approved', true, false, '{first_name}', 7),
  ('book_approved', 'Your book is live', 'Book approved and published', true, false, '{first_name,book_title}', 8),
  ('changes_requested', 'Changes needed on your book', 'Changes requested', true, false,
   '{first_name,book_title,note}', 9),
  ('payout_sent', 'Your payout is on its way', 'Payout released', false, true, '{first_name,amount,date}', 10),
  ('staff_invite', 'You''ve been invited to Arpedia staff', 'Staff invite', false, false, '{first_name,role,link}', 11);

insert into public.email_template_versions (template_key, number, subject, preheader, body)
select t.key, 1, t.name, '', 'Hi {{first_name}},' || chr(10) || chr(10) || t.name || '.' || chr(10) || chr(10) || 'The Arpedia team'
from public.email_templates t;

-- ─── analytics_daily ────────────────────────────────────────────────────────
-- Aggregates only: no user ids. dim holds at most plan, genre, source, book_id, hour, bucket.
create table public.analytics_daily (
  day date not null,
  metric text not null,
  dim jsonb not null default '{}',
  value numeric not null,
  updated_at timestamptz not null default now(),
  unique (day, metric, dim)
);
create index analytics_daily_metric_idx on public.analytics_daily (metric, day);

-- ─── exports ────────────────────────────────────────────────────────────────
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  kind public.export_kind not null,
  params jsonb not null default '{}',
  columns text[] not null default '{}',
  includes_pii boolean not null default false,
  reason text,
  created_by uuid not null references public.profiles (id),
  status public.export_status not null default 'counting',
  row_count int,
  file_key text,
  error text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index exports_creator_idx on public.exports (created_by, created_at desc);

create table public.export_schedules (
  id uuid primary key default gen_random_uuid(),
  report_kind text not null check (report_kind in ('monthly_earnings', 'weekly_kpi', 'weekly_safety', 'quarterly_data_requests')),
  recipients text[] not null default '{}',
  cron text not null,
  enabled boolean not null default true,
  last_sent_at timestamptz,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (report_kind)
);
insert into public.export_schedules (report_kind, recipients, cron) values
  ('monthly_earnings', '{finance@arpedia.africa}', '0 8 1 * *'),
  ('weekly_kpi', '{team@arpedia.africa}', '0 8 * * 1'),
  ('weekly_safety', '{safety@arpedia.africa}', '0 9 * * 1'),
  ('quarterly_data_requests', '{legal@arpedia.africa}', '0 9 1 1,4,7,10 *');

select pgmq.create('push_fanout');
select pgmq.create('export_jobs');

-- ─── Helpers: quiet hours, cap, prefs ───────────────────────────────────────
-- True when local time of p_at in p_tz is inside [p_start, p_end), windows may cross midnight.
create function public.in_quiet_window(p_at timestamptz, p_tz text, p_start time, p_end time) returns boolean
language sql stable set search_path = '' as $$
  select case
    when p_start = p_end then false
    when p_start < p_end then (p_at at time zone p_tz)::time >= p_start and (p_at at time zone p_tz)::time < p_end
    else (p_at at time zone p_tz)::time >= p_start or (p_at at time zone p_tz)::time < p_end
  end
$$;

-- The next end of the window at or after p_at (p_at itself when outside the window).
create function public.quiet_window_end(p_at timestamptz, p_tz text, p_start time, p_end time) returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when not public.in_quiet_window(p_at, p_tz, p_start, p_end) then p_at
    when (p_at at time zone p_tz)::time < p_end
      then (((p_at at time zone p_tz)::date + p_end)::timestamp at time zone p_tz)
    else ((((p_at at time zone p_tz)::date + 1) + p_end)::timestamp at time zone p_tz)
  end
$$;

-- Marketing pushes this reader got in the rolling last 7 days (rule 7). Skipped rows don't count.
create function public.marketing_pushes_7d(p_user uuid, p_at timestamptz default now()) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.push_log
  where user_id = p_user and category = 'marketing' and status in ('queued', 'sent', 'delivered', 'opened')
    and created_at > p_at - interval '7 days' and created_at <= p_at
$$;

create function public.at_marketing_cap(p_user uuid, p_at timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.marketing_pushes_7d(p_user, p_at) >= 2
$$;

-- The reader's push preferences in flow 15's shape. Reads flow 10's notification_preferences
-- when that table exists; flow 10's column defaults apply when the reader has no row there.
-- Before flow 10, the flow 15 defaults (rule 3) apply.
create function public.push_prefs(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
begin
  if to_regclass('public.notification_preferences') is null then
    return jsonb_build_object('messages_level', 'mentions', 'authors_new', true, 'note_replies', true,
      'reading_reminders', true, 'marketing', true, 'quiet_hours_on', true, 'quiet_start', '22:00',
      'quiet_end', '06:00', 'timezone', 'Africa/Lagos');
  end if;
  execute 'select to_jsonb(np) from public.notification_preferences np where np.user_id = $1' into r using p_user;
  r := coalesce(r, '{}');
  return jsonb_build_object(
    'messages_level', coalesce(r ->> 'messages_level',
      case when coalesce((r ->> 'clubs')::boolean, true) then 'mentions' else 'off' end),
    'authors_new', coalesce((r ->> 'authors')::boolean, true),
    'note_replies', coalesce((r ->> 'note_replies')::boolean, true),
    'reading_reminders', coalesce((r ->> 'reminders')::boolean, true),
    'marketing', coalesce((r ->> 'offers')::boolean, false),
    'quiet_hours_on', coalesce((r ->> 'quiet_enabled')::boolean, false),
    'quiet_start', coalesce(left(r ->> 'quiet_start', 5), '22:00'),
    'quiet_end', coalesce(left(r ->> 'quiet_end', 5), '06:00'),
    'timezone', coalesce(r ->> 'timezone', 'Africa/Lagos'));
end $$;

-- Platform marketing block: 22:00 to 07:00 WAT for everyone (rule 4).
create function public.in_marketing_block(p_at timestamptz default now()) returns boolean
language sql stable set search_path = '' as $$
  select public.in_quiet_window(p_at, 'Africa/Lagos', '22:00', '07:00')
$$;

-- A reader who can get pushes at all: not deleted, at least one live token.
create function public.has_push_token(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_devices d
                 where d.user_id = p_user and d.push_token is not null and d.revoked_at is null
                   and d.push_disabled_at is null)
$$;

-- ─── Audience (campaigns) ───────────────────────────────────────────────────
-- Everyone in a campaign audience before push rules. Subscribers and lapsed need flows 03/04;
-- until then subscribers is nobody and lapsed falls back to device last-seen.
create function public.audience_members(p_audience jsonb) returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  k text := coalesce(p_audience ->> 'kind', 'all');
begin
  if k = 'all' then
    return query select p.id from public.profiles p where p.deleted_at is null and p.is_reader;
  elsif k = 'authors' then
    return query select p.id from public.profiles p where p.deleted_at is null and p.is_author;
  elsif k = 'genre' then
    return query select p.id from public.profiles p
      join public.user_genres ug on ug.user_id = p.id and ug.genre_id = (p_audience ->> 'genre_id')::uuid
      where p.deleted_at is null;
  elsif k = 'subscribers' then
    if to_regclass('public.subscriptions') is not null then
      return query execute 'select distinct s.user_id from public.subscriptions s
        join public.profiles p on p.id = s.user_id and p.deleted_at is null
        where s.status::text in (''active'', ''trialing'', ''grace'')';
    end if;
  elsif k = 'lapsed_30' then
    if to_regclass('public.reading_sessions') is not null then
      return query execute 'select p.id from public.profiles p where p.deleted_at is null and p.is_reader
        and p.created_at < now() - interval ''30 days''
        and not exists (select 1 from public.reading_sessions r where r.user_id = p.id
                        and r.started_at > now() - interval ''30 days'')';
    else
      return query select p.id from public.profiles p where p.deleted_at is null and p.is_reader
        and p.created_at < now() - interval '30 days'
        and not exists (select 1 from public.user_devices d where d.user_id = p.id
                        and d.last_seen_at > now() - interval '30 days');
    end if;
  else
    raise exception 'Unknown audience %', k using errcode = '22023';
  end if;
end $$;

-- Readers a campaign may push right now, with the reason each one is left out.
-- reason null = gets it. Marketing (non-service): prefs, minors (no marketing at all), cap.
create function public.campaign_recipients(p_audience jsonb, p_is_service boolean, p_skip_capped boolean,
  p_at timestamptz default now())
returns table (user_id uuid, reason text)
language sql stable security definer set search_path = '' as $$
  select a.id,
    case
      when not public.has_push_token(a.id) then 'no_token'
      when not p_is_service and public.is_minor(a.id) then 'minor'
      when not p_is_service and not (public.push_prefs(a.id) ->> 'marketing')::boolean then 'pref'
      when not p_is_service and p_skip_capped and public.at_marketing_cap(a.id, p_at) then 'cap'
    end
  from public.audience_members(p_audience) a (id)
$$;

-- Live reach for the composer (rule 15/16).
create function public.campaign_reach(p_audience jsonb, p_is_service boolean default false,
  p_skip_capped boolean default true) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('send_push') or (public.is_staff_any(array['publisher', 'moderator']::public.staff_role[])
          and public.staff_mfa_ok())) then
    raise exception 'Not allowed: send_push' using errcode = 'insufficient_privilege';
  end if;
  return (select jsonb_build_object(
      'reach', count(*) filter (where reason is null),
      'left_out_cap', count(*) filter (where reason = 'cap'))
    from public.campaign_recipients(p_audience, p_is_service, p_skip_capped));
end $$;

-- User ids for a campaign, resolved at send time (Server: resolve_audience).
create function public.resolve_audience(p_campaign uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r.user_id from public.campaigns c,
    public.campaign_recipients(c.audience, c.is_service, c.skip_capped) r
  where c.id = p_campaign and r.reason is null
    and not exists (select 1 from public.push_log l where l.campaign_id = c.id and l.user_id = r.user_id)
    and (not c.resend_unopened or not exists (
      select 1 from public.push_log l where l.campaign_id = c.source_campaign_id and l.user_id = r.user_id
        and l.status = 'opened'))
$$;

-- ─── Staff: campaigns ───────────────────────────────────────────────────────
create function public._can_draft_push() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_permission('send_push')
    or (public.staff_mfa_ok() and public.is_staff_any(array['publisher', 'moderator']::public.staff_role[]))
$$;

create function public._validate_target(p_target jsonb, p_allow_web boolean) returns void
language plpgsql immutable set search_path = '' as $$
declare
  k text := p_target ->> 'kind';
begin
  if p_target is null then return; end if;
  if k in ('book', 'author', 'room') then
    if (p_target ->> 'id') is null then raise exception 'Choose what it opens' using errcode = '22023'; end if;
  elsif k = 'screen' then
    if coalesce(p_target ->> 'screen', '') not in ('home', 'library', 'credits', 'plans', 'discover') then
      raise exception 'Unknown app screen' using errcode = '22023';
    end if;
  elsif k = 'web' and p_allow_web then
    if coalesce(p_target ->> 'url', '') !~ '^https://([a-z0-9-]+\.)*arpedia\.africa(/|$)' then
      raise exception 'Links can only open arpedia.africa pages' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown target %', k using errcode = '22023';
  end if;
end $$;

-- Create or update a draft. Returns the campaign id.
create function public.staff_save_campaign(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.campaigns;
  v_id uuid;
begin
  if not public._can_draft_push() then
    raise exception 'Not allowed: send_push' using errcode = 'insufficient_privilege';
  end if;
  if p_id is not null then
    select * into c from public.campaigns where id = p_id for update;
    if not found then raise exception 'Push not found' using errcode = 'P0002'; end if;
    if c.status not in ('draft', 'in_review', 'paused') then
      raise exception 'Only drafts and paused pushes can be edited' using errcode = '22023';
    end if;
  end if;
  if char_length(coalesce(p_fields ->> 'title', c.title, '')) > 65 then
    raise exception 'Title is longer than 65 characters' using errcode = '22001';
  end if;
  if char_length(coalesce(p_fields ->> 'body', c.body, '')) > 178 then
    raise exception 'Message is longer than 178 characters' using errcode = '22001';
  end if;
  if p_fields ? 'open_target' then perform public._validate_target(p_fields -> 'open_target', false); end if;
  if p_fields ? 'audience' then perform 1 from public.audience_members(p_fields -> 'audience') limit 1; end if;
  if coalesce((p_fields ->> 'respect_quiet')::boolean, true) = false then
    if not public.is_staff('super_admin') or not public.staff_mfa_ok() then
      raise exception 'Only a Super admin can send outside quiet hours' using errcode = 'insufficient_privilege';
    end if;
    if char_length(trim(coalesce(p_fields ->> 'quiet_override_reason', ''))) < 5 then
      raise exception 'Say why this push can''t wait' using errcode = '22023';
    end if;
  end if;
  if p_fields ? 'ab_test' and jsonb_typeof(p_fields -> 'ab_test') = 'object'
     and char_length(coalesce(p_fields -> 'ab_test' ->> 'title_b', '')) not between 1 and 65 then
    raise exception 'Second title must be 1 to 65 characters' using errcode = '22001';
  end if;

  if p_id is null then
    insert into public.campaigns (title, body, audience, open_target, is_service, skip_capped, ab_test,
                                  respect_quiet, quiet_override_reason, created_by)
    values (coalesce(p_fields ->> 'title', ''), coalesce(p_fields ->> 'body', ''),
            coalesce(p_fields -> 'audience', '{"kind": "all"}'),
            coalesce(p_fields -> 'open_target', '{"kind": "screen", "screen": "home"}'),
            coalesce((p_fields ->> 'is_service')::boolean, false),
            coalesce((p_fields ->> 'skip_capped')::boolean, true),
            nullif(p_fields -> 'ab_test', 'null'::jsonb),
            coalesce((p_fields ->> 'respect_quiet')::boolean, true),
            p_fields ->> 'quiet_override_reason', uid)
    returning id into v_id;
    perform public.write_audit('engage', 'campaign.create', 'campaign', v_id::text, p_fields ->> 'title', null, null,
                               p_fields, null);
  else
    update public.campaigns set
      title = coalesce(p_fields ->> 'title', title),
      body = coalesce(p_fields ->> 'body', body),
      audience = coalesce(p_fields -> 'audience', audience),
      open_target = coalesce(p_fields -> 'open_target', open_target),
      is_service = coalesce((p_fields ->> 'is_service')::boolean, is_service),
      skip_capped = coalesce((p_fields ->> 'skip_capped')::boolean, skip_capped),
      ab_test = case when p_fields ? 'ab_test' then nullif(p_fields -> 'ab_test', 'null'::jsonb) else ab_test end,
      respect_quiet = coalesce((p_fields ->> 'respect_quiet')::boolean, respect_quiet),
      quiet_override_reason = coalesce(p_fields ->> 'quiet_override_reason', quiet_override_reason),
      status = case when status = 'in_review' then 'draft' else status end,
      reviewed_by = null
    where id = p_id;
    v_id := p_id;
    perform public.write_audit('engage', 'campaign.edit', 'campaign', v_id::text, c.title, null, to_jsonb(c),
                               p_fields, null);
  end if;
  return v_id;
end $$;

-- Publisher and Moderator ask a sender to look; senders review others' pushes (rule 18).
create function public.staff_request_campaign_review(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._can_draft_push() then
    raise exception 'Not allowed: send_push' using errcode = 'insufficient_privilege';
  end if;
  update public.campaigns set status = 'in_review', review_requested_at = now()
  where id = p_id and status = 'draft';
  if not found then raise exception 'Only drafts can go for review' using errcode = '22023'; end if;
  perform public.write_audit('engage', 'campaign.request_review', 'campaign', p_id::text);
end $$;

create function public.staff_review_campaign(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
begin
  perform public.require_permission('send_push');
  select * into c from public.campaigns where id = p_id for update;
  if not found then raise exception 'Push not found' using errcode = 'P0002'; end if;
  if c.created_by = auth.uid() then
    raise exception 'Someone other than the author must review this push' using errcode = 'insufficient_privilege';
  end if;
  update public.campaigns set reviewed_by = auth.uid(),
    status = case when status = 'in_review' then 'draft' else status end
  where id = p_id;
  perform public.write_audit('engage', 'campaign.review', 'campaign', p_id::text, c.title);
end $$;

-- Schedule (or send now when p_send_at is null). Rules 17 and 18:
--   * inside 22:00–07:00 WAT moves to 07:00 (unless respect_quiet is off) and says so;
--   * more than 1,000 readers needs p_confirm; the reply has needs_confirm and nothing changes;
--   * more than 10,000 readers needs a reviewer other than the author (Q98 default).
create function public.staff_schedule_campaign(p_id uuid, p_send_at timestamptz default null,
  p_confirm boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  v_at timestamptz := coalesce(p_send_at, now());
  v_moved boolean := false;
  v_reach int;
begin
  perform public.require_permission('send_push');
  select * into c from public.campaigns where id = p_id for update;
  if not found then raise exception 'Push not found' using errcode = 'P0002'; end if;
  if c.status not in ('draft', 'in_review', 'paused') then
    raise exception 'This push is already %', c.status using errcode = '22023';
  end if;
  if char_length(trim(c.title)) = 0 or char_length(trim(c.body)) = 0 then
    raise exception 'Add a title and a message' using errcode = '22023';
  end if;
  if v_at < now() - interval '1 minute' then
    raise exception 'Pick a time in the future' using errcode = '22023';
  end if;
  if c.respect_quiet and public.in_marketing_block(v_at) then
    v_at := public.quiet_window_end(v_at, 'Africa/Lagos', '22:00', '07:00');
    v_moved := true;
  end if;
  select count(*) into v_reach from public.resolve_audience(p_id);
  if v_reach > 10000 and (c.reviewed_by is null or c.reviewed_by = c.created_by) then
    return jsonb_build_object('status', c.status, 'needs_review', true, 'reach', v_reach);
  end if;
  if v_reach > 1000 and not p_confirm then
    return jsonb_build_object('status', c.status, 'needs_confirm', true, 'reach', v_reach, 'send_at', v_at,
                              'moved', v_moved);
  end if;
  update public.campaigns set status = 'scheduled', send_at = v_at, reach = v_reach,
    confirmed_reach = case when p_confirm then v_reach end,
    moved_from = case when v_moved then coalesce(p_send_at, now()) end
  where id = p_id;
  perform public.write_audit('engage', 'campaign.schedule', 'campaign', p_id::text, c.title,
    case when v_moved then 'Moved to 07:00 WAT (quiet hours)' end, null,
    jsonb_build_object('send_at', v_at, 'reach', v_reach, 'moved', v_moved));
  return jsonb_build_object('status', 'scheduled', 'send_at', v_at, 'moved', v_moved, 'reach', v_reach,
                            'needs_confirm', false);
end $$;

create function public.staff_pause_campaign(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('send_push');
  update public.campaigns set status = 'paused' where id = p_id and status = 'scheduled';
  if not found then raise exception 'Only scheduled pushes can be paused' using errcode = '22023'; end if;
  perform public.write_audit('engage', 'campaign.pause', 'campaign', p_id::text);
end $$;

create function public.staff_cancel_campaign(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('send_push');
  update public.campaigns set status = 'cancelled' where id = p_id and status in ('scheduled', 'paused');
  if not found then raise exception 'Only scheduled or paused pushes can be cancelled' using errcode = '22023'; end if;
  perform public.write_audit('engage', 'campaign.cancel', 'campaign', p_id::text);
end $$;

create function public.staff_delete_campaign_draft(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public._can_draft_push() then
    raise exception 'Not allowed: send_push' using errcode = 'insufficient_privilege';
  end if;
  delete from public.campaigns where id = p_id and status in ('draft', 'in_review');
  if not found then raise exception 'Only drafts can be deleted' using errcode = '22023'; end if;
  perform public.write_audit('engage', 'campaign.delete', 'campaign', p_id::text);
end $$;

-- Duplicate, or "Send again to readers who did not open it" (p_unopened).
create function public.staff_duplicate_campaign(p_id uuid, p_unopened boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  v_id uuid;
begin
  if not public._can_draft_push() then
    raise exception 'Not allowed: send_push' using errcode = 'insufficient_privilege';
  end if;
  select * into c from public.campaigns where id = p_id;
  if not found then raise exception 'Push not found' using errcode = 'P0002'; end if;
  if p_unopened and c.status <> 'sent' then
    raise exception 'Only sent pushes can be sent again' using errcode = '22023';
  end if;
  insert into public.campaigns (title, body, audience, open_target, is_service, skip_capped, respect_quiet,
                                created_by, source_campaign_id, resend_unopened)
  values (c.title, c.body, c.audience, c.open_target, c.is_service, c.skip_capped, true, auth.uid(),
          case when p_unopened then c.id end, p_unopened)
  returning id into v_id;
  perform public.write_audit('engage', case when p_unopened then 'campaign.resend' else 'campaign.duplicate' end,
                             'campaign', v_id::text, c.title, null, null, jsonb_build_object('from', p_id));
  return v_id;
end $$;

-- campaigns list (rule 14): tab all | sent | scheduled | drafts.
create function public.staff_list_campaigns(p_tab text default 'all') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public._can_draft_push() or public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'stats', (select jsonb_build_object(
        'sent_month', count(*) filter (where l.status in ('sent', 'delivered', 'opened')),
        'delivered_pct', round(100.0 * count(*) filter (where l.status in ('delivered', 'opened'))
                               / nullif(count(*) filter (where l.status in ('sent', 'delivered', 'opened')), 0), 1),
        'opened_pct', round(100.0 * count(*) filter (where l.status = 'opened')
                            / nullif(count(*) filter (where l.status in ('delivered', 'opened')), 0), 1))
      from public.push_log l where l.created_at > date_trunc('month', now())),
    'counts', (select jsonb_build_object(
        'all', count(*), 'sent', count(*) filter (where status = 'sent'),
        'scheduled', count(*) filter (where status in ('scheduled', 'paused', 'sending')),
        'drafts', count(*) filter (where status in ('draft', 'in_review')))
      from public.campaigns),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'body', c.body, 'audience', c.audience, 'open_target', c.open_target,
        'status', c.status, 'send_at', c.send_at, 'sent_at', c.sent_at, 'reach', c.reach, 'counts', c.counts,
        'is_service', c.is_service, 'created_by', (select p.full_name from public.profiles p where p.id = c.created_by),
        'reviewed', c.reviewed_by is not null, 'moved_from', c.moved_from, 'updated_at', c.updated_at)
        order by coalesce(c.send_at, c.updated_at) desc)
      from public.campaigns c
      where case p_tab when 'sent' then c.status = 'sent'
                       when 'scheduled' then c.status in ('scheduled', 'paused', 'sending')
                       when 'drafts' then c.status in ('draft', 'in_review')
                       else true end), '[]'::jsonb),
    'automatic', coalesce((select jsonb_agg(jsonb_build_object(
        'key', t.key, 'label', t.label, 'enabled', t.enabled, 'can_switch_off', t.can_switch_off,
        'title_template', t.title_template, 'body_template', t.body_template, 'switched_at', t.switched_at,
        'switched_by', (select p.full_name from public.profiles p where p.id = t.switched_by))
        order by t.category, t.key)
      from public.push_types t where t.automatic), '[]'::jsonb));
end $$;

create function public.staff_get_campaign(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public._can_draft_push() or public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return (select to_jsonb(c) || jsonb_build_object(
      'similar_recent', (select c2.title from public.campaigns c2 where c2.id <> c.id and c2.status in ('sent', 'sending')
                         and c2.sent_at > now() - interval '6 hours'
                         and extensions.similarity(lower(c2.title), lower(c.title)) > 0.6
                         order by c2.sent_at desc limit 1))
    from public.campaigns c where c.id = p_id);
end $$;

-- Automatic notification switch and wording (rule 19). Logged with who and when.
create function public.staff_set_push_type(p_key text, p_enabled boolean default null,
  p_title text default null, p_body text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.push_types;
begin
  perform public.require_permission('send_push');
  select * into t from public.push_types where key = p_key for update;
  if not found then raise exception 'Unknown notification' using errcode = 'P0002'; end if;
  if p_enabled is false and not t.can_switch_off then
    raise exception 'This notification can''t be switched off' using errcode = '22023';
  end if;
  if char_length(coalesce(p_title, t.title_template)) > 65 or char_length(coalesce(p_body, t.body_template)) > 178 then
    raise exception 'Wording is too long' using errcode = '22001';
  end if;
  update public.push_types set
    enabled = coalesce(p_enabled, enabled),
    title_template = coalesce(p_title, title_template),
    body_template = coalesce(p_body, body_template),
    updated_by = auth.uid(),
    switched_at = case when p_enabled is distinct from null and p_enabled <> t.enabled then now() else switched_at end,
    switched_by = case when p_enabled is distinct from null and p_enabled <> t.enabled then auth.uid() else switched_by end
  where key = p_key;
  perform public.write_audit('engage', case when p_enabled is null then 'push_type.wording'
                                            when p_enabled then 'push_type.on' else 'push_type.off' end,
                             'push_type', p_key, t.label, null,
                             jsonb_build_object('enabled', t.enabled, 'title', t.title_template, 'body', t.body_template),
                             jsonb_build_object('enabled', p_enabled, 'title', p_title, 'body', p_body));
end $$;

-- ─── Worker: campaign-runner and push-dispatcher ────────────────────────────
-- Due campaigns moved scheduled → sending by compare and set, so a double run can't send twice.
create function public.claim_due_campaigns(p_limit int default 5) returns setof public.campaigns
language sql security definer set search_path = '' as $$
  update public.campaigns c set status = 'sending'
  where c.id in (select id from public.campaigns where status = 'scheduled' and send_at <= now()
                 order by send_at limit p_limit for update skip locked)
    and c.status = 'scheduled'
  returning c.*
$$;

create function public.finish_campaign(p_id uuid, p_counts jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.campaigns set status = 'sent', sent_at = now(), counts = counts || p_counts
  where id = p_id and status = 'sending'
$$;

-- Everything the dispatcher needs to decide for each recipient (rules 1–7, 10, 13 and the
-- edge cases). The decision itself is packages/core/src/push.ts (Vitest).
create function public.push_recipients(p_user_ids uuid[], p_type text, p_group uuid default null,
  p_actor uuid default null, p_at timestamptz default now())
returns table (user_id uuid, tokens text[], prefs jsonb, marketing_7d int, is_minor boolean,
               group_muted boolean, blocked boolean, author_pushed_today boolean)
language sql stable security definer set search_path = '' as $$
  select p.id,
    coalesce((select array_agg(d.push_token) from public.user_devices d where d.user_id = p.id
              and d.push_token is not null and d.revoked_at is null and d.push_disabled_at is null), '{}'),
    public.push_prefs(p.id),
    public.marketing_pushes_7d(p.id, p_at),
    public.is_minor(p.id),
    p_group is not null and exists (select 1 from public.group_members m where m.group_id = p_group
      and m.user_id = p.id and m.notify_muted_until > p_at),
    p_actor is not null and exists (select 1 from public.user_blocks b
      where (b.blocker_id = p.id and b.blocked_id = p_actor) or (b.blocker_id = p_actor and b.blocked_id = p.id)),
    p_actor is not null and exists (select 1 from public.push_author_daily a where a.user_id = p.id
      and a.author_id = p_actor and a.day = (p_at at time zone 'Africa/Lagos')::date)
  from public.profiles p
  where p.id = any (p_user_ids) and p.deleted_at is null
    and (p_actor is null or exists (select 1 from public.profiles ap where ap.id = p_actor and ap.deleted_at is null))
$$;

-- Write the outcome for a batch of recipients. Rows: {user_id, type, status, skip_reason?,
-- campaign_id?, variant?, collapse_key?, data?, ticket_ids?, author_id?, feed?: {kind, category,
-- title, body, target_type, target_id, actor_id, book_id}}. Feed rows go through flow 02 when it exists.
create function public.log_pushes(p_rows jsonb) returns bigint[]
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_ids bigint[] := '{}';
  v_id bigint;
  v_status public.push_status;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_status := (r ->> 'status')::public.push_status;
    insert into public.push_log (user_id, type, category, campaign_id, variant, status, skip_reason, collapse_key,
                                 data, ticket_ids, sent_at)
    select (r ->> 'user_id')::uuid, t.key, t.category, (r ->> 'campaign_id')::uuid, r ->> 'variant', v_status,
           r ->> 'skip_reason', r ->> 'collapse_key', coalesce(r -> 'data', '{}'),
           coalesce(array(select jsonb_array_elements_text(r -> 'ticket_ids')), '{}'),
           case when v_status = 'sent' then now() end
    from public.push_types t where t.key = r ->> 'type'
    returning id into v_id;
    v_ids := v_ids || v_id;
    if v_status in ('queued', 'sent') and (r ->> 'author_id') is not null then
      insert into public.push_author_daily (user_id, author_id, day)
      values ((r ->> 'user_id')::uuid, (r ->> 'author_id')::uuid, (now() at time zone 'Africa/Lagos')::date)
      on conflict do nothing;
    end if;
    -- The dispatcher adds `feed` only when the reader should see the item (not muted, blocked,
    -- batched or a campaign they haven't opened), also when push is off on the phone (edge cases).
    -- Flow 02's feed takes books, authors and community; Account rows wait for it to allow them.
    if r ? 'feed' and v_status not in ('failed', 'skipped_cap')
       and r -> 'feed' ->> 'category' in ('books', 'authors', 'community')
       and to_regprocedure('public._create_notification(uuid, text, text, text, text, text, text, uuid, uuid)') is not null then
      execute 'select public._create_notification($1, $2, $3, $4, $5, $6, $7, $8, $9)'
        using (r ->> 'user_id')::uuid, r -> 'feed' ->> 'kind', r -> 'feed' ->> 'category', r -> 'feed' ->> 'title',
              coalesce(r -> 'feed' ->> 'body', ''), r -> 'feed' ->> 'target_type', r -> 'feed' ->> 'target_id',
              (r -> 'feed' ->> 'actor_id')::uuid, (r -> 'feed' ->> 'book_id')::uuid;
    end if;
  end loop;
  return v_ids;
end $$;

-- After the send: rows logged as queued (so the push carries its push_log id for push_opened)
-- move to sent or failed. Rows: {id, status: sent | failed, ticket_ids?, ticket_tokens?, error?}.
-- ticket_tokens ({ticket: token}) lets a later DeviceNotRegistered receipt disable the token.
create function public.mark_pushes_sent(p_rows jsonb) returns int
language sql security definer set search_path = '' as $$
  with u as (
    update public.push_log l set
      status = (r ->> 'status')::public.push_status,
      ticket_ids = coalesce(array(select jsonb_array_elements_text(r -> 'ticket_ids')), '{}'),
      data = case when r ? 'ticket_tokens' then l.data || jsonb_build_object('ticket_tokens', r -> 'ticket_tokens')
                  else l.data end,
      skip_reason = coalesce(r ->> 'error', l.skip_reason),
      sent_at = case when r ->> 'status' = 'sent' then now() end
    from jsonb_array_elements(p_rows) r
    where l.id = (r ->> 'id')::bigint and l.status = 'queued' and r ->> 'status' in ('sent', 'failed')
    returning 1)
  select count(*)::int from u
$$;

create function public.hold_push(p_user uuid, p_type text, p_payload jsonb, p_release_at timestamptz,
  p_drop_if_older boolean default true) returns bigint
language sql security definer set search_path = '' as $$
  insert into public.push_held (user_id, type, payload, release_at, drop_if_older)
  values (p_user, p_type, p_payload, p_release_at, p_drop_if_older) returning id
$$;

-- Due held pushes, deleted as they are taken. Those held more than 12 hours with
-- drop_if_older are dropped (rule 4).
create function public.take_held_pushes(p_limit int default 500)
returns table (user_id uuid, type text, payload jsonb, held_at timestamptz)
language sql security definer set search_path = '' as $$
  with due as (
    delete from public.push_held h
    where h.id in (select id from public.push_held where release_at <= now() order by release_at
                   limit p_limit for update skip locked)
    returning h.*
  )
  select d.user_id, d.type, d.payload, d.created_at from due d
  where not d.drop_if_older or d.created_at > now() - interval '12 hours'
$$;

-- Status order for receipts: queued < sent < delivered < opened. Skips and failures are final.
create function public.push_status_rank(p public.push_status) returns int
language sql immutable set search_path = '' as $$
  select case p when 'queued' then 0 when 'sent' then 1 when 'delivered' then 2 when 'opened' then 3 else 9 end
$$;

-- Receipts from Expo/FCM, possibly twice and out of order. Rows: {ticket_id, status:
-- delivered | failed, error?}. Status only moves forward; DeviceNotRegistered disables tokens.
create function public.apply_push_receipts(p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  n int := 0;
  k int;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    if r ->> 'status' = 'delivered' then
      update public.push_log set status = 'delivered', delivered_at = coalesce(delivered_at, now())
      where ticket_ids @> array[r ->> 'ticket_id'] and public.push_status_rank(status) < 2;
    elsif r ->> 'status' = 'failed' then
      update public.push_log set status = 'failed', skip_reason = r ->> 'error'
      where ticket_ids @> array[r ->> 'ticket_id'] and status in ('queued', 'sent');
    end if;
    get diagnostics k = row_count;
    n := n + k;
    if r ->> 'error' = 'DeviceNotRegistered' and (r ->> 'token') is not null then
      update public.user_devices set push_disabled_at = now() where push_token = r ->> 'token' and push_disabled_at is null;
    end if;
  end loop;
  return n;
end $$;

create function public.disable_push_tokens(p_tokens text[]) returns int
language sql security definer set search_path = '' as $$
  with u as (update public.user_devices set push_disabled_at = now()
             where push_token = any (p_tokens) and push_disabled_at is null returning 1)
  select count(*)::int from u
$$;

-- ─── App: tokens and push opens ─────────────────────────────────────────────
-- Store this device's Expo/FCM token on the caller's device row (registered by flow 01 at
-- sign-in). A token another account used moves to this one.
create function public.register_push_token(p_token text, p_device_id text, p_platform text default 'android',
  p_app_version text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if char_length(coalesce(p_token, '')) not between 10 and 400 then
    raise exception 'Bad push token' using errcode = '22023';
  end if;
  update public.user_devices set push_token = null
  where push_token = p_token and not (user_id = uid and device_key = p_device_id);
  update public.user_devices set push_token = p_token, push_platform = coalesce(p_platform, 'android'),
    push_token_at = now(), push_disabled_at = null, app_version = coalesce(left(p_app_version, 40), app_version),
    last_seen_at = now()
  where user_id = uid and device_key = p_device_id and revoked_at is null;
  if not found then raise exception 'Unknown device' using errcode = 'P0002'; end if;
end $$;

-- On sign-out (rule 11).
create function public.remove_push_token(p_device_id text) returns void
language sql security definer set search_path = '' as $$
  update public.user_devices set push_token = null, push_token_at = null
  where user_id = auth.uid() and device_key = p_device_id
$$;

create function public.push_opened(p_push_id bigint) returns void
language sql security definer set search_path = '' as $$
  update public.push_log set status = 'opened', opened_at = coalesce(opened_at, now()),
    delivered_at = coalesce(delivered_at, now())
  where id = p_push_id and user_id = auth.uid() and public.push_status_rank(status) < 3
$$;

-- ─── Banners ────────────────────────────────────────────────────────────────
create function public.banner_live_state(b public.banners, p_at timestamptz default now()) returns public.banner_state
language sql stable set search_path = '' as $$
  select case
    when b.state = 'draft' then 'draft'::public.banner_state
    when b.state = 'ended' or (b.ends_at is not null and b.ends_at <= p_at) then 'ended'
    when b.starts_at is not null and b.starts_at > p_at then 'scheduled'
    else 'live' end
$$;

-- p_fields: placement, headline, body, button_label, target, image_url, audience, starts_at,
-- ends_at, priority, dismissible, publish (true = leave draft).
create function public.staff_save_banner(p_id uuid, p_fields jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.banners;
  v_id uuid;
  v_publish boolean := coalesce((p_fields ->> 'publish')::boolean, false);
begin
  perform public.require_permission('send_push');
  if p_id is not null then
    select * into b from public.banners where id = p_id for update;
    if not found then raise exception 'Announcement not found' using errcode = 'P0002'; end if;
  end if;
  if char_length(coalesce(p_fields ->> 'headline', b.headline, '')) > 48 then
    raise exception 'Headline is longer than 48 characters' using errcode = '22001';
  end if;
  if char_length(coalesce(p_fields ->> 'body', b.body, '')) > 120 then
    raise exception 'Text is longer than 120 characters' using errcode = '22001';
  end if;
  if p_fields ? 'target' then perform public._validate_target(nullif(p_fields -> 'target', 'null'::jsonb), true); end if;
  if v_publish and char_length(trim(coalesce(p_fields ->> 'headline', b.headline, ''))) = 0 then
    raise exception 'Add a headline' using errcode = '22023';
  end if;
  if (p_fields ->> 'image_url') is not null and (p_fields ->> 'image_url') !~ '^https://' then
    raise exception 'Image must be an https link' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.banners (placement, headline, body, button_label, target, image_url, audience, starts_at,
                                ends_at, priority, dismissible, state, created_by, updated_by)
    values ((p_fields ->> 'placement')::public.banner_placement, coalesce(p_fields ->> 'headline', ''),
            coalesce(p_fields ->> 'body', ''), coalesce(p_fields ->> 'button_label', ''),
            nullif(p_fields -> 'target', 'null'::jsonb), p_fields ->> 'image_url',
            coalesce(p_fields -> 'audience', '{"kind": "all"}'), (p_fields ->> 'starts_at')::timestamptz,
            (p_fields ->> 'ends_at')::timestamptz, coalesce((p_fields ->> 'priority')::int, 0),
            coalesce((p_fields ->> 'dismissible')::boolean, true),
            (case when v_publish then 'live' else 'draft' end)::public.banner_state, auth.uid(), auth.uid())
    returning id into v_id;
  else
    update public.banners set
      placement = coalesce((p_fields ->> 'placement')::public.banner_placement, placement),
      headline = coalesce(p_fields ->> 'headline', headline),
      body = coalesce(p_fields ->> 'body', body),
      button_label = coalesce(p_fields ->> 'button_label', button_label),
      target = case when p_fields ? 'target' then nullif(p_fields -> 'target', 'null'::jsonb) else target end,
      image_url = case when p_fields ? 'image_url' then p_fields ->> 'image_url' else image_url end,
      audience = coalesce(p_fields -> 'audience', audience),
      starts_at = case when p_fields ? 'starts_at' then (p_fields ->> 'starts_at')::timestamptz else starts_at end,
      ends_at = case when p_fields ? 'ends_at' then (p_fields ->> 'ends_at')::timestamptz else ends_at end,
      priority = coalesce((p_fields ->> 'priority')::int, priority),
      dismissible = coalesce((p_fields ->> 'dismissible')::boolean, dismissible),
      state = case when v_publish then 'live'::public.banner_state when p_fields ? 'publish' then 'draft' else state end,
      updated_by = auth.uid()
    where id = p_id;
    v_id := p_id;
  end if;
  perform public.write_audit('engage', case when p_id is null then 'banner.create' else 'banner.edit' end,
                             'banner', v_id::text, coalesce(p_fields ->> 'headline', b.headline), null,
                             case when p_id is not null then to_jsonb(b) end, p_fields);
  return v_id;
end $$;

create function public.staff_end_banner(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('send_push');
  update public.banners set state = 'ended', ends_at = least(coalesce(ends_at, now()), now()), updated_by = auth.uid()
  where id = p_id and state <> 'ended';
  if not found then raise exception 'Announcement not found or already ended' using errcode = 'P0002'; end if;
  perform public.write_audit('engage', 'banner.end', 'banner', p_id::text);
end $$;

create function public.staff_list_banners() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public._can_draft_push() or public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'live_state', public.banner_live_state(b),
      'shown', coalesce(s.shown, 0), 'taps', coalesce(s.taps, 0),
      'tap_rate', round(100.0 * s.taps / nullif(s.shown, 0), 1))
      order by public.banner_live_state(b) = 'live' desc, b.priority desc, b.updated_at desc)
    from public.banners b
    left join lateral (select sum(d.shown)::int shown, sum(d.taps)::int taps from public.banner_daily d
                       where d.banner_id = b.id) s on true), '[]'::jsonb);
end $$;

-- Does the banner's target still exist and is it published? (edge case: hides itself)
create function public._banner_target_ok(p_target jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_target is null then return true; end if;
  if p_target ->> 'kind' = 'book' then
    return exists (select 1 from public.books b where b.id = (p_target ->> 'id')::uuid and b.status = 'live');
  elsif p_target ->> 'kind' = 'author' then
    return exists (select 1 from public.profiles p where p.id = (p_target ->> 'id')::uuid and p.deleted_at is null
                   and p.is_author);
  end if;
  return true;
end $$;

-- Active banners for the caller (rule 21/22): audience, dates, dismissals, priority; Home top
-- shows up to 2; the launch modal shows 1 per reader per day (the same one all day).
create function public.get_active_banners(p_placement public.banner_placement, p_app_version text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_day date := (now() at time zone 'Africa/Lagos')::date;
  v_seen uuid;
  v_rows jsonb;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_placement = 'launch_modal' then
    select banner_id into v_seen from public.banner_modal_seen where user_id = uid and day = v_day;
    if v_seen is not null then
      return '[]'::jsonb;
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'placement', b.placement, 'headline', b.headline,
           'body', b.body, 'button_label', b.button_label, 'target', b.target, 'image_url', b.image_url,
           'dismissible', b.dismissible) order by b.priority desc, b.created_at desc), '[]'::jsonb)
  into v_rows
  from (select * from public.banners b
        where b.placement = p_placement and public.banner_live_state(b) = 'live'
          and not exists (select 1 from public.banner_dismissals d where d.banner_id = b.id and d.user_id = uid)
          and public._banner_target_ok(b.target)
          and case coalesce(b.audience ->> 'kind', 'all')
                when 'all' then true
                when 'genre' then exists (select 1 from public.user_genres ug where ug.user_id = uid
                                          and ug.genre_id = (b.audience ->> 'genre_id')::uuid)
                when 'below_version' then p_app_version is not null
                  and string_to_array(regexp_replace(p_app_version, '[^0-9.]', '', 'g'), '.')::int[]
                      < string_to_array(b.audience ->> 'version', '.')::int[]
                when 'subscribers' then uid in (select public.audience_members('{"kind": "subscribers"}'))
                else false end
        order by b.priority desc, b.created_at desc
        limit case p_placement when 'home_top' then 2 else 1 end) b;
  if p_placement = 'launch_modal' and jsonb_array_length(v_rows) > 0 then
    insert into public.banner_modal_seen (user_id, day, banner_id)
    values (uid, v_day, (v_rows -> 0 ->> 'id')::uuid) on conflict do nothing;
  end if;
  return v_rows;
end $$;

create function public.dismiss_banner(p_banner uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  insert into public.banner_dismissals (banner_id, user_id)
  select b.id, auth.uid() from public.banners b where b.id = p_banner and b.dismissible
  on conflict do nothing;
end $$;

-- Shown and tap counts (banner_shown / banner_tapped events also go to PostHog).
create function public.banner_event(p_banner uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_kind not in ('shown', 'tapped') then raise exception 'Unknown event' using errcode = '22023'; end if;
  insert into public.banner_daily (banner_id, day, shown, taps)
  select b.id, (now() at time zone 'Africa/Lagos')::date, (p_kind = 'shown')::int, (p_kind = 'tapped')::int
  from public.banners b where b.id = p_banner
  on conflict (banner_id, day) do update set shown = public.banner_daily.shown + excluded.shown,
    taps = public.banner_daily.taps + excluded.taps;
end $$;

-- ─── Emails ─────────────────────────────────────────────────────────────────
create function public.staff_list_email_templates() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('send_push') or public.has_permission('manage_settings')
          or public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', t.key, 'name', t.name, 'trigger', t.trigger, 'can_disable', t.can_disable, 'enabled', t.enabled,
      'finance_review', t.finance_review, 'variables', t.variables,
      'version', v.number, 'subject', v.subject, 'preheader', v.preheader, 'body', v.body,
      'edited_at', v.created_at, 'edited_by', (select p.full_name from public.profiles p where p.id = v.edited_by),
      'sent_30d', (select count(*) from public.email_sends s where s.template_key = t.key
                   and s.sent_at > now() - interval '30 days'),
      'open_rate', (select round(100.0 * count(*) filter (where s.opened_at is not null) / nullif(count(*), 0), 1)
                    from public.email_sends s where s.template_key = t.key and s.sent_at > now() - interval '30 days'))
      order by t.position)
    from public.email_templates t
    join lateral (select * from public.email_template_versions v where v.template_key = t.key
                  order by v.number desc limit 1) v on true), '[]'::jsonb);
end $$;

-- Saving creates a version (rule 23). Unknown {{variables}} block the save; money and
-- security emails can't be switched off.
create function public.staff_save_email_template(p_key text, p_subject text, p_preheader text, p_body text,
  p_enabled boolean default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  t public.email_templates;
  v_unknown text;
  v_num int;
begin
  perform public.require_permission('send_push');
  select * into t from public.email_templates where key = p_key for update;
  if not found then raise exception 'Unknown email' using errcode = 'P0002'; end if;
  select string_agg(distinct m[1], ', ') into v_unknown
  from regexp_matches(coalesce(p_subject, '') || ' ' || coalesce(p_preheader, '') || ' ' || coalesce(p_body, ''),
                      '\{\{\s*([a-zA-Z0-9_]+)\s*\}\}', 'g') m
  where not (m[1] = any (t.variables));
  if v_unknown is not null then
    raise exception 'Unknown variable: %', v_unknown using errcode = '22023';
  end if;
  if p_enabled is false and not t.can_disable then
    raise exception 'This email can''t be switched off' using errcode = '22023';
  end if;
  select coalesce(max(number), 0) + 1 into v_num from public.email_template_versions where template_key = p_key;
  insert into public.email_template_versions (template_key, number, subject, preheader, body, edited_by)
  values (p_key, v_num, trim(p_subject), coalesce(trim(p_preheader), ''), p_body, auth.uid());
  if p_enabled is not null then
    update public.email_templates set enabled = p_enabled where key = p_key;
  end if;
  perform public.write_audit('engage', 'email_template.save', 'email_template', p_key, t.name, 'Version ' || v_num,
                             null, jsonb_build_object('subject', p_subject, 'enabled', p_enabled));
  return v_num;
end $$;

-- Worker email-sender: the latest version to render.
create function public.email_template_latest(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('key', t.key, 'enabled', t.enabled, 'version_id', v.id, 'subject', v.subject,
                            'preheader', v.preheader, 'body', v.body, 'variables', t.variables)
  from public.email_templates t
  join lateral (select * from public.email_template_versions v where v.template_key = t.key
                order by v.number desc limit 1) v on true
  where t.key = p_key
$$;

create function public.record_email_event(p_resend_id text, p_kind text) returns void
language sql security definer set search_path = '' as $$
  update public.email_sends set
    opened_at = case when p_kind = 'opened' then coalesce(opened_at, now()) else opened_at end,
    bounced_at = case when p_kind = 'bounced' then coalesce(bounced_at, now()) else bounced_at end
  where resend_id = p_resend_id
$$;

-- ─── Analytics ──────────────────────────────────────────────────────────────
-- Rebuild analytics_daily for a date range (Server: analytics_rollup + backfill). Days are WAT.
-- Each metric reads only tables that exist yet; missing sources leave no rows ("No data").
create function public.analytics_rollup(p_from date, p_to date) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  k int;
begin
  if auth.uid() is not null and not public.is_staff('super_admin') then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  delete from public.analytics_daily where day between p_from and p_to;

  insert into public.analytics_daily (day, metric, value)
  select (p.created_at at time zone 'Africa/Lagos')::date, 'signups', count(*)
  from public.profiles p
  where (p.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
  group by 1;
  get diagnostics k = row_count; n := n + k;

  insert into public.analytics_daily (day, metric, value)
  select (e.created_at at time zone 'Africa/Lagos')::date, 'unlocks', count(*)
  from public.entitlements e
  where e.source in ('unlock_all', 'chapter') and (e.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
  group by 1;
  get diagnostics k = row_count; n := n + k;

  insert into public.analytics_daily (day, metric, value)
  select (l.created_at at time zone 'Africa/Lagos')::date, 'credits_spent', -sum(l.delta)
  from public.credit_ledger l
  where l.reason in ('unlock_all', 'chapter', 'tip', 'message') and l.delta < 0
    and (l.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
  group by 1;
  get diagnostics k = row_count; n := n + k;

  insert into public.analytics_daily (day, metric, value)
  select (m.created_at at time zone 'Africa/Lagos')::date, 'messages', count(*)
  from public.messages m
  where m.kind <> 'system' and (m.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
  group by 1;
  get diagnostics k = row_count; n := n + k;

  insert into public.analytics_daily (day, metric, dim, value)
  select (l.created_at at time zone 'Africa/Lagos')::date, 'pushes', jsonb_build_object('status', l.status), count(*)
  from public.push_log l
  where (l.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
  group by 1, l.status;
  get diagnostics k = row_count; n := n + k;

  -- Reading (flow 04): daily readers with at least 30 seconds, hours, sessions, per book.
  if to_regclass('public.reading_sessions') is not null then
    execute $q$
      insert into public.analytics_daily (day, metric, value)
      select d, m, v from (
        select (r.started_at at time zone 'Africa/Lagos')::date d,
               count(distinct r.user_id) filter (where r.seconds >= 30) dau,
               round(sum(r.seconds) / 3600.0, 2) hours,
               count(*) sessions
        from public.reading_sessions r
        where (r.started_at at time zone 'Africa/Lagos')::date between $1 and $2
        group by 1) s,
      lateral (values ('dau', s.dau::numeric), ('reading_hours', s.hours), ('sessions', s.sessions::numeric)) x (m, v)
    $q$ using p_from, p_to;
    get diagnostics k = row_count; n := n + k;
    execute $q$
      insert into public.analytics_daily (day, metric, dim, value)
      select (r.started_at at time zone 'Africa/Lagos')::date, 'book_hours', jsonb_build_object('book_id', r.book_id),
             round(sum(r.seconds) / 3600.0, 2)
      from public.reading_sessions r
      where (r.started_at at time zone 'Africa/Lagos')::date between $1 and $2
      group by 1, r.book_id
    $q$ using p_from, p_to;
    get diagnostics k = row_count; n := n + k;
    execute $q$
      insert into public.analytics_daily (day, metric, dim, value)
      select (r.started_at at time zone 'Africa/Lagos')::date, 'hour_hours',
             jsonb_build_object('hour', extract(hour from r.started_at at time zone 'Africa/Lagos')::int),
             round(sum(r.seconds) / 3600.0, 2)
      from public.reading_sessions r
      where (r.started_at at time zone 'Africa/Lagos')::date between $1 and $2
      group by 1, 3
    $q$ using p_from, p_to;
    get diagnostics k = row_count; n := n + k;
  end if;
  return n;
end $$;

-- Hourly for today, nightly for the last 3 days.
create function public.analytics_rollup_recent(p_days int default 0) returns int
language sql security definer set search_path = '' as $$
  select public.analytics_rollup(((now() at time zone 'Africa/Lagos')::date - p_days),
                                 (now() at time zone 'Africa/Lagos')::date)
$$;

-- Insights screens read this: one metric per day over the range plus the previous period.
-- Small groups (< 5) come back as null with "Fewer than 5" for the UI (rule 28).
create function public.staff_analytics(p_metrics text[], p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_len int := p_to - p_from + 1;
begin
  if not (public.is_staff() and public.staff_mfa_ok()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if v_len < 1 or v_len > 400 then
    raise exception 'Pick a shorter period' using errcode = '22023';
  end if;
  return coalesce((select jsonb_object_agg(m, jsonb_build_object(
      'series', coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'dim', a.dim,
                   'value', case when a.metric in ('dau', 'signups') and a.value < 5 then null else a.value end)
                   order by a.day)
                 from public.analytics_daily a where a.metric = m and a.day between p_from and p_to), '[]'::jsonb),
      'total', (select sum(a.value) from public.analytics_daily a where a.metric = m and a.day between p_from and p_to),
      'previous', (select sum(a.value) from public.analytics_daily a where a.metric = m
                   and a.day between p_from - v_len and p_from - 1)))
    from unnest(p_metrics) m), '{}'::jsonb);
end $$;

-- ─── Exports ────────────────────────────────────────────────────────────────
-- Columns with personal details (rule 29).
create function public.export_pii_columns() returns text[]
language sql immutable set search_path = '' as $$
  select array['email', 'phone', 'date_of_birth', 'full_name', 'bank_account']
$$;

create function public.staff_create_export(p_kind public.export_kind, p_params jsonb, p_columns text[],
  p_reason text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pii boolean := p_columns && public.export_pii_columns();
  v_id uuid;
begin
  if not public.staff_mfa_ok() then
    raise exception 'Not allowed: exports' using errcode = 'insufficient_privilege';
  end if;
  if public.is_staff('finance') and not public.is_staff('super_admin') then
    if p_kind not in ('transactions', 'author_earnings') then
      raise exception 'Finance can export transactions and author earnings' using errcode = 'insufficient_privilege';
    end if;
  elsif not public.has_permission('view_analytics') then
    raise exception 'Not allowed: exports' using errcode = 'insufficient_privilege';
  end if;
  if v_pii then
    if not public.has_permission('export_personal') then
      raise exception 'Only a Super admin can export personal details' using errcode = 'insufficient_privilege';
    end if;
    if char_length(trim(coalesce(p_reason, ''))) < 5 then
      raise exception 'Say why you need personal details' using errcode = '22023';
    end if;
  end if;
  insert into public.exports (kind, params, columns, includes_pii, reason, created_by)
  values (p_kind, coalesce(p_params, '{}'), p_columns, v_pii, nullif(trim(p_reason), ''), auth.uid())
  returning id into v_id;
  perform pgmq.send('export_jobs', jsonb_build_object('export_id', v_id));
  perform public.write_audit('insights', 'export.create', 'export', v_id::text, p_kind::text, null, null,
                             jsonb_build_object('params', p_params, 'columns', p_columns, 'includes_pii', v_pii),
                             p_reason);
  return v_id;
end $$;

create function public.staff_list_exports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_staff() and public.staff_mfa_ok()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'params', e.params, 'columns', e.columns, 'includes_pii', e.includes_pii,
        'status', case when e.status = 'ready' and e.expires_at <= now() then 'expired' else e.status::text end,
        'row_count', e.row_count, 'created_at', e.created_at, 'expires_at', e.expires_at,
        'created_by', (select p.full_name from public.profiles p where p.id = e.created_by),
        'mine', e.created_by = auth.uid()) order by e.created_at desc)
      from public.exports e
      where (e.created_by = auth.uid() or public.is_staff('super_admin'))
        and e.created_at > now() - interval '7 days'), '[]'::jsonb),
    'schedules', case when public.is_staff('super_admin') or public.is_staff('finance') or public.is_staff('analyst')
      then coalesce((select jsonb_agg(to_jsonb(s) order by s.report_kind) from public.export_schedules s), '[]'::jsonb)
      else '[]'::jsonb end);
end $$;

-- Worker export-builder.
create function public.export_job(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(e) from public.exports e where e.id = p_id
$$;

create function public.set_export_status(p_id uuid, p_status public.export_status, p_row_count int default null,
  p_file_key text default null, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.exports set status = p_status, row_count = coalesce(p_row_count, row_count),
    file_key = coalesce(p_file_key, file_key), error = p_error,
    finished_at = case when p_status in ('ready', 'failed') then now() else finished_at end
  where id = p_id and status not in ('ready', 'failed', 'expired')
$$;

-- Daily: personal files deleted after 7 days (NDPA 2023). Returns R2 keys to delete.
create function public.expire_exports() returns text[]
language sql security definer set search_path = '' as $$
  -- RETURNING sees the new row, so the old key comes from the joined snapshot.
  with x as (update public.exports e set status = 'expired', file_key = null
             from (select id, file_key from public.exports where expires_at <= now() and status <> 'expired'
                   for update) o
             where e.id = o.id returning o.file_key)
  select coalesce(array_agg(file_key) filter (where file_key is not null), '{}') from x
$$;

-- R2 download: the creator (or Super admin) gets the key of a ready, unexpired file.
create function public.export_download_key(p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e public.exports;
begin
  select * into e from public.exports where id = p_id;
  if not found or not (e.created_by = auth.uid() or public.is_staff('super_admin')) or not public.staff_mfa_ok() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if e.status <> 'ready' or e.expires_at <= now() then
    raise exception 'This file has expired' using errcode = '22023';
  end if;
  perform public.write_audit('insights', 'export.download', 'export', p_id::text, e.kind::text);
  return e.file_key;
end $$;

-- pgmq wrappers for the Workers.
create function public.engage_queue_read(p_queue text, p_vt int default 60, p_qty int default 20)
returns setof pgmq.message_record
language plpgsql security definer set search_path = '' as $$
begin
  if p_queue not in ('push_fanout', 'export_jobs') then
    raise exception 'Unknown queue' using errcode = '22023';
  end if;
  return query select * from pgmq.read(p_queue, p_vt, least(greatest(p_qty, 1), 100));
end $$;

create function public.engage_queue_done(p_queue text, p_msg_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_queue not in ('push_fanout', 'export_jobs') then
    raise exception 'Unknown queue' using errcode = '22023';
  end if;
  return pgmq.archive(p_queue, p_msg_id);
end $$;

-- Producers (other flows' SQL, the chat DO via the api Worker) enqueue here.
create function public.enqueue_push(p_type text, p_user_ids uuid[], p_data jsonb default '{}') returns bigint
language sql security definer set search_path = '' as $$
  select pgmq.send('push_fanout', jsonb_build_object('type', p_type, 'user_ids', to_jsonb(p_user_ids), 'data', p_data))
$$;

-- Reading reminders (daily 18:00 WAT): readers with an unfinished book who haven't read for
-- 3 days, at most one reminder a week. Needs flow 04's reading tables.
create function public.enqueue_reading_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
begin
  if to_regclass('public.reading_sessions') is null then return 0; end if;
  execute $q$
    with due as (
      select r.user_id, (array_agg(r.book_id order by r.started_at desc))[1] book_id
      from public.reading_sessions r
      group by r.user_id
      having max(r.started_at) < now() - interval '3 days' and max(r.started_at) > now() - interval '60 days'
    ), fresh as (
      select d.* from due d where not exists (select 1 from public.push_log l where l.user_id = d.user_id
        and l.type = 'reading_reminder' and l.created_at > now() - interval '7 days')
    )
    select count(*) from (select pgmq.send('push_fanout', jsonb_build_object('type', 'reading_reminder',
        'user_ids', jsonb_build_array(f.user_id), 'data', jsonb_build_object('book_id', f.book_id)))
      from fresh f) s
  $q$ into n;
  return n;
end $$;

-- ─── Worker: campaign-runner helpers ────────────────────────────────────────
-- The whole audience with the reason each reader is left out (null = gets it), minus readers
-- this campaign already logged (an A/B second phase or a re-run). Ordered for paging (.range()).
create function public.campaign_audience(p_campaign uuid)
returns table (user_id uuid, reason text)
language sql stable security definer set search_path = '' as $$
  select r.user_id, r.reason from public.campaigns c,
    public.campaign_recipients(c.audience, c.is_service, c.skip_capped) r
  where c.id = p_campaign
    and not exists (select 1 from public.push_log l where l.campaign_id = c.id and l.user_id = r.user_id)
    and (not c.resend_unopened or not exists (
      select 1 from public.push_log l where l.campaign_id = c.source_campaign_id and l.user_id = r.user_id
        and l.status = 'opened'))
  order by r.user_id
$$;

-- A/B test phase one done: back to scheduled for the winner run 2 hours later.
create function public.campaign_ab_wait(p_id uuid, p_ab jsonb, p_counts jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.campaigns set status = 'scheduled', send_at = now() + interval '2 hours',
    ab_test = coalesce(ab_test, '{}') || p_ab, counts = counts || p_counts
  where id = p_id and status = 'sending'
$$;

create function public.campaign_set_ab(p_id uuid, p_ab jsonb) returns void
language sql security definer set search_path = '' as $$
  update public.campaigns set ab_test = coalesce(ab_test, '{}') || p_ab where id = p_id and status = 'sending'
$$;

-- Sent and opened per title variant (rule 16).
create function public.campaign_variant_stats(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'a', jsonb_build_object('sent', count(*) filter (where variant = 'a' and status in ('sent', 'delivered', 'opened')),
                            'opened', count(*) filter (where variant = 'a' and status = 'opened')),
    'b', jsonb_build_object('sent', count(*) filter (where variant = 'b' and status in ('sent', 'delivered', 'opened')),
                            'opened', count(*) filter (where variant = 'b' and status = 'opened')))
  from public.push_log where campaign_id = p_id
$$;

-- ─── Worker: export-builder rows ────────────────────────────────────────────
-- One page of an export as JSON objects holding only the chosen columns. Personal columns come
-- from auth.users and were cleared by staff_create_export (Super admin + reason). Sources that
-- another flow builds (subscriptions, reports, payouts) raise until that flow has merged.
create function public.export_rows(p_id uuid, p_offset int, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.exports;
  v_from timestamptz;
  v_to timestamptz;
  v_rows jsonb;
begin
  select * into e from public.exports where id = p_id;
  if not found then raise exception 'Unknown export' using errcode = 'P0002'; end if;
  v_from := coalesce((e.params ->> 'from')::date, '2000-01-01'::date)::timestamp at time zone 'Africa/Lagos';
  v_to := (coalesce((e.params ->> 'to')::date, current_date) + 1)::timestamp at time zone 'Africa/Lagos';
  if e.kind = 'readers' then
    select jsonb_agg(x) into v_rows from (
      select jsonb_build_object('reader_id', p.id, 'joined_at', p.created_at,
        'state', case when p.deleted_at is not null then 'deleted' else 'active' end,
        'credits_balance', (select coalesce(sum(l.delta), 0) from public.credit_ledger l where l.user_id = p.id),
        'last_active', (select max(d.last_seen_at) from public.user_devices d where d.user_id = p.id),
        'email', u.email, 'phone', u.phone) x
      from public.profiles p join auth.users u on u.id = p.id
      where p.is_reader and p.created_at >= v_from and p.created_at < v_to
      order by p.created_at, p.id offset p_offset limit p_limit) s;
  elsif e.kind = 'books' then
    select jsonb_agg(x) into v_rows from (
      select jsonb_build_object('book_id', b.id, 'title', b.title, 'author_id', b.author_id,
        'author', (select a.full_name from public.profiles a where a.id = b.author_id), 'status', b.status,
        'genres', array_to_string(b.genres, '; '), 'created_at', b.created_at) x
      from public.books b where b.created_at < v_to
        and (b.created_at >= v_from or b.status::text = 'live')
      order by b.created_at, b.id offset p_offset limit p_limit) s;
  elsif e.kind in ('transactions', 'author_earnings') then
    select jsonb_agg(x) into v_rows from (
      select jsonb_build_object('entry_id', l.id, 'txn_id', l.txn_id, 'created_at', l.created_at,
        'reader_id', l.user_id, 'credits', l.delta, 'reason', l.reason, 'bucket', l.bucket, 'book_id', l.book_id,
        'author_id', l.author_id, 'author_earning_naira', round(l.author_earning_kobo / 100.0, 2)) x
      from public.credit_ledger l
      where l.created_at >= v_from and l.created_at < v_to
        and (e.kind = 'transactions' or l.author_earning_kobo <> 0)
      order by l.id offset p_offset limit p_limit) s;
  else
    raise exception 'This export needs a flow that hasn''t shipped yet' using errcode = '0A000';
  end if;
  -- Keep only the chosen columns (all when none were chosen); personal ones only when allowed.
  return coalesce((select jsonb_agg((select coalesce(jsonb_object_agg(k, r -> k), '{}')
      from jsonb_object_keys(r) k
      where (cardinality(e.columns) = 0 or k = any (e.columns))
        and (e.includes_pii or k <> all (public.export_pii_columns()))))
    from jsonb_array_elements(v_rows) r), '[]');
end $$;

create function public.purge_push_log() returns void
language sql security definer set search_path = '' as $$
  delete from public.push_log where created_at < now() - interval '90 days';
  delete from public.push_author_daily where day < current_date - 2;
  delete from public.banner_modal_seen where day < current_date - 2;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('analytics_rollup_hourly', '5 * * * *', 'select public.analytics_rollup_recent(0)');
    perform cron.schedule('analytics_rollup_nightly', '30 23 * * *', 'select public.analytics_rollup_recent(3)');
    perform cron.schedule('reading_reminders', '0 17 * * *', 'select public.enqueue_reading_reminders()');
    -- expire_exports runs from the api Worker (01:00 UTC), which deletes the R2 files it returns.
    perform cron.schedule('purge_push_log', '45 2 * * *', 'select public.purge_push_log()');
    perform cron.schedule('end_banners', '*/15 * * * *',
      $c$update public.banners set state = 'ended' where state in ('live', 'scheduled') and ends_at <= now()$c$);
  end if;
end $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.push_types enable row level security;
alter table public.push_log enable row level security;
alter table public.push_held enable row level security;
alter table public.push_author_daily enable row level security;
alter table public.campaigns enable row level security;
alter table public.banners enable row level security;
alter table public.banner_dismissals enable row level security;
alter table public.banner_daily enable row level security;
alter table public.banner_modal_seen enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_template_versions enable row level security;
alter table public.email_sends enable row level security;
alter table public.analytics_daily enable row level security;
alter table public.exports enable row level security;
alter table public.export_schedules enable row level security;

-- Readers see only their own push rows; nobody writes from the client.
create policy push_log_own on public.push_log for select to authenticated using (user_id = auth.uid());
-- Staff read switches, campaigns, banners, templates; writes go through the RPCs above.
create policy push_types_staff on public.push_types for select to authenticated using (public.is_staff());
create policy campaigns_staff on public.campaigns for select to authenticated using (public.is_staff());
create policy banners_staff on public.banners for select to authenticated using (public.is_staff());
create policy email_templates_staff on public.email_templates for select to authenticated using (public.is_staff());
create policy email_template_versions_staff on public.email_template_versions for select to authenticated
  using (public.is_staff());
-- Aggregates only (no personal columns): every staff role reads them.
create policy analytics_daily_staff on public.analytics_daily for select to authenticated using (public.is_staff());
create policy exports_visible on public.exports for select to authenticated
  using (created_by = auth.uid() or public.is_staff('super_admin'));
create policy export_schedules_staff on public.export_schedules for select to authenticated using (public.is_staff());

revoke all on public.push_types, public.push_log, public.push_held, public.push_author_daily, public.campaigns,
  public.banners, public.banner_dismissals, public.banner_daily, public.banner_modal_seen, public.email_templates,
  public.email_template_versions, public.email_sends, public.analytics_daily, public.exports, public.export_schedules
  from anon, authenticated;
grant select on public.push_types, public.push_log, public.campaigns, public.banners, public.email_templates,
  public.email_template_versions, public.analytics_daily, public.exports, public.export_schedules to authenticated;

-- ─── Grants ─────────────────────────────────────────────────────────────────
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
      'in_quiet_window', 'quiet_window_end', 'marketing_pushes_7d', 'at_marketing_cap', 'push_prefs',
      'in_marketing_block', 'has_push_token', 'audience_members', 'campaign_recipients', 'campaign_reach',
      'resolve_audience', '_can_draft_push', '_validate_target', 'staff_save_campaign',
      'staff_request_campaign_review', 'staff_review_campaign', 'staff_schedule_campaign', 'staff_pause_campaign',
      'staff_cancel_campaign', 'staff_delete_campaign_draft', 'staff_duplicate_campaign', 'staff_list_campaigns',
      'staff_get_campaign', 'staff_set_push_type', 'claim_due_campaigns', 'finish_campaign', 'push_recipients',
      'log_pushes', 'hold_push', 'take_held_pushes', 'push_status_rank', 'apply_push_receipts',
      'disable_push_tokens', 'register_push_token', 'remove_push_token', 'push_opened', 'banner_live_state',
      'staff_save_banner', 'staff_end_banner', 'staff_list_banners', '_banner_target_ok', 'get_active_banners',
      'dismiss_banner', 'banner_event', 'staff_list_email_templates', 'staff_save_email_template',
      'email_template_latest', 'record_email_event', 'analytics_rollup', 'analytics_rollup_recent',
      'staff_analytics', 'export_pii_columns', 'staff_create_export', 'staff_list_exports', 'export_job',
      'set_export_status', 'expire_exports', 'export_download_key', 'engage_queue_read', 'engage_queue_done',
      'enqueue_push', 'enqueue_reading_reminders', 'purge_push_log', 'campaign_audience', 'campaign_ab_wait',
      'campaign_variant_stats', 'export_rows', 'mark_pushes_sent', 'campaign_set_ab'])
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- App (readers).
grant execute on function
  public.register_push_token(text, text, text, text), public.remove_push_token(text), public.push_opened(bigint),
  public.get_active_banners(public.banner_placement, text), public.dismiss_banner(uuid),
  public.banner_event(uuid, text)
  to authenticated;
-- Console (each checks the role and two-step itself).
grant execute on function
  public.campaign_reach(jsonb, boolean, boolean), public.staff_save_campaign(uuid, jsonb),
  public.staff_request_campaign_review(uuid), public.staff_review_campaign(uuid),
  public.staff_schedule_campaign(uuid, timestamptz, boolean), public.staff_pause_campaign(uuid),
  public.staff_cancel_campaign(uuid), public.staff_delete_campaign_draft(uuid),
  public.staff_duplicate_campaign(uuid, boolean), public.staff_list_campaigns(text), public.staff_get_campaign(uuid),
  public.staff_set_push_type(text, boolean, text, text), public.staff_save_banner(uuid, jsonb),
  public.staff_end_banner(uuid), public.staff_list_banners(), public.staff_list_email_templates(),
  public.staff_save_email_template(text, text, text, text, boolean), public.staff_analytics(text[], date, date),
  public.staff_create_export(public.export_kind, jsonb, text[], text), public.staff_list_exports(),
  public.export_download_key(uuid), public.analytics_rollup(date, date)
  to authenticated;
-- Workers only.
grant execute on function
  public.marketing_pushes_7d(uuid, timestamptz), public.at_marketing_cap(uuid, timestamptz),
  public.push_prefs(uuid), public.resolve_audience(uuid), public.claim_due_campaigns(int),
  public.finish_campaign(uuid, jsonb), public.push_recipients(uuid[], text, uuid, uuid, timestamptz),
  public.log_pushes(jsonb), public.hold_push(uuid, text, jsonb, timestamptz, boolean), public.take_held_pushes(int),
  public.apply_push_receipts(jsonb), public.disable_push_tokens(text[]), public.email_template_latest(text),
  public.record_email_event(text, text), public.analytics_rollup(date, date), public.analytics_rollup_recent(int),
  public.export_job(uuid), public.set_export_status(uuid, public.export_status, int, text, text),
  public.expire_exports(), public.engage_queue_read(text, int, int), public.engage_queue_done(text, bigint),
  public.enqueue_push(text, uuid[], jsonb), public.enqueue_reading_reminders(), public.purge_push_log(),
  public.campaign_audience(uuid), public.campaign_ab_wait(uuid, jsonb, jsonb), public.campaign_variant_stats(uuid),
  public.export_rows(uuid, int, int), public.mark_pushes_sent(jsonb), public.campaign_set_ab(uuid, jsonb)
  to service_role;
