-- Flow 02 · Discovery: Home sections and shelves, rankings, catalogue paging, search, book
-- requests and the notifications feed. Never edit this file after merge.
--
-- Until flow 04 ships reading sessions, "most read" counts distinct readers who unlocked a book in
-- the last 7 days (entitlements); flow 04 replaces public._readers_7d() with sessions.
-- Until flow 10 ships notification preferences, public.notification_allowed() is always true;
-- flow 10 replaces it. Clubs in search arrive with flow 06 (groups).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ─── Text helpers ───────────────────────────────────────────────────────────
-- Query normalisation (packages/core normalizeQuery mirrors it): accents off, lowercase, spaces
-- collapsed, trimmed, at most 80 characters.
create function public.norm_query(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select left(btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary,
    coalesce(p, ''))), '\s+', ' ', 'g')), 80)
$$;

-- Words of a normalised text (letters and digits only).
create function public.norm_words(p text) returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(w), '{}') from unnest(regexp_split_to_array(public.norm_query(p), '[^a-z0-9]+')) w
  where w <> ''
$$;

-- One query word against one text word: prefix, or (5+ letters) within p_typo edits.
create function public.word_hits(p_q text, p_w text, p_typo int) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select starts_with(p_w, p_q)
    or (p_typo > 0 and char_length(p_q) >= 5
        and extensions.levenshtein(p_q, left(p_w, char_length(p_q) + 1)) <= p_typo
        and extensions.levenshtein(p_q, p_w) <= p_typo + greatest(char_length(p_w) - char_length(p_q), 0))
$$;

-- ─── Catalogue (live books, public fields) ──────────────────────────────────
-- Owned by postgres, so it reads past books RLS; only live books with a live current revision.
create view public.catalog_books with (security_barrier) as
  select b.id, b.title, b.subtitle, b.author_id, p.full_name as author_name, p.avatar_url as author_avatar,
    coalesce(b.genres[1], '') as genre, b.genres, r.words, r.pages, r.price_credits, r.cover_key,
    coalesce(r.published_at, b.created_at) as published_at,
    public.norm_query(b.title) as title_norm, public.norm_query(p.full_name) as author_norm
  from public.books b
  join public.book_revisions r on r.id = b.current_revision_id
  join public.profiles p on p.id = b.author_id
  where b.status = 'live' and r.price_credits is not null;

-- Live book count per genre (matched by name, case-insensitive; a book counts once per genre).
create view public.genre_book_counts with (security_barrier) as
  select g.id, g.name, g.slug, g.position, g.visible,
    (select count(*) from public.catalog_books c
      where exists (select 1 from unnest(c.genres) x where lower(x) = lower(g.name)))::int as book_count
  from public.genres g
  where g.merged_into is null;

-- ─── Tags ───────────────────────────────────────────────────────────────────
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  merged_into uuid references public.tags (id),
  created_at timestamptz not null default now()
);
create table public.book_tags (
  book_id uuid not null references public.books (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (book_id, tag_id)
);
create table public.banned_tags (
  word text primary key check (word = lower(word) and char_length(word) between 1 and 40),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ─── Home sections and shelves ──────────────────────────────────────────────
create table public.home_sections (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('trending', 'authors', 'new_arrivals', 'top10', 'recommended',
    'coming_soon', 'genres')),
  title text not null,
  kind text not null check (kind in ('curated', 'automatic', 'algorithm')),
  position int not null,
  visible boolean not null default true,
  config jsonb not null default '{}',
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.shelf_items (
  section_id uuid not null references public.home_sections (id) on delete cascade,
  item_type text not null check (item_type in ('book', 'author')),
  item_id uuid not null,
  position int not null default 0,
  pinned boolean not null default false,
  excluded boolean not null default false,
  primary key (section_id, item_type, item_id)
);

create table public.shelf_drafts (
  section_id uuid not null references public.home_sections (id) on delete cascade,
  item_type text not null check (item_type in ('book', 'author')),
  item_id uuid not null,
  position int not null default 0,
  pinned boolean not null default false,
  excluded boolean not null default false,
  editor_id uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (section_id, item_type, item_id)
);

create table public.coming_soon_entries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null unique references public.books (id) on delete cascade,
  teaser text not null default '' check (char_length(teaser) <= 140),
  release_at timestamptz,
  notify_count int not null default 0,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create table public.coming_soon_notify (
  entry_id uuid not null references public.coming_soon_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);

-- kind: hourly (only the latest kept) or weekly (Monday copies, last 8 kept).
create table public.book_rankings (
  snapshot_at timestamptz not null,
  kind text not null check (kind in ('hourly', 'weekly')),
  book_id uuid not null references public.books (id) on delete cascade,
  rank int not null check (rank > 0),
  readers_7d int not null default 0,
  unlocks_7d int not null default 0,
  primary key (kind, snapshot_at, book_id)
);
create index book_rankings_book_idx on public.book_rankings (book_id, kind, snapshot_at desc);

create table public.shelf_tap_counts (
  section_key text not null,
  week_start date not null,
  position int not null,
  taps int not null default 0,
  primary key (section_key, week_start, position)
);

-- Per-reader Recommended for you, cached 6 hours.
create table public.recommendation_cache (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  book_ids uuid[] not null default '{}',
  computed_at timestamptz not null default now()
);

-- ─── Search ─────────────────────────────────────────────────────────────────
-- Free preview text only (first 10%), written by the ingest worker (flow 12).
create table public.book_search_text (
  id bigint generated always as identity primary key,
  book_revision_id uuid not null references public.book_revisions (id) on delete cascade,
  chapter_id uuid references public.chapters (id) on delete cascade,
  "offset" int not null default 0,
  text text not null,
  tsv tsvector generated always as (to_tsvector('simple', public.norm_query(left(text, 100000)))) stored
);
create index book_search_text_rev_idx on public.book_search_text (book_revision_id);
create index book_search_text_tsv_idx on public.book_search_text using gin (tsv);

create table public.search_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  query_norm text not null,
  result_count int not null default 0,
  tapped_type text,
  tapped_id uuid,
  created_at timestamptz not null default now()
);
create index search_events_at_idx on public.search_events (created_at desc);
create index search_events_user_idx on public.search_events (user_id, created_at desc);

create table public.book_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query_norm text not null check (char_length(query_norm) between 2 and 80),
  status text not null default 'open' check (status in ('open', 'wishlist', 'linked', 'fulfilled', 'dismissed')),
  book_id uuid references public.books (id) on delete set null,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (user_id, query_norm)
);
create index book_requests_query_idx on public.book_requests (query_norm);
create index book_requests_book_idx on public.book_requests (book_id) where book_id is not null;

