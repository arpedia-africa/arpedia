-- Flow 08 rule 6 / spec check 08-11 (server half): a "From authors you follow" Home section.
-- New `home_sections` key `following` (automatic): the newest live books by authors the reader
-- follows, at most `max_items`. Placed after "Recommended for you", before "Browse genres". Staff
-- reorder or hide it in Discover curation like any other section. The app draws it with its
-- existing book rail; it is hidden when empty (no follows, or followed authors have no live book).

alter table public.home_sections drop constraint home_sections_key_check;
alter table public.home_sections add constraint home_sections_key_check check (key in ('trending', 'authors',
  'new_arrivals', 'top10', 'recommended', 'coming_soon', 'genres', 'following'));

-- Make room after Recommended (or at the end if staff removed it), then insert once.
do $$
declare
  v_pos int;
begin
  if exists (select 1 from public.home_sections where key = 'following') then return; end if;
  select coalesce((select position + 1 from public.home_sections where key = 'recommended'),
                  (select coalesce(max(position), 0) + 1 from public.home_sections))
  into v_pos;
  update public.home_sections set position = position + 1 where position >= v_pos;
  insert into public.home_sections (key, title, kind, position, visible, config)
  values ('following', 'From authors you follow', 'automatic', v_pos, true, '{"max_items":10}');
end $$;

create or replace function public._section_items(h public.home_sections, p_uid uuid) returns jsonb
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
  elsif h.key = 'following' then
    -- Newest first; staff exclusions in shelf_items apply as on the other automatic sections.
    select coalesce(jsonb_agg(f.j order by f.published_at desc, f.id), '[]') into v
    from (
      select public._book_json(c) as j, c.published_at, c.id
      from public.follows fo
      join public.catalog_books c on c.author_id = fo.followee_id
      where fo.follower_id = p_uid
        and not exists (select 1 from public.shelf_items s where s.section_id = h.id and s.item_type = 'book'
                          and s.item_id = c.id and s.excluded)
      order by c.published_at desc, c.id
      limit v_max
    ) f;
  end if;
  return coalesce(v, '[]');
end $$;
