-- Flow 01 · Sign-in and onboarding: profile fields, genres, device registry, onboarding RPCs.
-- Never edit this file after merge; later flows add their own migrations.

-- ─── Types ──────────────────────────────────────────────────────────────────
create type public.signup_intent as enum ('reader', 'author');

-- Onboarding order. `signup` = account made, nothing else yet; `plans` = reached the paywall
-- (closing the app there counts as done, rule 29).
create function public.onboarding_step_ord(p_step text) returns int
language sql immutable set search_path = '' as $$
  select array_position(array['signup', 'interests', 'theme', 'role', 'profile', 'plans', 'done'], p_step)
$$;

-- ─── profiles (extend) ──────────────────────────────────────────────────────
alter table public.profiles
  add column phone text,
  add column date_of_birth date,
  add column country text not null default 'NG',
  add column signup_intent public.signup_intent,
  -- Existing accounts are past onboarding; only new rows start at 'signup' (default set below).
  add column onboarding_step text not null default 'done',
  add column terms_version int,
  add column privacy_version int,
  add column terms_accepted_at timestamptz,
  add column deleted_at timestamptz,
  add constraint profiles_full_name_len check (char_length(full_name) <= 80),
  add constraint profiles_phone_shape check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint profiles_country_shape check (country ~ '^[A-Z]{2}$'),
  add constraint profiles_onboarding_step check (public.onboarding_step_ord(onboarding_step) is not null);
alter table public.profiles alter column onboarding_step set default 'signup';

-- Public face of a reader: never phone, birthday or onboarding fields. Owned by postgres, so it
-- reads past profiles RLS; later flows add counts.
create view public.public_profiles with (security_barrier) as
  select id, username, full_name, avatar_url, bio, is_author
  from public.profiles
  where deleted_at is null;

-- ─── Sign-up trigger ────────────────────────────────────────────────────────
-- Username: name letters (max 20) plus 4 digits, retried until unique.
create function public.make_username(p_name text) returns text
language plpgsql volatile set search_path = '' as $$
declare
  base text := left(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]', '', 'g'), 20);
  candidate text;
begin
  if base = '' then base := 'reader'; end if;
  loop
    candidate := base || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.profiles where username = candidate);
  end loop;
  return candidate;
end $$;

-- Creates the profile for every new auth user. Email sign-up sends full_name, terms_version and
-- privacy_version in user metadata; Google sends full_name/name and avatar_url/picture.
-- Email sign-up metadata is client-supplied, so a photo URL is only taken from Google.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  nm text := left(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), 80);
  tv int := case when meta ->> 'terms_version' ~ '^[0-9]{1,6}$' then (meta ->> 'terms_version')::int end;
  pv int := case when meta ->> 'privacy_version' ~ '^[0-9]{1,6}$' then (meta ->> 'privacy_version')::int end;
  pic text := coalesce(meta ->> 'avatar_url', meta ->> 'picture');
  av text := case when new.raw_app_meta_data ->> 'provider' = 'google'
                   and pic ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' then left(pic, 500) end;
begin
  insert into public.profiles (id, username, full_name, avatar_url, terms_version, privacy_version,
    terms_accepted_at)
  values (new.id, public.make_username(nm), nm, av, tv, pv,
    case when tv is not null or pv is not null then now() end)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── genres ─────────────────────────────────────────────────────────────────
create table public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  position int not null,
  visible boolean not null default true,
  merged_into uuid references public.genres (id),
  created_at timestamptz not null default now()
);

-- Launch genres (same 10 as v25, in the prototype's order). Staff edit them in flow 02.
insert into public.genres (name, slug, position) values
  ('Fiction', 'fiction', 1),
  ('Christian', 'christian', 2),
  ('Christian romance', 'christian-romance', 3),
  ('Nigerian books', 'nigerian-books', 4),
  ('African literature', 'african-literature', 5),
  ('Faith', 'faith', 6),
  ('Romance', 'romance', 7),
  ('Drama', 'drama', 8),
  ('Short reads', 'short-reads', 9),
  ('Personal growth', 'personal-growth', 10);

create table public.user_genres (
  user_id uuid not null references public.profiles (id) on delete cascade,
  genre_id uuid not null references public.genres (id),
  created_at timestamptz not null default now(),
  primary key (user_id, genre_id)
);

-- ─── user_devices ───────────────────────────────────────────────────────────
create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_key text not null check (char_length(device_key) between 16 and 128),
  model text,
  os text,
  app_version text,
  push_token text,
  download_enabled boolean not null default false,
  last_seen_at timestamptz not null default now(),
  last_city text,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, device_key)
);

-- ─── RPCs ───────────────────────────────────────────────────────────────────
-- Replace the caller's genre picks in one transaction. Only visible genres.
create function public.set_user_genres(p_genre_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  ids uuid[] := array(select distinct unnest(coalesce(p_genre_ids, '{}')));
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(ids) g(id)
             where not exists (select 1 from public.genres x where x.id = g.id and x.visible)) then
    raise exception 'unknown genre' using errcode = '22023';
  end if;
  delete from public.user_genres where user_id = uid;
  insert into public.user_genres (user_id, genre_id) select uid, id from unnest(ids) g(id);