create table public.search_synonyms (
  id uuid primary key default gen_random_uuid(),
  terms text[] not null check (cardinality(terms) >= 2),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create table public.search_promotions (
  id uuid primary key default gen_random_uuid(),
  query_norm text not null,
  book_id uuid not null references public.books (id) on delete cascade,
  position int not null check (position between 1 and 3),
  expires_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (query_norm, position)
);
create table public.search_settings (
  id boolean primary key default true check (id),
  typo_distance int not null default 2 check (typo_distance between 0 and 2),
  include_authors boolean not null default true,
  show_unreleased boolean not null default false,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
insert into public.search_settings default values;

-- ─── Notifications ──────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  category text not null check (category in ('books', 'authors', 'community')),
  actor_id uuid references public.profiles (id) on delete set null,
  book_id uuid references public.books (id) on delete set null,
  title text not null,
  body text not null default '',
  target_type text,
  target_id text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_feed_idx on public.notifications (user_id, read_at, created_at desc);
create index notifications_user_at_idx on public.notifications (user_id, created_at desc);

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.tags enable row level security;
alter table public.book_tags enable row level security;
alter table public.banned_tags enable row level security;
alter table public.home_sections enable row level security;
alter table public.shelf_items enable row level security;
alter table public.shelf_drafts enable row level security;
alter table public.coming_soon_entries enable row level security;
alter table public.coming_soon_notify enable row level security;
alter table public.book_rankings enable row level security;
alter table public.shelf_tap_counts enable row level security;
alter table public.recommendation_cache enable row level security;
alter table public.book_search_text enable row level security;
alter table public.search_events enable row level security;
alter table public.book_requests enable row level security;
alter table public.search_synonyms enable row level security;
alter table public.search_promotions enable row level security;
alter table public.search_settings enable row level security;
alter table public.notifications enable row level security;

-- Public reads (signed in): visible sections and their live rows, tags, rankings, coming soon.
create policy home_sections_select on public.home_sections for select to authenticated
  using (visible or (select public.is_staff()));
create policy shelf_items_select on public.shelf_items for select to authenticated
  using (not excluded or (select public.is_staff()));
create policy coming_soon_select on public.coming_soon_entries for select to authenticated using (true);
create policy coming_soon_notify_select on public.coming_soon_notify for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy tags_select on public.tags for select to authenticated using (true);
create policy book_tags_select on public.book_tags for select to authenticated using (true);
create policy book_rankings_select on public.book_rankings for select to authenticated using (true);

-- Staff only.
create policy shelf_drafts_select on public.shelf_drafts for select to authenticated
  using ((select public.has_permission('curate_discover')));
create policy banned_tags_select on public.banned_tags for select to authenticated
  using ((select public.is_staff()));
create policy shelf_tap_counts_select on public.shelf_tap_counts for select to authenticated
  using ((select public.is_staff()));
create policy search_events_select on public.search_events for select to authenticated
  using ((select public.is_staff_any(array['analyst', 'operations_admin']::public.staff_role[])));
create policy search_synonyms_select on public.search_synonyms for select to authenticated
  using ((select public.is_staff()));
create policy search_promotions_select on public.search_promotions for select to authenticated
  using ((select public.is_staff()));
create policy search_settings_select on public.search_settings for select to authenticated
  using ((select public.is_staff()));

-- Own rows.
create policy recommendation_cache_select on public.recommendation_cache for select to authenticated
  using (user_id = (select auth.uid()));
create policy book_requests_select on public.book_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- book_search_text: no client reads (snippets come only through search()).

revoke all on public.tags, public.book_tags, public.banned_tags, public.home_sections, public.shelf_items,
  public.shelf_drafts, public.coming_soon_entries, public.coming_soon_notify, public.book_rankings,
  public.shelf_tap_counts, public.recommendation_cache, public.book_search_text, public.search_events,
  public.book_requests, public.search_synonyms, public.search_promotions, public.search_settings,
  public.notifications, public.catalog_books, public.genre_book_counts
  from anon, authenticated;
grant select on public.tags, public.book_tags, public.banned_tags, public.home_sections, public.shelf_items,
  public.shelf_drafts, public.coming_soon_entries, public.coming_soon_notify, public.book_rankings,
  public.shelf_tap_counts, public.recommendation_cache, public.search_events, public.book_requests,
  public.search_synonyms, public.search_promotions, public.search_settings, public.notifications,
  public.catalog_books, public.genre_book_counts
  to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Workers write preview text and notifications only through functions below.
revoke insert, update, delete, truncate on public.notifications, public.search_events from service_role;
grant insert on public.book_search_text to service_role;

-- ─── Reader helpers ─────────────────────────────────────────────────────────
-- public._uid() (signed-in user or 42501) comes from flow 03's migration.

-- Distinct readers per book in the last 7 days (flow 04 swaps in reading sessions).
create function public._readers_7d() returns table (book_id uuid, readers int, unlocks int)
language sql stable security definer set search_path = '' as $$
  select e.book_id, count(distinct e.user_id)::int, count(*) filter (where e.source = 'unlock_all')::int
  from public.entitlements e
  where e.created_at > now() - interval '7 days' and e.revoked_at is null
  group by e.book_id
$$;

-- The book card every list uses.
create function public._book_json(c public.catalog_books) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'title', c.title, 'author_id', c.author_id,
    'author_name', c.author_name, 'genre', c.genre, 'words', c.words, 'pages', c.pages,
    'price_credits', c.price_credits, 'cover_key', c.cover_key, 'published_at', c.published_at)
$$;

create function public._latest_hourly() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(snapshot_at) from public.book_rankings where kind = 'hourly'
$$;

-- ─── Rankings ───────────────────────────────────────────────────────────────
-- Hourly snapshot; with p_weekly also a weekly copy (Mondays 00:00 WAT). Ties: more unlocks, then
-- newer. Keeps the latest hourly and the last 8 weekly snapshots.
create function public.refresh_rankings(p_weekly boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_at timestamptz := now();
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'refresh_rankings: not allowed' using errcode = 'insufficient_privilege';
  end if;
  delete from public.book_rankings where kind = 'hourly';
  insert into public.book_rankings (snapshot_at, kind, book_id, rank, readers_7d, unlocks_7d)
  select v_at, 'hourly', c.id,
    row_number() over (order by coalesce(r.readers, 0) desc, coalesce(r.unlocks, 0) desc, c.published_at desc, c.id),
    coalesce(r.readers, 0), coalesce(r.unlocks, 0)
  from public.catalog_books c left join public._readers_7d() r on r.book_id = c.id;
  if p_weekly then
    insert into public.book_rankings (snapshot_at, kind, book_id, rank, readers_7d, unlocks_7d)
    select snapshot_at, 'weekly', book_id, rank, readers_7d, unlocks_7d
    from public.book_rankings where kind = 'hourly';
    delete from public.book_rankings where kind = 'weekly' and snapshot_at not in (
      select distinct snapshot_at from public.book_rankings where kind = 'weekly' order by snapshot_at desc limit 8);
  end if;
end $$;

-- Top 10 with movement against the last weekly snapshot: up/down n, same, or new.
create function public.get_top10() returns jsonb
language sql stable security definer set search_path = '' as $$
  with cur as (
    select r.book_id, r.rank from public.book_rankings r
    where r.kind = 'hourly' and r.snapshot_at = public._latest_hourly()
      and not exists (select 1 from public.shelf_items s join public.home_sections h on h.id = s.section_id
                      where h.key = 'top10' and s.item_type = 'book' and s.item_id = r.book_id and s.excluded)
  ), ranked as (
    select cur.book_id, row_number() over (order by cur.rank) as rank from cur
  ), prev as (
    select r.book_id, r.rank from public.book_rankings r
    where r.kind = 'weekly' and r.snapshot_at = (select max(snapshot_at) from public.book_rankings where kind = 'weekly')
  )
  select coalesce(jsonb_agg(public._book_json(c) || jsonb_build_object('rank', k.rank,
      'prev_rank', case when p.rank <= 10 then p.rank end) order by k.rank), '[]')
  from ranked k join public.catalog_books c on c.id = k.book_id left join prev p on p.book_id = k.book_id
  where k.rank <= 10
$$;

-- ─── Recommendations ────────────────────────────────────────────────────────
-- score = w × share of picked genres matched + (1 − w) × popularity (w from the section config,
-- default 0.6). Excludes books the reader has unlocked. Cached 6 hours. No picks: popularity only.
create function public.get_recommendations() returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._uid();
  v_ids uuid[];
  w numeric := coalesce((select (config ->> 'interest_weight')::numeric from public.home_sections
                         where key = 'recommended'), 0.6);
  picks text[] := array(select lower(g.name) from public.user_genres u join public.genres g on g.id = u.genre_id
                        where u.user_id = uid);
  total int;
begin
  select book_ids into v_ids from public.recommendation_cache
  where user_id = uid and computed_at > now() - interval '6 hours';
  if found then return v_ids; end if;

  select count(*) into total from public.catalog_books;
  select coalesce(array_agg(id order by score desc, published_at desc, id), '{}') into v_ids from (
    select c.id, c.published_at,
      case when cardinality(picks) = 0 then 0
           else w * (select count(distinct lower(x)) from unnest(c.genres) x where lower(x) = any (picks))::numeric
                  / cardinality(picks) end
      + (case when cardinality(picks) = 0 then 1 else 1 - w end)
        * coalesce(1 - (r.rank - 1)::numeric / greatest(total, 1), 0) as score
    from public.catalog_books c
    left join public.book_rankings r on r.book_id = c.id and r.kind = 'hourly'
      and r.snapshot_at = public._latest_hourly()
    where not exists (select 1 from public.entitlements e where e.user_id = uid and e.book_id = c.id
                      and e.revoked_at is null)
    order by score desc, c.published_at desc, c.id
    limit 20
  ) s;

  insert into public.recommendation_cache (user_id, book_ids, computed_at) values (uid, v_ids, now())
  on conflict (user_id) do update set book_ids = excluded.book_ids, computed_at = excluded.computed_at;
  return v_ids;
end $$;

-- ─── Home ───────────────────────────────────────────────────────────────────
create function public._section_items(h public.home_sections, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_max int := coalesce((h.config ->> 'max_items')::int, 10);
  v jsonb;
begin
  if h.key = 'trending' then
    select coalesce(jsonb_agg(public._book_json(c) order by s.position), '[]') into v
    from public.shelf_items s join public.catalog_books c on c.id = s.item_id
    where s.section_id = h.id and s.item_type = 'book' and not s.excluded;
  elsif h.key = 'authors' then
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'avatar_url', p.avatar_url)
      order by s.position), '[]') into v
    from public.shelf_items s join public.profiles p on p.id = s.item_id and p.deleted_at is null
    where s.section_id = h.id and s.item_type = 'author' and not s.excluded;
  elsif h.key = 'new_arrivals' then
    -- Pinned books first (in pin order), then the newest of the last 30 days.
    select coalesce(jsonb_agg(n.j order by n.pin_pos nulls last, n.published_at desc), '[]') into v
    from (
      select public._book_json(c) as j, s.position as pin_pos, c.published_at
      from public.catalog_books c
      left join public.shelf_items s on s.section_id = h.id and s.item_type = 'book' and s.item_id = c.id
      where coalesce(s.excluded, false) = false
        and (s.pinned or c.published_at > now() - interval '30 days')
      order by s.position nulls last, c.published_at desc
      limit v_max
    ) n;
  elsif h.key = 'top10' then
    v := public.get_top10();
  elsif h.key = 'recommended' then
    select coalesce(jsonb_agg(public._book_json(c) order by k.ord), '[]') into v
    from unnest(public.get_recommendations()) with ordinality k(id, ord)
    join public.catalog_books c on c.id = k.id
    where k.ord <= v_max;
  elsif h.key = 'coming_soon' then
    select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'author_name', p.full_name,
      'teaser', e.teaser, 'release_at', e.release_at, 'cover_key', r.cover_key) order by e.release_at), '[]') into v
    from public.coming_soon_entries e
    join public.books b on b.id = e.book_id and b.status = 'scheduled'
    join public.profiles p on p.id = b.author_id
    left join public.book_revisions r on r.book_id = b.id and r.status = 'scheduled'
    where e.release_at is null or e.release_at > now();
  elsif h.key = 'genres' then
    select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug,
      'book_count', g.book_count) order by g.position), '[]') into v
    from public.genre_book_counts g where g.visible;
  end if;
  return coalesce(v, '[]');
