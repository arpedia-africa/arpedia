-- Flow 10 · Profile and settings (docs/prd/10-profile-settings.md).
-- Reading goals, notification preferences, profile edits with a name-change limit, devices,
-- account deletion and erasure, and the staff reader pages' RPCs.
--
-- reading_progress, follows (flow 03) and annotations (flow 04) may not exist yet when this
-- migration runs. PL/pgSQL plans a statement only when it first runs, so every read of those
-- tables sits behind a to_regclass() check: before those flows merge the counts are real zeros,
-- afterwards they are real numbers, with no change here.

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.reader_theme as enum ('light', 'sepia', 'dark');
create type public.deletion_status as enum ('pending', 'erasing', 'done', 'blocked', 'cancelled');

-- ─── profiles (extend) ──────────────────────────────────────────────────────
alter table public.profiles
  add column reader_theme public.reader_theme not null default 'light',
  -- Times of the last name changes (rule 28: at most 3 in 30 days); trimmed to 30 days on write.
  add column name_changes timestamptz[] not null default '{}',
  add column deletion_requested_at timestamptz,
  add column erased_at timestamptz,
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 160);

-- Default reader theme is a plain preference (rule 15).
grant update (reader_theme) on public.profiles to authenticated;

-- Rule 28: a finished-onboarding reader may change their name 3 times in 30 days. Enforced on
-- every path that writes full_name (update_profile, a direct column update); staff and the
-- service role are exempt, and so is onboarding.
create function public._name_change_limit() returns trigger
language plpgsql set search_path = '' as $$
declare
  recent timestamptz[];
begin
  if new.full_name is not distinct from old.full_name or old.onboarding_step <> 'done'
     or auth.uid() is distinct from new.id then
    return new;
  end if;
  recent := array(select t from unnest(old.name_changes) t where t > now() - interval '30 days' order by t);
  if coalesce(array_length(recent, 1), 0) >= 3 then
    raise exception 'name_change_limit' using errcode = '22023',
      hint = 'You can change your name 3 times in 30 days.';
  end if;
  new.name_changes := recent || now();
  return new;
end $$;
create trigger profiles_name_change_limit before update of full_name on public.profiles
  for each row execute function public._name_change_limit();

-- Deleted readers drop out of the public face at once (rule 36): public_profiles already filters
-- deleted_at, which request_account_deletion sets.

-- ─── reading_goals ──────────────────────────────────────────────────────────
create table public.reading_goals (
  user_id uuid not null references public.profiles (id) on delete cascade,
  year integer not null check (year between 2020 and 2100),
  target_books integer not null check (target_books between 1 and 365),
  updated_at timestamptz not null default now(),
  primary key (user_id, year)
);
create trigger reading_goals_updated_at before update on public.reading_goals
  for each row execute function public.set_updated_at();

-- ─── notification_preferences ───────────────────────────────────────────────
-- No row = defaults (rule 20). Offers stay off until the reader opts in (marketing consent).
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  clubs boolean not null default true,
  authors boolean not null default true,
  note_replies boolean not null default true,
  reminders boolean not null default true,
  offers boolean not null default false,
  quiet_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '06:00',
  timezone text not null default 'Africa/Lagos' check (char_length(timezone) between 1 and 64),
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ─── consent_log ────────────────────────────────────────────────────────────
create table public.consent_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('marketing', 'terms', 'privacy')),
  granted boolean not null,
  at timestamptz not null default now()
);
create index consent_log_user_idx on public.consent_log (user_id, at desc);

-- ─── user_devices (extend flow 01) ──────────────────────────────────────────
-- session_id: the auth session that registered the device, so Remove can end exactly that one.
alter table public.user_devices
  add column revoked_by text check (revoked_by in ('self', 'staff')),
  add column session_id uuid;

create function public._device_session() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() = new.user_id and nullif(auth.jwt() ->> 'session_id', '') is not null then
    new.session_id := (auth.jwt() ->> 'session_id')::uuid;
  end if;
  return new;
end $$;
create trigger user_devices_session before insert or update on public.user_devices
  for each row execute function public._device_session();

-- ─── account_deletions ──────────────────────────────────────────────────────
create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested_at timestamptz not null default now(),
  requested_via text not null check (requested_via in ('app', 'staff')),
  requested_by uuid,
  reason text check (char_length(reason) <= 500),
  -- Staff "Delete after 30 days": the account is hidden now, erased after this time unless restored.
  grace_until timestamptz,
  -- Erase no later than this (default 7 days, Q3).
  erase_after timestamptz not null default now(),
  status public.deletion_status not null default 'pending',
  blocked_reason text,
  completed_at timestamptz
);
create unique index account_deletions_open_idx on public.account_deletions (user_id)
  where status in ('pending', 'erasing', 'blocked');
create index account_deletions_due_idx on public.account_deletions (erase_after) where status = 'pending';

-- ─── staff_notes ────────────────────────────────────────────────────────────
create table public.staff_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index staff_notes_user_idx on public.staff_notes (user_id, created_at desc);

-- ─── Helpers ────────────────────────────────────────────────────────────────
create function public._me() returns uuid
language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- The reading-goal year runs on Lagos time for everyone (open question 10).
create function public._lagos_year() returns integer
language sql stable set search_path = '' as $$
  select extract(year from (now() at time zone 'Africa/Lagos'))::int
$$;

-- Books the user finished, all time or in one Lagos year.
create function public._books_finished(p_user uuid, p_year integer default null) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare
  n integer := 0;