end $$;

-- Save one onboarding step and move to the next. Steps never move backwards (going back and
-- re-saving keeps the furthest step); `plans` and `done` both finish onboarding.
-- Payload per step:
--   interests {genre_ids?: uuid[]}   theme {theme}   role {intent}
--   profile {full_name?, phone?, date_of_birth?, country?}   signup, plans, done: {}
create function public.save_onboarding_step(p_step text, p_payload jsonb default '{}')
returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p jsonb := coalesce(p_payload, '{}');
  cur public.profiles;
  next_step text;
  v_name text;
  v_phone text;
  v_dob date;
  v_country text;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select * into cur from public.profiles where id = uid for update;
  if not found then
    raise exception 'no profile' using errcode = 'P0002';
  end if;
  if public.onboarding_step_ord(p_step) is null then
    raise exception 'unknown step %', p_step using errcode = '22023';
  end if;

  case p_step
    when 'interests' then
      if p ? 'genre_ids' and jsonb_array_length(p -> 'genre_ids') > 0 then
        perform public.set_user_genres(array(select jsonb_array_elements_text(p -> 'genre_ids')::uuid));
      end if;
    when 'theme' then
      update public.profiles set theme = (p ->> 'theme')::public.app_theme where id = uid;
    when 'role' then
      if p ->> 'intent' is null then
        raise exception 'pick reader or author' using errcode = '22023';
      end if;
      -- signup_intent is fixed once onboarding is finished.
      if cur.onboarding_step <> 'done' then
        update public.profiles set signup_intent = (p ->> 'intent')::public.signup_intent where id = uid;
      end if;
    when 'profile' then
      if p ? 'full_name' then
        v_name := btrim(p ->> 'full_name');
        if v_name is null or char_length(v_name) not between 1 and 80 then
          raise exception 'name must be 1 to 80 characters' using errcode = '22023';
        end if;
      end if;
      if nullif(p ->> 'phone', '') is not null then
        v_phone := p ->> 'phone';
        if v_phone !~ '^\+[1-9][0-9]{7,14}$' or (v_phone like '+234%' and v_phone !~ '^\+234[1-9][0-9]{9}$') then
          raise exception 'phone number looks wrong' using errcode = '22023';
        end if;
      end if;
      if nullif(p ->> 'date_of_birth', '') is not null then
        v_dob := (p ->> 'date_of_birth')::date;
        if v_dob < date '1900-01-01' or v_dob > (current_date - interval '16 years')::date then
          raise exception 'you must be at least 16' using errcode = '22023';
        end if;
      end if;
      if nullif(p ->> 'country', '') is not null then
        v_country := p ->> 'country';
        if v_country !~ '^[A-Z]{2}$' then
          raise exception 'unknown country' using errcode = '22023';
        end if;
      end if;
      update public.profiles set
        full_name = coalesce(v_name, full_name),
        phone = coalesce(v_phone, phone),
        date_of_birth = coalesce(v_dob, date_of_birth),
        country = coalesce(v_country, country)
      where id = uid;
    else
      null;
  end case;

  next_step := case when p_step in ('plans', 'done') then 'done'
    else (array['signup', 'interests', 'theme', 'role', 'profile', 'plans', 'done'])[public.onboarding_step_ord(p_step) + 1]
  end;
  update public.profiles
    set onboarding_step = case when public.onboarding_step_ord(next_step) > public.onboarding_step_ord(onboarding_step)
                               then next_step else onboarding_step end
    where id = uid
    returning * into cur;
  return cur;
end $$;

-- What the onboarding paywall shows: first name, picked genres, live catalogue count for them
-- (or the whole catalogue with no picks) and up to 3 books from those genres, most read first.
-- Plans and store prices come from the store (flow 09), not from here.
create function public.get_onboarding_paywall() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  picked text[];
  first_name text;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select split_part(btrim(full_name), ' ', 1) into first_name from public.profiles where id = uid;
  select array_agg(g.name order by g.position) into picked
    from public.user_genres ug join public.genres g on g.id = ug.genre_id
    where ug.user_id = uid and g.visible;
  -- Picks with no live books yet read as no picks (never "0 books in …").
  if not exists (select 1 from public.books b where b.status = 'live' and b.genres && picked) then
    picked := null;
  end if;
  return jsonb_build_object(
    'first_name', nullif(first_name, ''),
    'genres', to_jsonb(coalesce(picked, '{}')),
    'book_count', (select count(*) from public.books b
                   where b.status = 'live' and (picked is null or b.genres && picked)),
    'covers', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'author', x.author) order by x.reads desc, x.title)
      from (
        select b.id, b.title, p.full_name as author,
          (select count(*) from public.entitlements e where e.book_id = b.id) as reads
        from public.books b join public.profiles p on p.id = b.author_id
        where b.status = 'live' and (picked is null or b.genres && picked)
        order by reads desc, b.title
        limit 3
      ) x), '[]'::jsonb)
  );