end $$;

-- Every visible section in order with its items, plus the bell count, credits and the
-- Recommended subtitle ("Because you picked …" or "Popular with new readers").
create function public.get_home(p_app_version text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._uid();
  picks text[] := array(select g.name from public.user_genres u join public.genres g on g.id = u.genre_id
                        where u.user_id = uid order by g.position limit 2);
begin
  return jsonb_build_object(
    'first_name', (select split_part(btrim(full_name), ' ', 1) from public.profiles where id = uid),
    'credits', public.credit_balance(uid),
    'unread', (select count(*) from public.notifications where user_id = uid and read_at is null),
    'picks', to_jsonb(picks),
    'live_books', (select count(*) from public.catalog_books),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('key', h.key, 'title', h.title, 'kind', h.kind,
        'items', public._section_items(h, uid)) order by h.position)
      from public.home_sections h where h.visible), '[]'));
end $$;

-- Taps per shelf position, batched by the app.
create function public.log_shelf_taps(p_taps jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._uid();
  insert into public.shelf_tap_counts (section_key, week_start, position, taps)
  select k, date_trunc('week', now())::date, pos, sum(n)
  from (
    select t ->> 'section_key' as k, (t ->> 'position')::int as pos,
      least(greatest(coalesce((t ->> 'taps')::int, 1), 1), 50) as n
    from jsonb_array_elements(coalesce(p_taps, '[]')) t
    where t ->> 'section_key' in (select key from public.home_sections) and (t ->> 'position')::int between 0 and 49
    limit 50) b
  group by k, pos
  on conflict (section_key, week_start, position) do update
    set taps = public.shelf_tap_counts.taps + excluded.taps;
end $$;

-- ─── Explore ────────────────────────────────────────────────────────────────
-- Length bands by stored price: short < 75 cr (under 150 pages), medium 75–149, long 150+.
create function public._in_bands(p_price int, p_bands text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p_bands), 0) = 0
    or ('short' = any (p_bands) and p_price < 75)
    or ('medium' = any (p_bands) and p_price >= 75 and p_price < 150)
    or ('long' = any (p_bands) and p_price >= 150)
$$;

