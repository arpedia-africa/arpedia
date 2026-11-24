-- Flow 02 · spec check 02-3, 02-4, 02-14.

-- ─── 02-3: "Most read" counts readers who opened the book ───────────────────
-- Distinct readers with a reading session (free preview or unlocked) or an unlock in the last 7 days; the
-- unlock-all count for ties still comes from entitlements. Feeds Top 10, Explore sort and
-- Recommended through refresh_rankings.
create index if not exists reading_sessions_started_idx on public.reading_sessions (started_at, book_id);

create or replace function public._readers_7d() returns table (book_id uuid, readers int, unlocks int)
language sql stable security definer set search_path = '' as $$
  with s as (
    select x.book_id, count(distinct x.user_id)::int as readers
    from (
      select rs.book_id, rs.user_id from public.reading_sessions rs
      where rs.started_at > now() - interval '7 days'
      -- An unlock not yet opened (or read offline, session not synced) still counts.
      union all
      select e.book_id, e.user_id from public.entitlements e
      where e.created_at > now() - interval '7 days' and e.revoked_at is null
    ) x
    group by x.book_id
  ), u as (
    select e.book_id, count(*) filter (where e.source = 'unlock_all')::int as unlocks
    from public.entitlements e
    where e.created_at > now() - interval '7 days' and e.revoked_at is null
    group by e.book_id
  )
  select coalesce(s.book_id, u.book_id), coalesce(s.readers, 0), coalesce(u.unlocks, 0)
  from s full join u on u.book_id = s.book_id
$$;

-- ─── 02-4: clubs are searched ───────────────────────────────────────────────
-- Public clubs (official and reader clubs) whose name matches. Rooms, read-alongs, author
-- channels and DMs are not clubs here.
create function public._search_clubs(p_q text) returns table (id uuid, name text, members int, score int)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.member_count,
    public._match(p_q, g.name, (select typo_distance from public.search_settings limit 1))
  from public.groups g
  where g.kind in ('official', 'club') and g.visibility = 'public' and g.archived_at is null
    and public._match(p_q, g.name, (select typo_distance from public.search_settings limit 1)) > 0
$$;
revoke execute on function public._search_clubs(text) from public, anon, authenticated;

-- Up to 8 suggestions: books, authors, clubs and genres.
create or replace function public.suggest(p_q text) returns jsonb
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
      select 3, cl.score::numeric, jsonb_build_object('type', 'club', 'id', cl.id, 'title', cl.name,
        'members', cl.members)
      from public._search_clubs(q) cl order by cl.score desc, cl.members desc limit 2) cb
    union all
    select * from (
      select 4, public._match(q, g.name, 2)::numeric, jsonb_build_object('type', 'genre', 'id', g.id,
        'slug', g.slug, 'title', g.name, 'books', g.book_count)
      from public.genre_book_counts g where g.visible and public._match(q, g.name, 2) > 0
      order by 2 desc limit 2) ge
    order by 1, 2 desc limit 8) s), '[]');
end $$;

-- Results: top result, books (snippets from preview text only), authors, clubs, counts per scope.
create or replace function public.search(p_q text, p_scope text default 'all', p_genre text default null,
                                         p_length_bands text[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := public.norm_query(p_q);
  v_books jsonb;
  v_authors jsonb;
  v_clubs jsonb;
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
  select coalesce(jsonb_agg(jsonb_build_object('id', cl.id, 'name', cl.name, 'members', cl.members)
      order by cl.score desc, cl.members desc, cl.name), '[]')
  into v_clubs from public._search_clubs(q) cl;
  return jsonb_build_object('query', q,
    'top', case when jsonb_array_length(v_books) > 0 then v_books -> 0 end,
    'books', case when p_scope in ('all', 'books') then v_books else '[]'::jsonb end,
    'authors', case when p_scope in ('all', 'authors') then v_authors else '[]'::jsonb end,
    'clubs', case when p_scope in ('all', 'clubs') then v_clubs else '[]'::jsonb end,
    'counts', jsonb_build_object(
      'all', jsonb_array_length(v_books) + jsonb_array_length(v_authors) + jsonb_array_length(v_clubs),
      'books', jsonb_array_length(v_books), 'authors', jsonb_array_length(v_authors),
      'clubs', jsonb_array_length(v_clubs)));
end $$;

-- ─── 02-14: Recommended leaves out books the reader has finished or saved ────
create or replace function public.get_recommendations() returns uuid[]
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
      and not exists (select 1 from public.reading_progress p where p.user_id = uid and p.book_id = c.id
                      and p.finished_at is not null)
      and not exists (select 1 from public.saved_books s where s.user_id = uid and s.book_id = c.id)
    order by score desc, c.published_at desc, c.id
    limit 20
  ) s;

  insert into public.recommendation_cache (user_id, book_ids, computed_at) values (uid, v_ids, now())
  on conflict (user_id) do update set book_ids = excluded.book_ids, computed_at = excluded.computed_at;
  return v_ids;
end $$;