end $$;

-- Upsert the caller's device on every sign-in. A new (or re-signed-in revoked) device gets
-- downloads only while the reader has fewer than 3 other enabled devices. Returns download_enabled.
create function public.register_device(p_device_key text, p_model text default null, p_os text default null,
  p_app_version text default null, p_push_token text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  dev public.user_devices;
  enabled_count int;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  -- One device registration at a time per reader, so two sign-ins can't both take the 3rd slot.
  perform 1 from public.profiles where id = uid for update;
  select * into dev from public.user_devices where user_id = uid and device_key = p_device_key;
  if found and dev.revoked_at is null then
    update public.user_devices set model = left(p_model, 120), os = left(p_os, 60),
      app_version = left(p_app_version, 40), push_token = coalesce(left(p_push_token, 400), push_token),
      last_seen_at = now()
    where id = dev.id;
    return dev.download_enabled;
  end if;
  select count(*) into enabled_count from public.user_devices
    where user_id = uid and download_enabled and revoked_at is null and device_key <> p_device_key;
  insert into public.user_devices (user_id, device_key, model, os, app_version, push_token, download_enabled)
  values (uid, p_device_key, left(p_model, 120), left(p_os, 60), left(p_app_version, 40), left(p_push_token, 400),
    enabled_count < 3)
  on conflict (user_id, device_key) do update set model = excluded.model, os = excluded.os,
    app_version = excluded.app_version, push_token = excluded.push_token, download_enabled = excluded.download_enabled,
    revoked_at = null, last_seen_at = now()
  returning * into dev;
  return dev.download_enabled;
end $$;

-- s-all-set (rule 30): read, never typed in. Credits and plan come from the caller's latest
-- plan_grant ledger row (flow 09 writes it with ref_type 'plan', ref_id = plan id; renewal is
-- that date plus the plan's period until flow 09's subscription row exists). Plus this week's top
-- live book (most unlocks in 7 days, then all time) with its credit price, and the top author.
create function public.get_all_set() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g_credits int;
  g_plan text;
  g_at timestamptz;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select l.delta, l.ref_id, l.created_at into g_credits, g_plan, g_at
    from public.credit_ledger l
    where l.user_id = uid and l.reason = 'plan_grant' and l.delta > 0
    order by l.created_at desc limit 1;
  return jsonb_build_object(
    'credits', g_credits,
    'plan', g_plan,
    'granted_at', g_at,
    'book', (
      select jsonb_build_object('id', b.id, 'title', b.title, 'price', r.price_credits)
      from public.books b
      left join public.book_revisions r on r.id = b.current_revision_id
      where b.status = 'live'
      order by (select count(*) from public.entitlements e
                where e.book_id = b.id and e.created_at > now() - interval '7 days') desc,
               (select count(*) from public.entitlements e where e.book_id = b.id) desc,
               b.title
      limit 1),
    'author', (
      select jsonb_build_object('id', p.id, 'name', p.full_name, 'genre', a.genre, 'books', a.books)
      from (
        select b.author_id, count(*) as books, min(b.genres[1]) as genre,
          sum((select count(*) from public.entitlements e where e.book_id = b.id)) as reads
        from public.books b where b.status = 'live'
        group by b.author_id
      ) a join public.profiles p on p.id = a.author_id
      where p.id <> uid and p.deleted_at is null
      order by a.reads desc, a.books desc, p.full_name
      limit 1)
  );
end $$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.genres enable row level security;
alter table public.user_genres enable row level security;
alter table public.user_devices enable row level security;

create policy genres_select on public.genres for select to anon, authenticated using (true);
create policy user_genres_select on public.user_genres for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_devices_select on public.user_devices for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── Grants ─────────────────────────────────────────────────────────────────
-- Clients read; every write goes through the RPCs above (validated, one transaction).
revoke all on public.genres, public.user_genres, public.user_devices, public.public_profiles from anon, authenticated;
grant select on public.genres to anon, authenticated;
grant select on public.user_genres, public.user_devices, public.public_profiles to authenticated;

-- onboarding_step_ord stays public: pure, and used by the profiles check constraint.
revoke execute on function public.make_username(text), public.handle_new_user(),
  public.set_user_genres(uuid[]), public.save_onboarding_step(text, jsonb), public.get_onboarding_paywall(),
  public.register_device(text, text, text, text, text), public.get_all_set()
  from public, anon;
grant execute on function public.set_user_genres(uuid[]), public.save_onboarding_step(text, jsonb),
  public.get_onboarding_paywall(), public.register_device(text, text, text, text, text),
  public.get_all_set()
  to authenticated;