create function public._genre_name(p_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select name from public.genres where slug = p_slug
$$;

create function public.count_books(p_genre text default null, p_length_bands text[] default null) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.catalog_books c
  where (p_genre is null or exists (select 1 from unnest(c.genres) x where lower(x) = lower(public._genre_name(p_genre))))
    and public._in_bands(c.price_credits, p_length_bands)
$$;

-- 20 books a page. Sort: most_read (default), newest, price. Keyset cursor {"k": number, "id": uuid}
-- on an ascending sort key (descending sorts are negated).
create function public.list_books(p_genre text default null, p_length_bands text[] default null,
                                  p_sort text default 'most_read', p_cursor jsonb default null,
                                  p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_sort text := coalesce(p_sort, 'most_read');
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb;
  v_next jsonb;
begin
  perform public._uid();
  if v_sort not in ('most_read', 'newest', 'price') then
    raise exception 'unknown sort' using errcode = '22023';
  end if;
  with base as (
    select c.id, public._book_json(c) as j, case v_sort
        when 'most_read' then -coalesce(r.readers_7d, 0)::numeric * 1000000 + coalesce(r.rank, 999999)
        when 'newest' then -extract(epoch from c.published_at)::numeric
        else c.price_credits::numeric end as sk
    from public.catalog_books c
    left join public.book_rankings r on r.book_id = c.id and r.kind = 'hourly'
      and r.snapshot_at = public._latest_hourly()
    where (p_genre is null or exists (select 1 from unnest(c.genres) x where lower(x) = lower(public._genre_name(p_genre))))
      and public._in_bands(c.price_credits, p_length_bands)
  ), page as (
    select * from base
    where p_cursor is null or (sk, id) > ((p_cursor ->> 'k')::numeric, (p_cursor ->> 'id')::uuid)
    order by sk, id limit v_limit
  )
  select coalesce(jsonb_agg(j order by sk, id), '[]'),
    (select jsonb_build_object('k', sk, 'id', id) from page order by sk desc, id desc limit 1)
  into v_items, v_next from page;
  return jsonb_build_object('items', v_items, 'count', public.count_books(p_genre, p_length_bands),
    'next', case when jsonb_array_length(v_items) = v_limit then v_next end);
end $$;

-- ─── Search ─────────────────────────────────────────────────────────────────
-- Query words plus their synonyms (any group holding the word).
create function public._expand(p_words text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct w), '{}') from (
    select unnest(p_words) as w
    union
    select public.norm_query(t) from public.search_synonyms s, unnest(s.terms) t
    where exists (select 1 from unnest(s.terms) x where public.norm_query(x) = any (p_words))
  ) a where w <> ''
$$;

-- Every query word hits some word of the text (or of a synonym of it). 0 = no match;
-- 100 exact, 80 prefix of the whole text, 50 all words matched.
create function public._match(p_q text, p_text text, p_typo int) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when public.norm_query(p_text) = p_q then 100
    when starts_with(public.norm_query(p_text), p_q) then 80
    when cardinality(public.norm_words(p_q)) > 0 and not exists (
      select 1 from unnest(public.norm_words(p_q)) q
      where not exists (
        select 1 from unnest(public.norm_words(p_text)) w
        where public.word_hits(q, w, p_typo)
           or exists (select 1 from public.search_synonyms s
                      where exists (select 1 from unnest(s.terms) a where public.norm_query(a) = q)
                        and exists (select 1 from unnest(s.terms) b where public.word_hits(public.norm_query(b), w, 0)))
      )) then 50
    else 0 end
$$;

-- One sentence around the first match, at most 120 characters (packages/core trimSnippet mirrors it).
create function public._snippet(p_text text, p_word text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  t text := regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g');
  pos int := strpos(lower(t), lower(coalesce(p_word, '')));
  s int;
  e int;
  sent text;
begin
  if pos = 0 or p_word = '' then return null; end if;
  s := pos;
  while s > 1 and substr(t, s - 1, 1) not in ('.', '!', '?') loop s := s - 1; end loop;
  e := pos + char_length(p_word);
  while e <= char_length(t) and substr(t, e, 1) not in ('.', '!', '?') loop e := e + 1; end loop;
  sent := btrim(substr(t, s, e - s + 1));
  if char_length(sent) <= 120 then return sent; end if;
  pos := strpos(lower(sent), lower(p_word));
  s := greatest(1, least(pos - 50, char_length(sent) - 117));
  return case when s > 1 then '…' else '' end
    || btrim(substr(sent, s + case when s > 1 then 1 else 0 end, 118 - case when s > 1 then 1 else 0 end))
    || case when s + 117 < char_length(sent) then '…' else '' end;
end $$;

-- Story matches: preview text of the live revision only.
create function public._story_hits(p_q text) returns table (book_id uuid, snippet text)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.id) c.id,
    public._snippet(t.text, (select w from unnest(public.norm_words(p_q)) w order by char_length(w) desc limit 1))
  from public.catalog_books c
  join public.books b on b.id = c.id
  join public.book_search_text t on t.book_revision_id = b.current_revision_id
  where cardinality(public.norm_words(p_q)) > 0
    and t.tsv @@ to_tsquery('simple', array_to_string(array(
      select quote_literal(w) || ':*' from unnest(public.norm_words(p_q)) w), ' & '))
  order by c.id, t."offset"
$$;

-- Scored books for a normalised query. Promoted rows carry `promoted` and sort first.
create function public._search_books(p_q text) returns table (id uuid, score numeric, snippet text, promoted boolean)
language sql stable security definer set search_path = '' as $$
  with s as (select * from public.search_settings limit 1),
  hits as (
    select c.id,
      greatest(public._match(p_q, c.title, (select typo_distance from s)),
        case when (select include_authors from s) then
          (case when public._match(p_q, c.author_name, (select typo_distance from s)) > 0 then 60 else 0 end) else 0 end,
        case when exists (select 1 from unnest(c.genres) g where public._match(p_q, g, 0) > 0) then 30 else 0 end,
        case when exists (select 1 from public.book_tags bt join public.tags tg on tg.id = bt.tag_id
                          where bt.book_id = c.id and public._match(p_q, tg.name, 0) > 0) then 30 else 0 end
      )::numeric as base,
      st.snippet,
      coalesce(r.rank, 999999) as rank
    from public.catalog_books c
    left join public._story_hits(p_q) st on st.book_id = c.id
    left join public.book_rankings r on r.book_id = c.id and r.kind = 'hourly' and r.snapshot_at = public._latest_hourly()
  ),
  promo as (
    select book_id, position from public.search_promotions
    where query_norm = p_q and (expires_at is null or expires_at > now())
  )
  select h.id,
    case when p.position is not null then 1000 - p.position
         else greatest(h.base, case when h.snippet is not null then 20 else 0 end) + 1.0 / (h.rank + 1) end,
    h.snippet, p.position is not null
  from hits h left join promo p on p.book_id = h.id
  where p.position is not null or h.base > 0 or h.snippet is not null
$$;

create function public._search_authors(p_q text) returns table (id uuid, name text, avatar_url text, books int, score int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url, count(c.id)::int,
    public._match(p_q, p.full_name, (select typo_distance from public.search_settings limit 1))
  from public.profiles p join public.catalog_books c on c.author_id = p.id
  where (select include_authors from public.search_settings limit 1)
    and public._match(p_q, p.full_name, (select typo_distance from public.search_settings limit 1)) > 0
  group by p.id
$$;

-- Up to 8 suggestions: books, authors and genres (clubs join with flow 06).
create function public.suggest(p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := public.norm_query(p_q);
begin
  perform public._uid();
  if char_length(q) < 2 then return '[]'; end if;
  return coalesce((select jsonb_agg(x order by ord, score desc) from (
    select * from (
      select 1 as ord, b.score, jsonb_build_object('type', 'book', 'id', c.id, 'title', c.title,
        'sub', c.author_name, 'cover_key', c.cover_key,
        'topic', case when public._match(q, c.title, 2) = 0 and public._match(q, c.author_name, 2) = 0
                       and b.snippet is null then q end) as x
      from public._search_books(q) b join public.catalog_books c on c.id = b.id
      order by b.score desc limit 5) bk
    union all
    select * from (
      select 2, a.score::numeric, jsonb_build_object('type', 'author', 'id', a.id, 'title', a.name,
        'books', a.books, 'avatar_url', a.avatar_url)
      from public._search_authors(q) a order by a.score desc limit 3) au
    union all
    select * from (
      select 3, public._match(q, g.name, 2)::numeric, jsonb_build_object('type', 'genre', 'id', g.id,
        'slug', g.slug, 'title', g.name, 'books', g.book_count)
      from public.genre_book_counts g where g.visible and public._match(q, g.name, 2) > 0
      order by 2 desc limit 2) ge
    order by 1, 2 desc limit 8) s), '[]');
end $$;

-- Results: top result, books (snippets from preview text only), authors, counts per scope.
create function public.search(p_q text, p_scope text default 'all', p_genre text default null,
                              p_length_bands text[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := public.norm_query(p_q);
  v_books jsonb;
  v_authors jsonb;
begin
  perform public._uid();
  if char_length(q) < 2 then
    return jsonb_build_object('query', q, 'top', null, 'books', '[]'::jsonb, 'authors', '[]'::jsonb,
      'clubs', '[]'::jsonb, 'counts', jsonb_build_object('all', 0, 'books', 0, 'authors', 0, 'clubs', 0));
  end if;
  select coalesce(jsonb_agg(public._book_json(c) || jsonb_build_object('snippet', b.snippet,
      'promoted', b.promoted) order by b.score desc, c.id), '[]')
  into v_books
  from public._search_books(q) b join public.catalog_books c on c.id = b.id
  where (p_genre is null or exists (select 1 from unnest(c.genres) x where lower(x) = lower(public._genre_name(p_genre))))
    and public._in_bands(c.price_credits, p_length_bands);
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'avatar_url', a.avatar_url,
      'books', a.books) order by a.score desc, a.name), '[]')
  into v_authors from public._search_authors(q) a;
  return jsonb_build_object('query', q,
    'top', case when jsonb_array_length(v_books) > 0 then v_books -> 0 end,
    'books', case when p_scope in ('all', 'books') then v_books else '[]'::jsonb end,
    'authors', case when p_scope in ('all', 'authors') then v_authors else '[]'::jsonb end,
    'clubs', '[]'::jsonb,
    'counts', jsonb_build_object('all', jsonb_array_length(v_books) + jsonb_array_length(v_authors),
      'books', jsonb_array_length(v_books), 'authors', jsonb_array_length(v_authors), 'clubs', 0));
end $$;

-- Search empty state: trending queries (20+ searchers in 7 days, had results, no banned words),
-- genres with counts and authors readers look for.
create function public.get_search_home() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'trending', coalesce((select jsonb_agg(jsonb_build_object('query', t.query_norm, 'searchers', t.n,
        'book_id', t.book_id, 'author_id', t.author_id) order by t.n desc, t.query_norm) from (
      select e.query_norm, count(distinct e.user_id)::int as n,
        (select case when count(*) = 1 then min(b.id::text)::uuid end from public._search_books(e.query_norm) b) as book_id,
        null::uuid as author_id
      from public.search_events e
      where e.created_at > now() - interval '7 days' and e.result_count > 0 and e.user_id is not null
        and not exists (select 1 from public.banned_tags bt
          where cardinality(public.norm_words(bt.word)) > 0
            and strpos(' ' || array_to_string(public.norm_words(e.query_norm), ' ') || ' ',
                       ' ' || array_to_string(public.norm_words(bt.word), ' ') || ' ') > 0)
      group by e.query_norm
      having count(distinct e.user_id) >= 20
      order by count(distinct e.user_id) desc, e.query_norm limit 5) t), '[]'),
    'genres', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'slug', g.slug,
        'book_count', g.book_count) order by g.position) from (
      select * from public.genre_book_counts where visible order by position limit 6) g), '[]'),
    'authors', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name,
        'avatar_url', a.avatar_url) order by a.ord) from (
      select p.id, p.full_name, p.avatar_url, s.position as ord
      from public.shelf_items s join public.home_sections h on h.id = s.section_id and h.key = 'authors'
      join public.profiles p on p.id = s.item_id
      where s.item_type = 'author' and not s.excluded
      order by s.position limit 6) a), '[]'))
  where public._uid() is not null