begin
  if to_regclass('public.reading_progress') is not null then
    select count(*) into n from public.reading_progress rp
    where rp.user_id = p_user and rp.finished_at is not null
      and (p_year is null or extract(year from (rp.finished_at at time zone 'Africa/Lagos')) = p_year);
  end if;
  return n;
end $$;

-- Live (not deleted) annotations of each kind.
create function public._annotation_counts(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  out jsonb := '{"bookmark": 0, "highlight": 0, "note": 0}';
begin
  if to_regclass('public.annotations') is not null then
    select out || coalesce(jsonb_object_agg(a.kind, a.n), '{}') into out
    from (select kind, count(*) as n from public.annotations
          where user_id = p_user and deleted_at is null group by kind) a;
  end if;
  return out;
end $$;

-- Author earnings not yet paid out, in kobo. Earnings come from the ledger (₦1.60 per credit);
-- payouts arrive with flow 13, which replaces this function. Until then nothing has been paid.
create function public._unpaid_earnings_kobo(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(author_earning_kobo), 0)::bigint from public.credit_ledger where author_id = p_user
$$;

-- ─── Reader RPCs ────────────────────────────────────────────────────────────
-- Everything the Profile tab shows, in one call (rule 2). The goal status is worked out on the
-- phone from these numbers (packages/core goalStatus), with `today` as the Lagos date.
create function public.get_profile_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  yr integer := public._lagos_year();
  p public.profiles;
  following integer := 0;
  counts jsonb := public._annotation_counts(uid);
  g public.reading_goals;
  last_g public.reading_goals;
begin
  select * into p from public.profiles where id = uid;
  if to_regclass('public.follows') is not null then
    select count(*) into following from public.follows where follower_id = uid;
  end if;
  select * into g from public.reading_goals where user_id = uid and year = yr;
  select * into last_g from public.reading_goals where user_id = uid and year = yr - 1;
  return jsonb_build_object(
    'books_read', public._books_finished(uid),
    'following', following,
    'highlights', (counts ->> 'highlight')::int,
    'bookmarks', (counts ->> 'bookmark')::int,
    'notes', (counts ->> 'note')::int,
    'year', yr,
    'today', (now() at time zone 'Africa/Lagos')::date,
    'read_this_year', public._books_finished(uid, yr),
    'goal', case when g.user_id is null then null else g.target_books end,
    'last_year', case when last_g.user_id is null then null
      else jsonb_build_object('target', last_g.target_books, 'read', public._books_finished(uid, yr - 1)) end,
    'is_author', p.is_author
  );
end $$;

-- Rule 9: the current Lagos year (or next). Changing the goal never changes the count.
create function public.set_reading_goal(p_year integer, p_target integer) returns public.reading_goals
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  yr integer := public._lagos_year();
  out public.reading_goals;
begin
  if p_year is null or p_year not in (yr, yr + 1) then
    raise exception 'goal_year' using errcode = '22023';
  end if;
  if p_target is null or p_target not between 1 and 365 then
    raise exception 'goal_target' using errcode = '22023';
  end if;
  insert into public.reading_goals (user_id, year, target_books) values (uid, p_year, p_target)
  on conflict (user_id, year) do update set target_books = excluded.target_books
  returning * into out;
  return out;
end $$;

-- My highlights (rules 10–13): one tab of bookmarks, highlights or notes, grouped by book, groups
-- newest first. `p_cursor` = the `next` from the previous page (latest item time of the last group).
-- `p_query` searches the quote and the note text. Tab counts come back on every page.
create function public.list_collection(p_kind text, p_cursor timestamptz default null,
  p_query text default null, p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  q text := nullif(btrim(coalesce(p_query, '')), '');
  lim integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  groups jsonb := '[]';
  nxt timestamptz;
  n_page integer := 0;
  total_items integer := 0;
  total_books integer := 0;
begin
  if p_kind is null or p_kind not in ('bookmark', 'highlight', 'note') then
    raise exception 'bad_kind' using errcode = '22023';
  end if;
  if q is not null then
    q := '%' || replace(replace(replace(left(q, 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  if to_regclass('public.annotations') is not null then
    select count(*), count(distinct book_id) into total_items, total_books
    from public.annotations
    where user_id = uid and kind = p_kind and deleted_at is null
      and (q is null or quote ilike q or note_text ilike q);

    with items as (
      select a.* from public.annotations a
      where a.user_id = uid and a.kind = p_kind and a.deleted_at is null
        and (q is null or a.quote ilike q or a.note_text ilike q)
    ), per_book as (
      select book_id, max(created_at) as latest from items group by book_id
    ), page as (
      select * from per_book
      where p_cursor is null or latest < p_cursor
      order by latest desc, book_id
      limit lim
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'book_id', b.id, 'title', b.title, 'author', ap.full_name, 'latest', pg.latest,
        'highlights', (select count(*) from public.annotations x where x.user_id = uid and x.book_id = b.id
                       and x.kind = 'highlight' and x.deleted_at is null),
        'notes', (select count(*) from public.annotations x where x.user_id = uid and x.book_id = b.id
                  and x.kind = 'note' and x.deleted_at is null),
        'owned', exists (select 1 from public.entitlements e where e.user_id = uid and e.book_id = b.id
                         and e.revoked_at is null),
        'items', (select jsonb_agg(jsonb_build_object(
            'id', i.id, 'kind', i.kind, 'color', i.color, 'quote', i.quote, 'note', i.note_text,
            'cfi', i.cfi_range, 'chapter_uid', i.chapter_uid,
            'chapter_ord', (select c.ord from public.chapters c
                            where c.chapter_uid = i.chapter_uid and c.revision_id = coalesce(i.revision_id, b.current_revision_id)
                            limit 1),
            'shared_group_id', i.shared_group_id, 'created_at', i.created_at)
            order by i.created_at desc)
          from items i where i.book_id = b.id)
      ) order by pg.latest desc, b.id), '[]'),
      min(pg.latest), count(*)
    into groups, nxt, n_page
    from page pg
    join public.books b on b.id = pg.book_id
    join public.profiles ap on ap.id = b.author_id;
    -- Another page exists when a group older than this page's last one is left.
    if n_page < lim or not exists (
      select 1 from public.annotations a
      where a.user_id = uid and a.kind = p_kind and a.deleted_at is null
        and (q is null or a.quote ilike q or a.note_text ilike q)
      group by a.book_id having max(a.created_at) < nxt) then
      nxt := null;
    end if;
  end if;
  return jsonb_build_object('kind', p_kind, 'groups', groups, 'next', nxt,
    'items', total_items, 'books', total_books, 'counts', public._annotation_counts(uid));
end $$;

-- Rule 12: soft delete; restore only within 5 minutes (the Undo toast shows for 5 seconds).
create function public.delete_annotation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
begin
  if to_regclass('public.annotations') is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.annotations set deleted_at = now(), updated_at = now()
  where id = p_id and user_id = uid and deleted_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

create function public.restore_annotation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
begin
  if to_regclass('public.annotations') is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.annotations set deleted_at = null, updated_at = now()
  where id = p_id and user_id = uid and deleted_at > now() - interval '5 minutes';
  if not found then
    raise exception 'restore_expired' using errcode = 'P0002';
  end if;
end $$;

-- Edit profile (rules 24–28). Keys present in `p` are changed; '' or null clears an optional
-- field (bio, phone, date_of_birth, avatar_url). Same rules as flow 01's profile step.
create function public.update_profile(p jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  cur public.profiles;
  v_name text;
  v_bio text;
  v_phone text;
  v_dob date;
  v_country text;
  v_avatar text;
begin
  select * into cur from public.profiles where id = uid for update;
  if cur.deleted_at is not null then
    raise exception 'account_deleted' using errcode = '42501';
  end if;
  v_name := cur.full_name; v_bio := cur.bio; v_phone := cur.phone; v_dob := cur.date_of_birth;
  v_country := cur.country; v_avatar := cur.avatar_url;

  if p ? 'full_name' then
    v_name := btrim(coalesce(p ->> 'full_name', ''));
    if char_length(v_name) not between 1 and 80 then
      raise exception 'name must be 1 to 80 characters' using errcode = '22023';
    end if;
  end if;
  if p ? 'bio' then
    v_bio := nullif(btrim(coalesce(p ->> 'bio', '')), '');
    if char_length(v_bio) > 160 then
      raise exception 'bio must be 160 characters or fewer' using errcode = '22023';
    end if;
  end if;
  if p ? 'phone' then
    v_phone := nullif(p ->> 'phone', '');
    if v_phone is not null and (v_phone !~ '^\+[1-9][0-9]{7,14}$'
        or (v_phone like '+234%' and v_phone !~ '^\+234[1-9][0-9]{9}$')) then
      raise exception 'phone number looks wrong' using errcode = '22023';
    end if;
  end if;
  if p ? 'date_of_birth' then
    v_dob := nullif(p ->> 'date_of_birth', '')::date;
    if v_dob is not null and (v_dob < date '1900-01-01' or v_dob > (current_date - interval '16 years')::date) then
      raise exception 'you must be at least 16' using errcode = '22023';
    end if;
  end if;
  if p ? 'country' then
    v_country := p ->> 'country';
    if v_country is null or v_country !~ '^[A-Z]{2}$' then
      raise exception 'unknown country' using errcode = '22023';
    end if;
  end if;
  if p ? 'avatar_url' then
    v_avatar := nullif(p ->> 'avatar_url', '');
    if v_avatar is not null and (v_avatar !~ '^https?://' or char_length(v_avatar) > 500) then
      raise exception 'photo link looks wrong' using errcode = '22023';
    end if;
  end if;

  update public.profiles set full_name = v_name, bio = v_bio, phone = v_phone, date_of_birth = v_dob,
    country = v_country, avatar_url = v_avatar
  where id = uid
  returning * into cur;
  return cur;
end $$;

-- The caller's preferences, defaults when never saved.
create function public.get_notification_preferences() returns public.notification_preferences
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  out public.notification_preferences;
begin
  select * into out from public.notification_preferences where user_id = uid;
  if not found then
    out := row(uid, true, true, true, true, false, false, '22:00'::time, '06:00'::time, 'Africa/Lagos', now());
  end if;
  return out;
end $$;

-- Rule 21: one toggle (or a few) at a time, no Save button. Turning offers on or off is the
-- marketing consent and is logged.
create function public.set_notification_preferences(p_patch jsonb) returns public.notification_preferences
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  cur public.notification_preferences := public.get_notification_preferences();
  k text;
begin
  for k in select jsonb_object_keys(coalesce(p_patch, '{}')) loop
    if k not in ('clubs', 'authors', 'note_replies', 'reminders', 'offers', 'quiet_enabled',
                 'quiet_start', 'quiet_end', 'timezone') then
      raise exception 'unknown preference %', k using errcode = '22023';
    end if;
    if k in ('clubs', 'authors', 'note_replies', 'reminders', 'offers', 'quiet_enabled')
       and jsonb_typeof(p_patch -> k) <> 'boolean' then
      raise exception 'preference % must be true or false', k using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'timezone' and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_patch ->> 'timezone') then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  if p_patch ? 'offers' and (p_patch ->> 'offers')::boolean is distinct from cur.offers then
    insert into public.consent_log (user_id, kind, granted) values (uid, 'marketing', (p_patch ->> 'offers')::boolean);
  end if;

  insert into public.notification_preferences as np (user_id, clubs, authors, note_replies, reminders, offers,
    quiet_enabled, quiet_start, quiet_end, timezone)
  values (uid,
    coalesce((p_patch ->> 'clubs')::boolean, cur.clubs),
    coalesce((p_patch ->> 'authors')::boolean, cur.authors),
    coalesce((p_patch ->> 'note_replies')::boolean, cur.note_replies),
    coalesce((p_patch ->> 'reminders')::boolean, cur.reminders),
    coalesce((p_patch ->> 'offers')::boolean, cur.offers),
    coalesce((p_patch ->> 'quiet_enabled')::boolean, cur.quiet_enabled),
    coalesce((p_patch ->> 'quiet_start')::time, cur.quiet_start),
    coalesce((p_patch ->> 'quiet_end')::time, cur.quiet_end),
    coalesce(p_patch ->> 'timezone', cur.timezone))
  on conflict (user_id) do update set clubs = excluded.clubs, authors = excluded.authors,
    note_replies = excluded.note_replies, reminders = excluded.reminders, offers = excluded.offers,
    quiet_enabled = excluded.quiet_enabled, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end,
    timezone = excluded.timezone
  returning * into cur;
  return cur;
end $$;

-- Whether a notification of `p_pref` may be created for the user (flow 02's notification_allowed
-- calls this once it is wired). Quiet hours only hold pushes; they never hide feed items.
create function public.notification_pref(p_user uuid, p_pref text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case p_pref
      when 'clubs' then np.clubs when 'authors' then np.authors when 'note_replies' then np.note_replies
      when 'reminders' then np.reminders when 'offers' then np.offers else true end
    from public.notification_preferences np where np.user_id = p_user),
    p_pref is distinct from 'offers')
$$;

-- Security: the caller's devices, newest use first. `current` marks the device of this session.
create function public.list_my_devices(p_device_key text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  return jsonb_build_object(
    'enabled', (select count(*) from public.user_devices
                where user_id = uid and revoked_at is null and download_enabled),
    'devices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', d.id, 'model', d.model, 'os', d.os, 'city', d.last_city, 'last_seen_at', d.last_seen_at,
        'download_enabled', d.download_enabled,
        'current', d.device_key = p_device_key or (sid is not null and d.session_id = sid))
        order by (d.device_key = p_device_key or (sid is not null and d.session_id = sid)) desc, d.last_seen_at desc)
      from public.user_devices d where d.user_id = uid and d.revoked_at is null), '[]')
  );
