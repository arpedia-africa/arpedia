-- Flow 02 spec-check fixes: 02-12 (staff link a requested query to a book) and 02-13 ("Show unreleased
-- books" puts scheduled books in search, labelled Coming soon).

-- ─── 02-13: searchable books = live catalogue + scheduled books when the setting is on ──────────
-- Same columns as catalog_books, plus coming_soon. Only definer functions read it.
create view public.search_catalog with (security_barrier) as
  select c.*, false as coming_soon from public.catalog_books c
  union all
  select b.id, b.title, b.subtitle, b.author_id, p.full_name, p.avatar_url,
    coalesce(b.genres[1], ''), b.genres, r.words, r.pages, r.price_credits, r.cover_key,
    coalesce(r.schedule_at, b.created_at), public.norm_query(b.title), public.norm_query(p.full_name), true
  from public.books b
  join public.profiles p on p.id = b.author_id
  join lateral (select * from public.book_revisions x
                where x.book_id = b.id and x.status = 'scheduled'
                order by x.created_at desc limit 1) r on true
  where b.status = 'scheduled' and b.claim_hold_at is null
    and exists (select 1 from public.search_settings s where s.show_unreleased);

revoke all on public.search_catalog from public, anon, authenticated;

-- The search card: the book card plus the Coming soon flag.
create function public._book_json(c public.search_catalog) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'title', c.title, 'author_id', c.author_id,
    'author_name', c.author_name, 'genre', c.genre, 'words', c.words, 'pages', c.pages,
    'price_credits', c.price_credits, 'cover_key', c.cover_key, 'published_at', c.published_at,
    'coming_soon', c.coming_soon)
$$;

-- Same scoring as before, over search_catalog. Story snippets stay live-only (preview text of the
-- current revision), so a scheduled book matches on title, author, genre and tags.
create or replace function public._search_books(p_q text) returns table (id uuid, score numeric, snippet text, promoted boolean)
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
    from public.search_catalog c
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

-- Up to 8 suggestions: books (scheduled ones flagged coming_soon), authors, clubs and genres.
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
        'sub', c.author_name, 'cover_key', c.cover_key, 'coming_soon', c.coming_soon,
        'topic', case when public._match(q, c.title, 2) = 0 and public._match(q, c.author_name, 2) = 0
                       and b.snippet is null then q end) as x
      from public._search_books(q) b join public.search_catalog c on c.id = b.id
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

-- Results: the top result is the best released book (it offers a free preview and an unlock price);
-- Coming soon books follow released ones in Books.
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
      'promoted', b.promoted) order by c.coming_soon, b.score desc, c.id), '[]')
  into v_books
  from public._search_books(q) b join public.search_catalog c on c.id = b.id
  where (p_genre is null or exists (select 1 from unnest(c.genres) x where lower(x) = lower(public._genre_name(p_genre))))
    and public._in_bands(c.price_credits, p_length_bands);
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'avatar_url', a.avatar_url,
      'books', a.books) order by a.score desc, a.name), '[]')
  into v_authors from public._search_authors(q) a;
  select coalesce(jsonb_agg(jsonb_build_object('id', cl.id, 'name', cl.name, 'members', cl.members)
      order by cl.score desc, cl.members desc, cl.name), '[]')
  into v_clubs from public._search_clubs(q) cl;
  return jsonb_build_object('query', q,
    'top', case when jsonb_array_length(v_books) > 0 and not (v_books -> 0 ->> 'coming_soon')::boolean
                then v_books -> 0 end,
    'books', case when p_scope in ('all', 'books') then v_books else '[]'::jsonb end,
    'authors', case when p_scope in ('all', 'authors') then v_authors else '[]'::jsonb end,
    'clubs', case when p_scope in ('all', 'clubs') then v_clubs else '[]'::jsonb end,
    'counts', jsonb_build_object(
      'all', jsonb_array_length(v_books) + jsonb_array_length(v_authors) + jsonb_array_length(v_clubs),
      'books', jsonb_array_length(v_books), 'authors', jsonb_array_length(v_authors),
      'clubs', jsonb_array_length(v_clubs)));
end $$;

revoke all on function public._book_json(public.search_catalog) from public, anon, authenticated, service_role;

-- ─── 02-12: link every request for a query to a book ───────────────────────────────────────────
-- Search tuning works on queries, so staff link the query: every open or wishlisted request for it
-- moves to linked. If the book is already live the requesters are told at once; otherwise the
-- publish trigger tells them.
create function public.link_book_request_query(p_query text, p_book uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_n int;
begin
  if not (public.has_permission('search_tuning') or public.has_permission('curate_discover')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.books where id = p_book
                 and status in ('draft', 'live', 'scheduled')) then
    raise exception 'unknown book' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(id), '{}') into v_ids from public.book_requests
  where query_norm = public.norm_query(p_query) and status in ('open', 'wishlist');
  update public.book_requests set status = 'linked', book_id = p_book where id = any (v_ids);
  get diagnostics v_n = row_count;
  perform public.write_audit('discover', 'request.link', 'book', p_book::text, null, null, null,
    jsonb_build_object('query', public.norm_query(p_query), 'requests', v_n));
  if exists (select 1 from public.books where id = p_book and status = 'live') then
    perform public._fulfil_requests(p_book);
  end if;
  return v_n;
end $$;

revoke all on function public.link_book_request_query(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.link_book_request_query(text, uuid) to authenticated;