$$;

-- Logs one search. 60 a minute per reader; queries under 2 characters are dropped.
create function public.log_search(p_q text, p_result_count int, p_tapped_type text default null,
                                  p_tapped_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._uid();
  q text := public.norm_query(p_q);
begin
  if char_length(q) < 2 then return; end if;
  if (select count(*) from public.search_events where user_id = uid and created_at > now() - interval '1 minute') >= 60 then
    return;
  end if;
  insert into public.search_events (user_id, query_norm, result_count, tapped_type, tapped_id)
  values (uid, q, greatest(coalesce(p_result_count, 0), 0),
    case when p_tapped_type in ('book', 'author', 'club', 'genre') then p_tapped_type end, p_tapped_id);
end $$;

-- Ask for a book. One per reader per normalised query (repeats return the same count), 10 a day.
create function public.request_book(p_q text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._uid();
  q text := public.norm_query(p_q);
begin
  if char_length(q) < 2 then
    raise exception 'type at least 2 letters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.book_requests where user_id = uid and query_norm = q) then
    if (select count(*) from public.book_requests where user_id = uid and created_at > now() - interval '1 day') >= 10 then
      raise exception 'You have asked for 10 books today. Try again tomorrow.' using errcode = 'P0001';
    end if;
    insert into public.book_requests (user_id, query_norm) values (uid, q);
  end if;
  return (select count(*) from public.book_requests where query_norm = q)::int;
end $$;

-- ─── Notifications ──────────────────────────────────────────────────────────
-- Flow 10 replaces this with the reader's preference for the kind.
create function public.notification_allowed(p_user uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select true
$$;

-- Skips when the preference is off; the same kind and target within a minute is one row.
-- Other flows' SQL calls this directly; Workers call create_notification.
create function public._create_notification(p_user uuid, p_kind text, p_category text, p_title text,
    p_body text default '', p_target_type text default null, p_target_id text default null,
    p_actor uuid default null, p_book uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.notification_allowed(p_user, p_kind) then return null; end if;
  select id into v_id from public.notifications
  where user_id = p_user and kind = p_kind and target_type is not distinct from p_target_type
    and target_id is not distinct from p_target_id and created_at > now() - interval '1 minute';
  if found then return v_id; end if;
  insert into public.notifications (user_id, kind, category, actor_id, book_id, title, body, target_type, target_id)
  values (p_user, p_kind, p_category, p_actor, p_book, left(p_title, 200), left(coalesce(p_body, ''), 500),
    p_target_type, p_target_id)
  returning id into v_id;
  return v_id;
end $$;

-- Service role only (Workers).
create function public.create_notification(p_user uuid, p_kind text, p_category text, p_title text,
    p_body text default '', p_target_type text default null, p_target_id text default null,
    p_actor uuid default null, p_book uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null or not public._is_service() then
    raise exception 'create_notification: service role only' using errcode = 'insufficient_privilege';
  end if;
  return public._create_notification(p_user, p_kind, p_category, p_title, p_body, p_target_type, p_target_id,
    p_actor, p_book);
end $$;

-- Feed page: latest 50 (older with p_before), with cover or avatar for each row.
create function public.get_notifications(p_category text default null, p_before timestamptz default null)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'unread', (select count(*) from public.notifications where user_id = auth.uid() and read_at is null),
    'unread_by_category', (select coalesce(jsonb_object_agg(category, n), '{}') from (
      select category, count(*) n from public.notifications where user_id = auth.uid() and read_at is null
      group by category) u),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'category', n.category,
        'title', n.title, 'body', n.body, 'target_type', n.target_type, 'target_id', n.target_id,
        'created_at', n.created_at, 'read_at', n.read_at, 'book_id', n.book_id, 'book_title', b.title,
        'cover_key', r.cover_key, 'actor_id', n.actor_id, 'actor_name', p.full_name, 'actor_avatar', p.avatar_url)
        order by n.created_at desc) from (
      select * from public.notifications
      where user_id = public._uid() and (p_category is null or category = p_category)
        and (p_before is null or created_at < p_before)
      order by created_at desc limit 50) n
      left join public.books b on b.id = n.book_id
      left join public.book_revisions r on r.id = b.current_revision_id
      left join public.profiles p on p.id = n.actor_id), '[]'))