end $$;

-- Rule 30: end that device's session, take away its download slot and push token. Never the
-- device the reader is using (by its key or by this session).
create function public.remove_device(p_device_id uuid, p_current_device_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  d public.user_devices;
begin
  select * into d from public.user_devices where id = p_device_id and user_id = uid and revoked_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if d.device_key = p_current_device_key or (sid is not null and d.session_id = sid) then
    raise exception 'this_device' using errcode = '22023';
  end if;
  update public.user_devices set revoked_at = now(), revoked_by = 'self', download_enabled = false, push_token = null
  where id = d.id;
  if d.session_id is not null then
    delete from auth.sessions where id = d.session_id and user_id = uid;
  end if;
end $$;

-- Rule 31: a device without downloads takes a free slot (after the reader removed one).
create function public.claim_download_slot(p_device_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  d public.user_devices;
begin
  perform 1 from public.profiles where id = uid for update;
  select * into d from public.user_devices where user_id = uid and device_key = p_device_key and revoked_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if d.download_enabled then
    return true;
  end if;
  if (select count(*) from public.user_devices where user_id = uid and revoked_at is null and download_enabled) >= 3 then
    return false;
  end if;
  update public.user_devices set download_enabled = true where id = d.id;
  return true;
end $$;

-- Start a deletion: hide the profile, end every session, drop push tokens and queue erasure.
create function public._start_deletion(p_user uuid, p_via text, p_by uuid, p_reason text, p_erase_after timestamptz,
  p_grace_until timestamptz) returns public.account_deletions
language plpgsql security definer set search_path = '' as $$
declare
  out public.account_deletions;
begin
  if exists (select 1 from public.account_deletions where user_id = p_user and status in ('pending', 'erasing')) then
    raise exception 'already_deleting' using errcode = '22023';
  end if;
  if public._unpaid_earnings_kobo(p_user) > 0 then
    raise exception 'earnings_waiting' using errcode = '22023',
      hint = 'You have earnings waiting. We''ll delete your account after your next payout.';
  end if;
  update public.profiles set deleted_at = now(), deletion_requested_at = now() where id = p_user;
  update public.user_devices set revoked_at = coalesce(revoked_at, now()),
    revoked_by = coalesce(revoked_by, case when p_via = 'staff' then 'staff' else 'self' end),
    download_enabled = false, push_token = null
  where user_id = p_user;
  delete from auth.sessions where user_id = p_user;
  delete from public.account_deletions where user_id = p_user and status = 'blocked';
  insert into public.account_deletions (user_id, requested_via, requested_by, reason, erase_after, grace_until)
  values (p_user, p_via, p_by, p_reason, p_erase_after, p_grace_until)
  returning * into out;
  return out;
end $$;

-- Rules 34–36 (Q3 default: immediate; erased within 7 days). Exact DELETE, any case.
create function public.request_account_deletion(p_confirm_text text) returns public.account_deletions
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
begin
  if upper(btrim(coalesce(p_confirm_text, ''))) <> 'DELETE' then
    raise exception 'confirm_text' using errcode = '22023';
  end if;
  return public._start_deletion(uid, 'app', uid, null, now(), null);
end $$;

-- ─── Erasure (service role: the api Worker's cron) ──────────────────────────
-- Rule 37. Idempotent: re-running a done deletion does nothing. Ledger, entitlement and audit
-- rows stay (they are financial records); the profile is scrubbed to "Former reader".
create function public.erase_account(p_deletion uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  d public.account_deletions;
  uid uuid;
begin
  if auth.uid() is not null then
    raise exception 'erase_account: service role only' using errcode = '42501';
  end if;
  select * into d from public.account_deletions where id = p_deletion for update;
  if not found or d.status in ('done', 'cancelled') then
    return false;
  end if;
  uid := d.user_id;
  update public.account_deletions set status = 'erasing' where id = d.id;

  update public.profiles set full_name = 'Former reader', username = null, avatar_url = null, bio = null,
    phone = null, date_of_birth = null, interests = '{}', name_changes = '{}', erased_at = now(),
    deleted_at = coalesce(deleted_at, now())
  where id = uid;
  delete from public.user_genres where user_id = uid;
  delete from public.user_devices where user_id = uid;
  delete from public.reading_goals where user_id = uid;
  delete from public.notification_preferences where user_id = uid;
  delete from public.staff_notes where user_id = uid;
  if to_regclass('public.annotations') is not null then
    delete from public.annotations where user_id = uid;
  end if;
  if to_regclass('public.reading_progress') is not null then
    delete from public.reading_progress where user_id = uid;
  end if;
  if to_regclass('public.reading_sessions') is not null then
    delete from public.reading_sessions where user_id = uid;
  end if;
  if to_regclass('public.follows') is not null then
    delete from public.follows where follower_id = uid or followee_id = uid;
  end if;
  -- Unlocked books go with the account; the ledger rows that paid for them stay.
  -- (entitlements are append-only to clients and the service role; this runs as postgres.)
  delete from public.entitlements where user_id = uid;
  -- Sign-in: a scrubbed, unusable login so the email is free for a new sign-up.
  delete from auth.sessions where user_id = uid;
  delete from auth.identities where user_id = uid;
  update auth.users set email = 'erased+' || uid || '@deleted.arpedia.invalid', phone = null,
    encrypted_password = null, raw_user_meta_data = '{}', email_confirmed_at = null,
    banned_until = 'infinity'
  where id = uid;

  update public.account_deletions set status = 'done', completed_at = now() where id = d.id;
  perform public.write_audit('readers', 'account_erased', 'user', uid::text, null,
    'Personal data erased', null, null, null);
  return true;
end $$;

-- Deletions due for erasure, oldest first (the Worker erases a few per tick).
create function public.due_account_deletions(p_limit integer default 10) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.account_deletions
  where status = 'pending' and erase_after <= now() and (grace_until is null or grace_until <= now())
  order by erase_after limit least(greatest(coalesce(p_limit, 10), 1), 100)
$$;

-- ─── Staff RPCs (admin Readers pages) ───────────────────────────────────────
-- view_readers: Super admin, Operations admin, Moderator, Support (Finance: no contact details).
-- Acting on a reader (sign out, reset, notes): Support, Operations admin, Super admin.
-- Phones are masked; Super admin and Support may reveal contact details, which is audited.
create function public._mask_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then null
    when char_length(p) <= 8 then '••••'
    else left(p, 4) || ' ' || substr(p, 5, 3) || ' ••• ••' || right(p, 2) end
$$;

create function public._staff_acts_on_readers() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('view_readers')
          and public.is_staff_any(array['support', 'operations_admin']::public.staff_role[])) then
    raise exception 'Not allowed: act on readers' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Super admin or Support: reveal contact, delete accounts.
create function public._staff_support() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('view_readers') and public.is_staff_any(array['support']::public.staff_role[])) then
    raise exception 'Not allowed: Super admin or Support' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Latest subscription of a reader (flow 03's minimal table, owned by flow 09).
create function public._reader_plan(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  out jsonb;
begin
  if to_regclass('public.subscriptions') is not null then
    select jsonb_build_object('plan', s.plan_code, 'status', s.status, 'period_start', s.period_start,
      'period_end', s.period_end)
    into out from public.subscriptions s where s.user_id = p_user order by s.period_end desc limit 1;
  end if;
  return out;
end $$;

create function public._reader_tab(p_deleted boolean, p_plan jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when p_deleted then 'deleted'
    when p_plan is null then 'no_plan'
    when p_plan ->> 'status' in ('active', 'grace', 'billing_retry') then 'subscribers'
    else 'lapsed' end
$$;

-- Readers list (s-users): search by name, email, phone or user id; a tab; filters
-- {plan, country, platform, role, joined_from, joined_to}; 50 per page. Staff accounts are left
-- out. Suspended arrives with flow 14 (sanctions).
create function public.staff_list_readers(p_query text default null, p_tab text default 'all',
  p_filters jsonb default '{}', p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  raw text := nullif(btrim(coalesce(p_query, '')), '');
  q text;
  qd text;
  pg integer := greatest(coalesce(p_page, 1), 1);
  f jsonb := coalesce(p_filters, '{}');
  out jsonb;
begin
  perform public.require_permission('view_readers');
  if p_tab is null or p_tab not in ('all', 'subscribers', 'lapsed', 'no_plan', 'suspended', 'deleted') then
    raise exception 'bad_tab' using errcode = '22023';
  end if;
  if raw is not null then
    qd := regexp_replace(raw, '[^0-9]', '', 'g');
    q := '%' || replace(replace(replace(lower(left(raw, 80)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with r as (
    select p.id, p.full_name, p.avatar_url, p.country, p.created_at, p.is_author, p.phone,
      p.deleted_at is not null as is_deleted, u.email,
      public._reader_plan(p.id) as plan,
      greatest((select max(d.last_seen_at) from public.user_devices d where d.user_id = p.id), u.last_sign_in_at) as last_active,
      (select d.os from public.user_devices d where d.user_id = p.id order by d.last_seen_at desc limit 1) as platform
    from public.profiles p
    left join auth.users u on u.id = p.id
    where not exists (select 1 from public.staff_roles s where s.user_id = p.id and s.active)
  ), hit as (
    select r.*, public._reader_tab(r.is_deleted, r.plan) as tab from r
    where (q is null or lower(r.full_name) like q or lower(coalesce(r.email, '')) like q or r.id::text = raw
           or (char_length(qd) >= 4 and regexp_replace(coalesce(r.phone, ''), '[^0-9]', '', 'g') like '%' || qd || '%'))
      and (f ->> 'plan' is null or r.plan ->> 'plan' = f ->> 'plan')
      and (f ->> 'country' is null or r.country = f ->> 'country')
      and (f ->> 'platform' is null or lower(coalesce(r.platform, '')) like lower(f ->> 'platform') || '%')
      and (f ->> 'role' is null or (f ->> 'role' = 'author') = r.is_author)
      and (f ->> 'joined_from' is null or r.created_at >= (f ->> 'joined_from')::date)
      and (f ->> 'joined_to' is null or r.created_at < (f ->> 'joined_to')::date + 1)
  ), shown as (
    select * from hit where (p_tab = 'all' and tab <> 'deleted') or tab = p_tab
  )
  select jsonb_build_object(
    'counts', (select jsonb_build_object(
      'all', count(*) filter (where tab <> 'deleted'),
      'subscribers', count(*) filter (where tab = 'subscribers'),
      'lapsed', count(*) filter (where tab = 'lapsed'),
      'no_plan', count(*) filter (where tab = 'no_plan'),
      'suspended', 0,
      'deleted', count(*) filter (where tab = 'deleted')) from hit),
    'total', (select count(*) from shown),
    'page', pg,
    'rows', coalesce((
      select jsonb_agg(x.j order by x.last_active desc nulls last, x.id)
      from (
        select s.id, s.last_active, jsonb_build_object(
          'id', s.id, 'name', s.full_name, 'avatar_url', s.avatar_url, 'email', s.email, 'country', s.country,
          'plan', s.plan, 'credits', public.credit_balance(s.id), 'last_active', s.last_active,
          'joined', s.created_at, 'is_author', s.is_author, 'deleted', s.is_deleted,
          'deletion_requested', exists (select 1 from public.account_deletions ad
                                        where ad.user_id = s.id and ad.status in ('pending', 'blocked'))) as j
        from shown s
        order by s.last_active desc nulls last, s.id
        offset (pg - 1) * 50 limit 50
      ) x), '[]'))
  into out;
  return out;
end $$;

-- Reader overview (s-user) and Reading and devices (s-user-activity) share one call.
create function public.staff_get_reader(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  u auth.users;
  contact boolean;
  last_dev public.user_devices;
  reading jsonb := '[]';
  minutes integer;
begin
  perform public.require_permission('view_readers');
  -- Analyst sees totals only; Finance sees no contact details.
  if public.is_staff('analyst') and not public.is_staff('super_admin') then
    raise exception 'Not allowed: reader pages' using errcode = 'insufficient_privilege';
  end if;
  contact := not (public.is_staff('finance') and not public.is_staff('super_admin'));
  select * into p from public.profiles where id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into u from auth.users where id = p_user;
  select * into last_dev from public.user_devices where user_id = p_user order by last_seen_at desc limit 1;

  if to_regclass('public.reading_progress') is not null then
    select coalesce(jsonb_agg(jsonb_build_object('book_id', b.id, 'title', b.title, 'percent', rp.percent,
        'last_opened_at', rp.last_opened_at) order by rp.last_opened_at desc), '[]')
    into reading
    from (select * from public.reading_progress where user_id = p_user and finished_at is null
          order by last_opened_at desc limit 5) rp
    join public.books b on b.id = rp.book_id;
  end if;
  if to_regclass('public.reading_sessions') is not null then
    select (coalesce(sum(active_seconds), 0) / 60)::int into minutes from public.reading_sessions
    where user_id = p_user and started_at > now() - interval '30 days';
  end if;

  return jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'username', p.username, 'avatar_url', p.avatar_url, 'bio', p.bio,
    'email', case when contact then u.email end,
    'phone', case when contact then public._mask_phone(p.phone) end,
    'has_phone', p.phone is not null,
    'date_of_birth', case when contact then p.date_of_birth end,
    'country', p.country, 'is_author', p.is_author, 'joined', p.created_at,
    'deleted_at', p.deleted_at, 'erased_at', p.erased_at,
    'sign_in', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = p_user), '[]'),
    'email_verified', u.email_confirmed_at is not null,
    'last_sign_in_at', u.last_sign_in_at,
    'platform', last_dev.os, 'app_version', last_dev.app_version,
    'plan', public._reader_plan(p_user),
    'credits', public.credit_balance(p_user),
    'interests', coalesce((select jsonb_agg(g.name order by g.position) from public.user_genres ug
                           join public.genres g on g.id = ug.genre_id where ug.user_id = p_user), '[]'),
    'unlocked', coalesce((select jsonb_agg(jsonb_build_object('book_id', b.id, 'title', b.title, 'at', e.created_at,
                  'credits', (select -l.delta from public.credit_ledger l where l.id = e.ledger_id)) order by e.created_at desc)
                from public.entitlements e join public.books b on b.id = e.book_id
                where e.user_id = p_user and e.scope = 'book' and e.revoked_at is null), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'at', n.created_at,
                 'author', ap.full_name) order by n.created_at desc)
               from public.staff_notes n left join public.profiles ap on ap.id = n.author_id
               where n.user_id = p_user), '[]'),
    'consent', jsonb_build_object(
      'offers', public.notification_pref(p_user, 'offers'),
      'marketing_at', (select max(c.at) from public.consent_log c where c.user_id = p_user and c.kind = 'marketing'),
      'terms_version', p.terms_version, 'privacy_version', p.privacy_version, 'terms_accepted_at', p.terms_accepted_at),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'model', d.model, 'os', d.os,
                   'app_version', d.app_version, 'city', d.last_city, 'last_seen_at', d.last_seen_at,
                   'download_enabled', d.download_enabled, 'revoked_at', d.revoked_at, 'revoked_by', d.revoked_by)
                   order by d.revoked_at is not null, d.last_seen_at desc)
                 from public.user_devices d where d.user_id = p_user), '[]'),
    'reading', reading,
    'reading_minutes_30d', minutes,
    'counts', public._annotation_counts(p_user) || jsonb_build_object('books_read', public._books_finished(p_user)),
    'deletion', (select to_jsonb(ad) - 'requested_by' from public.account_deletions ad where ad.user_id = p_user
                 order by ad.requested_at desc limit 1),
    'earnings_waiting', public._unpaid_earnings_kobo(p_user) > 0
  );
end $$;

-- Reveal a reader's full email and phone, audited with a reason.
create function public.staff_reveal_contact(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  perform public._staff_support();
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.write_audit('readers', 'contact_revealed', 'user', p_user::text, p.full_name,
    'Revealed phone and email', null, null, btrim(p_reason));
  return jsonb_build_object('phone', p.phone, 'email', (select email from auth.users where id = p_user));
end $$;

create function public.staff_sign_out_device(p_user uuid, p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.user_devices;
begin
  perform public._staff_acts_on_readers();
  select * into d from public.user_devices where id = p_device and user_id = p_user and revoked_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.user_devices set revoked_at = now(), revoked_by = 'staff', download_enabled = false, push_token = null
  where id = d.id;
  if d.session_id is not null then
    delete from auth.sessions where id = d.session_id and user_id = p_user;
  end if;
  perform public.write_audit('readers', 'device_signed_out', 'user', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Signed out ' || coalesce(d.model, 'a device'),
    null, null, null);
end $$;

create function public.staff_sign_out_all(p_user uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform public._staff_acts_on_readers();
  update public.user_devices set revoked_at = now(), revoked_by = 'staff', download_enabled = false, push_token = null
  where user_id = p_user and revoked_at is null;
  get diagnostics n = row_count;
  delete from auth.sessions where user_id = p_user;
  perform public.write_audit('readers', 'signed_out_all', 'user', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Signed out on all devices', null,
    jsonb_build_object('devices', n), null);
  return n;
end $$;

-- The api Worker sends the email (POST /v1/readers/:id/password-reset); this checks the caller,
-- writes the audit entry and returns the address.
create function public.staff_send_password_reset(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  perform public._staff_acts_on_readers();
  select email into v_email from auth.users where id = p_user;
  if v_email is null or exists (select 1 from public.profiles where id = p_user and deleted_at is not null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.write_audit('readers', 'password_reset_sent', 'user', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Sent a password reset email', null, null, null);
  return v_email;
end $$;

-- Change role (Super admin): Reader, or Reader and author.
create function public.staff_set_reader_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  was boolean;
begin
  if not (public.has_permission('view_readers') and public.is_staff('super_admin')) then
    raise exception 'Not allowed: change role' using errcode = 'insufficient_privilege';
  end if;
  if p_role is null or p_role not in ('reader', 'author') then
    raise exception 'bad_role' using errcode = '22023';
  end if;
  select is_author into was from public.profiles where id = p_user for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.profiles set is_author = (p_role = 'author') where id = p_user;
  perform public.write_audit('readers', 'role_changed', 'user', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Role changed to ' || p_role,
    jsonb_build_object('is_author', was), jsonb_build_object('is_author', p_role = 'author'), null);
end $$;

create function public.staff_add_note(p_user uuid, p_body text) returns public.staff_notes
language plpgsql security definer set search_path = '' as $$
declare
  out public.staff_notes;
begin
  perform public._staff_acts_on_readers();
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'note_length' using errcode = '22023';
  end if;
  insert into public.staff_notes (user_id, author_id, body) values (p_user, auth.uid(), btrim(p_body))
  returning * into out;
  perform public.write_audit('readers', 'note_added', 'user', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Added a staff note', null, null, null);
  return out;
end $$;

-- s-user-delete. `now` (the reader asked in writing) needs the typed DELETE; `after_30_days` hides
-- and signs out now and erases after 30 days unless restored.
create function public.staff_start_deletion(p_user uuid, p_mode text, p_reason text, p_confirm text default null)
returns public.account_deletions
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  out public.account_deletions;
begin
  perform public._staff_support();
  if p_mode is null or p_mode not in ('now', 'after_30_days') then
    raise exception 'bad_mode' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found or p.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_mode = 'now' and upper(btrim(coalesce(p_confirm, ''))) <> 'DELETE' then
    raise exception 'confirm_text' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff_roles s where s.user_id = p_user and s.active) then
    raise exception 'staff_account' using errcode = '22023';
  end if;
  out := public._start_deletion(p_user, 'staff', auth.uid(), btrim(p_reason),
    case when p_mode = 'now' then now() else now() + interval '30 days' end,
    case when p_mode = 'now' then null else now() + interval '30 days' end);
  perform public.write_audit('readers', 'account_deletion_started', 'user', p_user::text, p.full_name,
    case when p_mode = 'now' then 'Deleted now' else 'Deletes after 30 days' end, null,
    jsonb_build_object('mode', p_mode, 'deletion_id', out.id), btrim(p_reason));
  return out;
end $$;

-- Restore during a staff-chosen 30-day grace (app deletions are immediate, Q3).
create function public.staff_cancel_deletion(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.account_deletions;
begin
  perform public._staff_support();
  select * into d from public.account_deletions where user_id = p_user and status = 'pending'
    and grace_until > now() for update;
  if not found then
    raise exception 'not_restorable' using errcode = '22023';
  end if;
  update public.account_deletions set status = 'cancelled', completed_at = now() where id = d.id;
  update public.profiles set deleted_at = null, deletion_requested_at = null where id = p_user;
  perform public.write_audit('readers', 'account_deletion_cancelled', 'user', p_user::text,
    (select full_name from public.profiles where id = p_user), 'Restored the account', null, null,
    nullif(btrim(coalesce(p_reason, '')), ''));
end $$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.reading_goals enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.consent_log enable row level security;
alter table public.account_deletions enable row level security;
alter table public.staff_notes enable row level security;

create policy reading_goals_own on public.reading_goals for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_preferences_own on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy consent_log_select on public.consent_log for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('view_readers')));
create policy account_deletions_select on public.account_deletions for select to authenticated
  using (user_id = (select auth.uid())
         or ((select public.has_permission('view_readers'))
             and (select public.is_staff_any(array['support']::public.staff_role[]))));
create policy staff_notes_select on public.staff_notes for select to authenticated
  using ((select public.has_permission('view_readers'))
         and (select public.is_staff_any(array['support', 'operations_admin', 'moderator']::public.staff_role[])));

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Clients read their own rows; every write goes through the RPCs above.
revoke all on public.reading_goals, public.notification_preferences, public.consent_log,
  public.account_deletions, public.staff_notes from anon, authenticated;
grant select on public.reading_goals, public.notification_preferences, public.consent_log,
  public.account_deletions, public.staff_notes to authenticated;

revoke execute on function
  public._name_change_limit(), public._device_session(), public._me(), public._lagos_year(),
  public._books_finished(uuid, integer), public._annotation_counts(uuid), public._unpaid_earnings_kobo(uuid),
  public.get_profile_summary(), public.set_reading_goal(integer, integer),
  public.list_collection(text, timestamptz, text, integer), public.delete_annotation(uuid),
  public.restore_annotation(uuid), public.update_profile(jsonb), public.get_notification_preferences(),
  public.set_notification_preferences(jsonb), public.notification_pref(uuid, text),
  public.list_my_devices(text), public.remove_device(uuid, text), public.claim_download_slot(text),
  public._start_deletion(uuid, text, uuid, text, timestamptz, timestamptz), public.request_account_deletion(text),
  public.erase_account(uuid), public.due_account_deletions(integer),
  public._mask_phone(text), public._staff_acts_on_readers(), public._staff_support(), public._reader_plan(uuid),
  public._reader_tab(boolean, jsonb), public.staff_list_readers(text, text, jsonb, integer),
  public.staff_get_reader(uuid), public.staff_reveal_contact(uuid, text), public.staff_sign_out_device(uuid, uuid),
  public.staff_sign_out_all(uuid), public.staff_send_password_reset(uuid), public.staff_set_reader_role(uuid, text),
  public.staff_add_note(uuid, text), public.staff_start_deletion(uuid, text, text, text),
  public.staff_cancel_deletion(uuid, text)
  from public, anon, authenticated;

grant execute on function
  public.get_profile_summary(), public.set_reading_goal(integer, integer),
  public.list_collection(text, timestamptz, text, integer), public.delete_annotation(uuid),
  public.restore_annotation(uuid), public.update_profile(jsonb), public.get_notification_preferences(),
  public.set_notification_preferences(jsonb), public.list_my_devices(text), public.remove_device(uuid, text),
  public.claim_download_slot(text), public.request_account_deletion(text),
  public.staff_list_readers(text, text, jsonb, integer), public.staff_get_reader(uuid),
  public.staff_reveal_contact(uuid, text), public.staff_sign_out_device(uuid, uuid), public.staff_sign_out_all(uuid),
  public.staff_send_password_reset(uuid), public.staff_set_reader_role(uuid, text), public.staff_add_note(uuid, text),
  public.staff_start_deletion(uuid, text, text, text), public.staff_cancel_deletion(uuid, text)
  to authenticated;
grant execute on function public.erase_account(uuid), public.due_account_deletions(integer),
  public.notification_pref(uuid, text)
  to service_role;