$$;

create function public.mark_notification_read(p_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._uid();
begin
  update public.notifications set read_at = now() where id = p_id and user_id = uid and read_at is null;
  return (select count(*) from public.notifications where user_id = uid and read_at is null)::int;
end $$;

create function public.mark_all_notifications_read() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._uid();
begin
  update public.notifications set read_at = now() where user_id = uid and read_at is null;
  return 0;
end $$;

-- ─── Staff: curation ────────────────────────────────────────────────────────
create function public._section(p_id uuid) returns public.home_sections
language plpgsql security definer set search_path = '' as $$
declare
  h public.home_sections;
begin
  select * into h from public.home_sections where id = p_id for update;
  if not found then raise exception 'unknown section' using errcode = '22023'; end if;
  return h;
end $$;

-- Show or hide a section, or change its config (rotation, max items, interest weight).
create function public.update_home_section(p_id uuid, p_visible boolean default null,
                                           p_config jsonb default null) returns public.home_sections
language plpgsql security definer set search_path = '' as $$
declare
  h public.home_sections;
  n public.home_sections;
begin
  perform public.require_permission('curate_discover');
  h := public._section(p_id);
  if p_config ? 'interest_weight' and not ((p_config ->> 'interest_weight')::numeric between 0 and 1) then
    raise exception 'interest weight must be between 0 and 1' using errcode = '22023';
  end if;
  update public.home_sections set visible = coalesce(p_visible, visible),
    config = config || coalesce(p_config, '{}'), updated_by = auth.uid(), updated_at = now()
  where id = p_id returning * into n;
  perform public.write_audit('discover', 'section.update', 'home_section', h.key, h.title, null,
    jsonb_build_object('visible', h.visible, 'config', h.config), jsonb_build_object('visible', n.visible, 'config', n.config));
  return n;
end $$;

-- New order of every section (ids top to bottom).
create function public.reorder_home_sections(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('curate_discover');
  if (select count(*) from public.home_sections) <> cardinality(p_ids)
     or exists (select 1 from public.home_sections where not (id = any (p_ids))) then
    raise exception 'list every section once' using errcode = '22023';
  end if;
  update public.home_sections h set position = k.ord, updated_by = auth.uid(), updated_at = now()
  from unnest(p_ids) with ordinality k(id, ord) where h.id = k.id;
  perform public.write_audit('discover', 'section.reorder', 'home_section', null, 'Home sections', null, null,
    to_jsonb(array(select key from public.home_sections order by position)));
end $$;

-- Replace the section's draft. Items: [{item_type, item_id, pinned?, excluded?}] in order.
create function public.save_shelf_draft(p_section uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare
  h public.home_sections;
begin
  perform public.require_permission('curate_discover');
  h := public._section(p_section);
  if h.key in ('recommended', 'genres', 'coming_soon') then
    raise exception 'this section has no shelf' using errcode = '22023';
  end if;
  delete from public.shelf_drafts where section_id = p_section;
  insert into public.shelf_drafts (section_id, item_type, item_id, position, pinned, excluded, editor_id)
  select p_section, i ->> 'item_type', (i ->> 'item_id')::uuid, (k.ord - 1)::int,
    coalesce((i ->> 'pinned')::boolean, false), coalesce((i ->> 'excluded')::boolean, false), auth.uid()
  from jsonb_array_elements(coalesce(p_items, '[]')) with ordinality k(i, ord);
  return (select count(*) from public.shelf_drafts where section_id = p_section)::int;
end $$;

create function public.discard_shelf_draft(p_section uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('curate_discover');
  delete from public.shelf_drafts where section_id = p_section;
end $$;

-- Publish the draft: replaces the live rows in one transaction. Trending holds at most 10 books.
create function public.publish_shelf(p_section uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  h public.home_sections;
  v_before jsonb;
  v_n int;
begin
  perform public.require_permission('curate_discover');
  h := public._section(p_section);
  if not exists (select 1 from public.shelf_drafts where section_id = p_section) then
    raise exception 'no changes to publish' using errcode = '22023';
  end if;
  if h.key = 'trending' and (select count(*) from public.shelf_drafts
      where section_id = p_section and item_type = 'book' and not excluded) > 10 then
    raise exception 'Trending holds at most 10 books' using errcode = '22023';
  end if;
  if exists (select 1 from public.shelf_drafts d where d.section_id = p_section and d.item_type = 'book'
             and not d.excluded and not exists (select 1 from public.catalog_books c where c.id = d.item_id)) then
    raise exception 'only live books can go on a shelf' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', item_id, 'pinned', pinned, 'excluded', excluded)
    order by position), '[]') into v_before from public.shelf_items where section_id = p_section;
  delete from public.shelf_items where section_id = p_section;
  insert into public.shelf_items (section_id, item_type, item_id, position, pinned, excluded)
  select section_id, item_type, item_id, position, pinned, excluded from public.shelf_drafts where section_id = p_section;
  delete from public.shelf_drafts where section_id = p_section;
  update public.home_sections set updated_by = auth.uid(), updated_at = now() where id = p_section;
  select count(*) into v_n from public.shelf_items where section_id = p_section and not excluded;
  perform public.write_audit('discover', 'shelf.publish', 'home_section', h.key, h.title, null, v_before,
    (select jsonb_agg(jsonb_build_object('id', item_id, 'pinned', pinned, 'excluded', excluded) order by position)
     from public.shelf_items where section_id = p_section));
  return v_n;
end $$;

-- Mondays 06:00 WAT, when weekly rotation is on: the lowest 2 unpinned books out, the next 2 most
-- read live books not on the shelf in. Pinned books keep their positions.
create function public.rotate_trending() returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.home_sections;
begin
  if auth.uid() is not null then
    raise exception 'rotate_trending: cron only' using errcode = 'insufficient_privilege';
  end if;
  select * into h from public.home_sections where key = 'trending';
  if not found or not coalesce((h.config ->> 'rotate_weekly')::boolean, false) then return; end if;
  delete from public.shelf_items where (section_id, item_type, item_id) in (
    select section_id, item_type, item_id from public.shelf_items
    where section_id = h.id and item_type = 'book' and not pinned and not excluded
    order by position desc limit 2);
  insert into public.shelf_items (section_id, item_type, item_id, position)
  select h.id, 'book', r.book_id, 1000 + row_number() over (order by r.rank)
  from public.book_rankings r
  where r.kind = 'hourly' and r.snapshot_at = public._latest_hourly()
    and not exists (select 1 from public.shelf_items s where s.section_id = h.id and s.item_id = r.book_id)
  order by r.rank limit 2;
  -- Close the gaps; pinned rows keep their positions, the rest fill around them.
  with free as (
    select g.p, row_number() over (order by g.p) as k
    from generate_series(0, 99) g(p)
    where not exists (select 1 from public.shelf_items s where s.section_id = h.id and s.pinned and s.position = g.p)
  ), moving as (
    select item_type, item_id, row_number() over (order by position, item_id) as k
    from public.shelf_items where section_id = h.id and not pinned
  )
  update public.shelf_items s set position = f.p
  from moving m join free f on f.k = m.k
  where s.section_id = h.id and s.item_type = m.item_type and s.item_id = m.item_id;
  perform public._audit(null, 'discover', 'shelf.rotate', 'home_section', 'trending', h.title);
end $$;

-- Coming soon: pick a book, teaser and release date. The date follows the book's schedule.
create function public.save_coming_soon(p_book uuid, p_teaser text, p_release_at timestamptz default null)
returns public.coming_soon_entries
language plpgsql security definer set search_path = '' as $$
declare
  v public.coming_soon_entries;
begin
  perform public.require_permission('curate_discover');
  if char_length(coalesce(p_teaser, '')) > 140 then
    raise exception 'teaser is at most 140 characters' using errcode = '22023';
  end if;
  insert into public.coming_soon_entries (book_id, teaser, release_at, updated_by)
  values (p_book, coalesce(p_teaser, ''), p_release_at, auth.uid())
  on conflict (book_id) do update set teaser = excluded.teaser,
    release_at = coalesce(excluded.release_at, public.coming_soon_entries.release_at), updated_by = auth.uid()
  returning * into v;
  if p_release_at is not null then
    update public.book_revisions set schedule_at = p_release_at where book_id = p_book and status = 'scheduled';
  end if;
  perform public.write_audit('discover', 'coming_soon.save', 'book', p_book::text, null, null, null, to_jsonb(v));
  return v;
end $$;

-- ─── Staff: genres and tags ─────────────────────────────────────────────────
create function public.set_genre_visibility(p_genre uuid, p_visible boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('curate_discover');
  update public.genres set visible = p_visible where id = p_genre;
  if not found then raise exception 'unknown genre' using errcode = '22023'; end if;
  perform public.write_audit('discover', case when p_visible then 'genre.show' else 'genre.hide' end, 'genre',
    p_genre::text, (select name from public.genres where id = p_genre));
end $$;

-- Genres and tags: how many readers picked each genre in onboarding (readers' picks are private
-- rows, so staff see counts only).
create function public.genre_pick_counts() returns table (genre_id uuid, readers int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('curate_discover');
  return query select ug.genre_id, count(*)::int from public.user_genres ug group by ug.genre_id;
end $$;

create function public.reorder_genres(p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_permission('curate_discover');
  update public.genres g set position = k.ord from unnest(p_ids) with ordinality k(id, ord) where g.id = k.id;
  perform public.write_audit('discover', 'genre.reorder', 'genre', null, 'Genres', null, null, to_jsonb(p_ids));
end $$;

-- Merge tags into one: rewrites book_tags, marks the others merged.
create function public.merge_tags(p_from uuid[], p_into uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  perform public.require_permission('curate_discover');
  if p_into = any (p_from) then raise exception 'cannot merge a tag into itself' using errcode = '22023'; end if;
  insert into public.book_tags (book_id, tag_id)
  select book_id, p_into from public.book_tags where tag_id = any (p_from)
  on conflict do nothing;
  delete from public.book_tags where tag_id = any (p_from);
  update public.tags set merged_into = p_into where id = any (p_from);
  get diagnostics v_n = row_count;
  perform public.write_audit('discover', 'tag.merge', 'tag', p_into::text, (select name from public.tags where id = p_into),
    null, to_jsonb(p_from), null);
  return v_n;
end $$;

create function public.ban_tag(p_word text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w text := public.norm_query(p_word);
begin
  perform public.require_permission('curate_discover');
  insert into public.banned_tags (word, created_by) values (w, auth.uid()) on conflict do nothing;
  delete from public.book_tags where tag_id in (select id from public.tags where public.norm_query(name) = w);
  perform public.write_audit('discover', 'tag.ban', 'tag', null, w);
end $$;

-- ─── Staff: search tuning and requests ──────────────────────────────────────
-- p: {settings?: {typo_distance, include_authors, show_unreleased},
--     synonyms_add?: [[terms]], synonyms_remove?: [ids],
--     promotions_add?: [{query, book_id, position, expires_at}], promotions_remove?: [ids]}
-- One audit row per change group.
create function public.save_search_tuning(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.search_settings;
begin
  if not public.has_permission('manage_settings') then
    perform public.require_permission('search_tuning');
  end if;
  if p ? 'settings' then
    select * into s from public.search_settings;
    update public.search_settings set
      typo_distance = coalesce((p -> 'settings' ->> 'typo_distance')::int, typo_distance),
      include_authors = coalesce((p -> 'settings' ->> 'include_authors')::boolean, include_authors),
      show_unreleased = coalesce((p -> 'settings' ->> 'show_unreleased')::boolean, show_unreleased),
      updated_by = auth.uid(), updated_at = now();
    perform public.write_audit('discover', 'search.settings', 'search_settings', null, 'Search settings', null,
      to_jsonb(s), (select to_jsonb(x) from public.search_settings x));
  end if;
  if p ? 'synonyms_add' or p ? 'synonyms_remove' then
    delete from public.search_synonyms where id in (select (jsonb_array_elements_text(p -> 'synonyms_remove'))::uuid);
    insert into public.search_synonyms (terms, created_by)
    select array(select public.norm_query(t) from jsonb_array_elements_text(g) t where public.norm_query(t) <> ''), auth.uid()
    from jsonb_array_elements(coalesce(p -> 'synonyms_add', '[]')) g;
    perform public.write_audit('discover', 'search.synonyms', 'search_synonyms', null, 'Synonyms', null, null,
      jsonb_build_object('add', p -> 'synonyms_add', 'remove', p -> 'synonyms_remove'));
  end if;
  if p ? 'promotions_add' or p ? 'promotions_remove' then
    delete from public.search_promotions where id in (select (jsonb_array_elements_text(p -> 'promotions_remove'))::uuid);
    insert into public.search_promotions (query_norm, book_id, position, expires_at, created_by)
    select public.norm_query(x ->> 'query'), (x ->> 'book_id')::uuid, (x ->> 'position')::int,
      (x ->> 'expires_at')::timestamptz, auth.uid()
    from jsonb_array_elements(coalesce(p -> 'promotions_add', '[]')) x
    on conflict (query_norm, position) do update set book_id = excluded.book_id, expires_at = excluded.expires_at;
    perform public.write_audit('discover', 'search.promotions', 'search_promotions', null, 'Promoted results', null, null,
      jsonb_build_object('add', p -> 'promotions_add', 'remove', p -> 'promotions_remove'));
  end if;
end $$;

-- Search tuning is Operations admin and Super admin (Default Q10).
insert into public.permissions (key, label, matrix_order, more) values ('search_tuning', 'Search tuning', null, false);
insert into public.role_permissions (role, permission) values ('super_admin', 'search_tuning'), ('operations_admin', 'search_tuning');

-- Link requests to a book (status linked); publishing it fulfils them.
create function public.link_book_request(p_ids uuid[], p_book uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  perform public.require_permission('curate_discover');
  update public.book_requests set status = 'linked', book_id = p_book
  where id = any (p_ids) and status in ('open', 'wishlist');
  get diagnostics v_n = row_count;
  perform public.write_audit('discover', 'request.link', 'book', p_book::text, null, null, to_jsonb(p_ids), null);
  if exists (select 1 from public.books where id = p_book and status = 'live') then
    perform public._fulfil_requests(p_book);
  end if;
  return v_n;
end $$;

-- Wishlist or dismiss whole queries (every reader's request for it).
create function public.set_book_request_status(p_query text, p_status text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  perform public.require_permission('curate_discover');
  if p_status not in ('open', 'wishlist', 'dismissed') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  update public.book_requests set status = p_status
  where query_norm = public.norm_query(p_query) and status in ('open', 'wishlist', 'dismissed');
  get diagnostics v_n = row_count;
  perform public.write_audit('discover', 'request.' || p_status, 'book_request', null, public.norm_query(p_query));
  return v_n;
end $$;

-- One notification per linked requester when the book is live.
create function public._fulfil_requests(p_book uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_title text := (select title from public.books where id = p_book);
begin
  for r in update public.book_requests set status = 'fulfilled', fulfilled_at = now()
           where book_id = p_book and status = 'linked' returning user_id loop
    perform public._create_notification(r.user_id, 'book_request_fulfilled', 'books', v_title,
      v_title || ' is now on Arpedia. You asked for it.', 'book', p_book::text, null, p_book);
  end loop;
end $$;

create function public._books_live_fulfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._fulfil_requests(new.id);
  return new;
end $$;
create trigger books_live_fulfil_requests after update of status on public.books
  for each row when (new.status = 'live' and old.status is distinct from 'live')
  execute function public._books_live_fulfil();

-- ─── Retention ──────────────────────────────────────────────────────────────
create function public.purge_discovery() returns void
language sql security definer set search_path = '' as $$
  delete from public.notifications where created_at < now() - interval '90 days';
  delete from public.search_events where created_at < now() - interval '90 days';
  delete from public.recommendation_cache where computed_at < now() - interval '1 day';
$$;

-- ─── Seed configuration ─────────────────────────────────────────────────────
insert into public.home_sections (key, title, kind, position, visible, config) values
  ('trending', 'Trending this week', 'curated', 1, true, '{"max_items":10,"rotate_weekly":true}'),
  ('authors', 'Arpedia authors', 'curated', 2, true, '{"max_items":12}'),
  ('new_arrivals', 'New arrivals', 'automatic', 3, true, '{"max_items":10,"days":30}'),
  ('top10', 'Top 10 books', 'automatic', 4, true, '{"max_items":10}'),
  -- Default Q6: Coming soon is a Home rail after Top 10, hidden when empty.
  ('coming_soon', 'Coming soon', 'curated', 5, true, '{"max_items":10}'),
  ('recommended', 'Recommended for you', 'algorithm', 6, true, '{"max_items":10,"interest_weight":0.6}'),
  ('genres', 'Browse genres', 'automatic', 7, true, '{}');

-- ─── Cron (UTC; WAT = UTC+1) ────────────────────────────────────────────────
select cron.schedule('refresh_rankings', '5 * * * *', $$select public.refresh_rankings(false)$$);
select cron.schedule('refresh_rankings_weekly', '0 23 * * 0', $$select public.refresh_rankings(true)$$);
select cron.schedule('rotate_trending', '0 5 * * 1', $$select public.rotate_trending()$$);
select cron.schedule('purge_discovery', '45 2 * * *', $$select public.purge_discovery()$$);

-- ─── Story search text (api Worker cron, workers/api/src/routes/02/search-text.ts) ──
-- Live revisions not indexed yet. A revision with no preview text still gets one empty row, so it
-- is not picked again.
create function public.revisions_needing_search_text(p_limit int default 5)
returns table (revision_id uuid, work_version int)
language sql stable security definer set search_path = '' as $$
  select r.id, coalesce(r.sealed_work_version, r.work_version)
  from public.books b
  join public.book_revisions r on r.id = b.current_revision_id
  where b.status = 'live'
    and not exists (select 1 from public.book_search_text t where t.book_revision_id = r.id)
  order by r.published_at desc nulls last
  limit least(greatest(p_limit, 1), 50);
$$;

-- Replace a revision's preview text: p_rows = [{ "ord": 0, "text": "…" }, …].
create function public.set_book_search_text(p_rev uuid, p_rows jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.book_search_text where book_revision_id = p_rev;
  insert into public.book_search_text (book_revision_id, chapter_id, text)
  select p_rev, c.id, left(x.text, 100000)
  from jsonb_to_recordset(coalesce(p_rows, '[]')) as x(ord int, text text)
  left join public.chapters c on c.revision_id = p_rev and c.ord = x.ord
  where coalesce(x.text, '') <> '';
  if not found then
    insert into public.book_search_text (book_revision_id, text) values (p_rev, '');
  end if;
end $$;

-- ─── Function grants ────────────────────────────────────────────────────────
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in (
      'norm_query', 'norm_words', 'word_hits', '_uid', '_readers_7d', '_book_json', '_latest_hourly',
      'refresh_rankings', 'get_top10', 'get_recommendations', '_section_items', 'get_home', 'log_shelf_taps',
      '_in_bands', '_genre_name', 'count_books', 'list_books', '_expand', '_match', '_snippet', '_story_hits',
      '_search_books', '_search_authors', 'suggest', 'search', 'get_search_home', 'log_search', 'request_book',
      'notification_allowed', '_create_notification', 'create_notification', 'get_notifications', 'mark_notification_read',
      'mark_all_notifications_read', '_section', 'update_home_section', 'reorder_home_sections',
      'save_shelf_draft', 'discard_shelf_draft', 'publish_shelf', 'rotate_trending', 'save_coming_soon',
      'set_genre_visibility', 'genre_pick_counts', 'reorder_genres', 'merge_tags', 'ban_tag', 'save_search_tuning',
      'link_book_request', 'set_book_request_status', 'revisions_needing_search_text', 'set_book_search_text', '_fulfil_requests', '_books_live_fulfil', 'purge_discovery')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

grant execute on function
  public.get_home(text), public.get_recommendations(), public.get_top10(), public.list_books(text, text[], text, jsonb, int),
  public.count_books(text, text[]), public.suggest(text), public.search(text, text, text, text[]),
  public.get_search_home(), public.log_search(text, int, text, uuid), public.request_book(text),
  public.get_notifications(text, timestamptz), public.mark_notification_read(uuid),
  public.mark_all_notifications_read(), public.log_shelf_taps(jsonb), public.norm_query(text),
  public.update_home_section(uuid, boolean, jsonb), public.reorder_home_sections(uuid[]),
  public.save_shelf_draft(uuid, jsonb), public.discard_shelf_draft(uuid), public.publish_shelf(uuid),
  public.save_coming_soon(uuid, text, timestamptz), public.set_genre_visibility(uuid, boolean),
  public.genre_pick_counts(), public.reorder_genres(uuid[]), public.merge_tags(uuid[], uuid), public.ban_tag(text),
  public.save_search_tuning(jsonb), public.link_book_request(uuid[], uuid),
  public.set_book_request_status(text, text), public.refresh_rankings(boolean)
  to authenticated;
grant execute on function public.create_notification(uuid, text, text, text, text, text, text, uuid, uuid),
  public.refresh_rankings(boolean), public.rotate_trending(), public.purge_discovery(),
  public.revisions_needing_search_text(int), public.set_book_search_text(uuid, jsonb)
  to service_role;
