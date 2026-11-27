-- Flow 15 · spec check 15-22 (rule 25): the Analytics Overview numbers.
-- 1. analytics_rollup summed `reading_sessions.seconds`, a column that does not exist (it is
--    `active_seconds`), so every hourly and nightly rollup failed and nothing reached analytics_daily:
--    daily readers, reading hours and sessions were never filled. Same body, column fixed.
-- 2. New daily metrics: `mau`, `books_started`, `books_finished`.
-- 3. staff_analytics_books adds readers, finished % and rating per top book, and preview to unlock by
--    book length. Groups under 5 readers come back null ("Fewer than 5", rule 28).

create or replace function public.analytics_rollup(p_from date, p_to date) returns int
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
               count(distinct r.user_id) filter (where r.active_seconds >= 30) dau,
               round(sum(r.active_seconds) / 3600.0, 2) hours,
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
             round(sum(r.active_seconds) / 3600.0, 2)
      from public.reading_sessions r
      where (r.started_at at time zone 'Africa/Lagos')::date between $1 and $2
      group by 1, r.book_id
    $q$ using p_from, p_to;
    get diagnostics k = row_count; n := n + k;
    execute $q$
      insert into public.analytics_daily (day, metric, dim, value)
      select (r.started_at at time zone 'Africa/Lagos')::date, 'hour_hours',
             jsonb_build_object('hour', extract(hour from r.started_at at time zone 'Africa/Lagos')::int),
             round(sum(r.active_seconds) / 3600.0, 2)
      from public.reading_sessions r
      where (r.started_at at time zone 'Africa/Lagos')::date between $1 and $2
      group by 1, 3
    $q$ using p_from, p_to;
    get diagnostics k = row_count; n := n + k;
  end if;

  -- Overview (rule 25): monthly readers for each day (a 30-second session in the 30 days to it),
  -- books started (a reader's first 30-second session on a book) and books finished (95%).
  if to_regclass('public.reading_sessions') is not null then
    execute $q$
      insert into public.analytics_daily (day, metric, value)
      select d::date, 'mau', count(distinct r.user_id)
      from generate_series($1::date, $2::date, interval '1 day') d
      join public.reading_sessions r
        on (r.started_at at time zone 'Africa/Lagos')::date between d::date - 29 and d::date
       and r.active_seconds >= 30
      group by 1
    $q$ using p_from, p_to;
    get diagnostics k = row_count; n := n + k;
    execute $q$
      insert into public.analytics_daily (day, metric, value)
      select f.day, 'books_started', count(*)
      from (select r.user_id, r.book_id, min((r.started_at at time zone 'Africa/Lagos')::date) as day
            from public.reading_sessions r where r.active_seconds >= 30
            group by 1, 2) f
      where f.day between $1 and $2
      group by 1
    $q$ using p_from, p_to;
    get diagnostics k = row_count; n := n + k;
  end if;

  insert into public.analytics_daily (day, metric, value)
  select (p.finished_at at time zone 'Africa/Lagos')::date, 'books_finished', count(*)
  from public.reading_progress p
  where p.finished_at is not null and (p.finished_at at time zone 'Africa/Lagos')::date between p_from and p_to
  group by 1;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;

-- Top books (rule 25) with readers (30-second sessions in the period), finished % (of everyone who
-- has read it), rating; genre share; and preview to unlock: readers whose furthest point, opened in
-- the period, reached the end of the free preview of a priced book, and the share who unlocked it.
create or replace function public.staff_analytics_books(p_from date, p_to date, p_limit int default 6) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_top jsonb;
  v_genres jsonb;
  v_preview jsonb;
begin
  perform public._insights_guard(p_from, p_to);

  with hours as (
    select (a.dim ->> 'book_id')::uuid book_id, sum(a.value) hours
    from public.analytics_daily a
    where a.metric = 'book_hours' and a.day between p_from and p_to
    group by 1
  ), unlocks as (
    select e.book_id, count(*) n
    from public.entitlements e
    where e.source in ('unlock_all', 'chapter')
      and (e.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
    group by 1
  ), ranked as (
    select b.id, b.title, coalesce(nullif(pr.full_name, ''), 'Unknown author') author, b.genres[1] genre,
           coalesce(h.hours, 0) hours, coalesce(u.n, 0) unlocks
    from public.books b
    join public.profiles pr on pr.id = b.author_id
    left join hours h on h.book_id = b.id
    left join unlocks u on u.book_id = b.id
    where h.hours > 0 or u.n > 0
    order by coalesce(h.hours, 0) desc, coalesce(u.n, 0) desc, b.title
    limit greatest(1, least(p_limit, 50))
  ), stats as (
    select k.id,
           (select count(distinct r.user_id) from public.reading_sessions r
            where r.book_id = k.id and r.active_seconds >= 30
              and (r.started_at at time zone 'Africa/Lagos')::date between p_from and p_to) readers,
           (select count(*) from public.reading_progress p where p.book_id = k.id) started,
           (select count(*) from public.reading_progress p where p.book_id = k.id and p.finished_at is not null) finished,
           (select s.avg from public.book_rating_stats s where s.book_id = k.id and s.count > 0) rating
    from ranked k
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'author', k.author, 'genre', k.genre,
           'hours', k.hours, 'unlocks', k.unlocks,
           'readers', case when s.readers >= 5 then s.readers end,
           'finished_pct', case when s.started >= 5 then round(100.0 * s.finished / s.started, 1) end,
           'rating', round(s.rating, 1))
           order by k.hours desc, k.unlocks desc, k.title), '[]'::jsonb)
    into v_top from ranked k join stats s on s.id = k.id;

  with g as (
    select coalesce(b.genres[1], 'Other') genre, sum(a.value) hours
    from public.analytics_daily a
    join public.books b on b.id = (a.dim ->> 'book_id')::uuid
    where a.metric = 'book_hours' and a.day between p_from and p_to
    group by 1
  ), t as (select sum(hours) total from g)
  select coalesce(jsonb_agg(jsonb_build_object('genre', g.genre, 'share', round(100 * g.hours / t.total, 1))
           order by g.hours desc), '[]'::jsonb)
    into v_genres from g, t where t.total > 0;

  with reached as (
    select p.user_id, p.book_id, coalesce(r.pages, 0) pages,
           exists (select 1 from public.entitlements e where e.user_id = p.user_id and e.book_id = p.book_id
                   and e.source in ('unlock_all', 'chapter') and e.revoked_at is null) unlocked
    from public.reading_progress p
    join public.book_effective be on be.book_id = p.book_id
    left join public.book_revisions r on r.id = be.revision_id
    where coalesce(be.effective_price, 0) > 0 and p.max_percent >= be.effective_preview_percent
      and (p.last_opened_at at time zone 'Africa/Lagos')::date between p_from and p_to
  ), bands (ord, label, lo, hi) as (
    values (1, 'Under 150 pages', 0, 150), (2, '150 to 300 pages', 150, 300),
           (3, '300 to 450 pages', 300, 450), (4, 'Over 450 pages', 450, 2147483647)
  ), per as (
    select b.ord, b.label, count(r.user_id) n, count(r.user_id) filter (where r.unlocked) u
    from bands b left join reached r on r.pages >= b.lo and r.pages < b.hi
    group by b.ord, b.label
  ), tot as (
    select count(*) n, count(*) filter (where unlocked) u from reached
  )
  select jsonb_build_object(
      'readers', tot.n,
      'share', case when tot.n >= 5 then round(100.0 * tot.u / tot.n, 1) end,
      'bands', (select coalesce(jsonb_agg(jsonb_build_object('label', per.label,
                  'share', case when per.n >= 5 then round(100.0 * per.u / per.n, 1) end) order by per.ord), '[]'::jsonb)
                from per))
    into v_preview from tot;

  return jsonb_build_object('top', v_top, 'genres', v_genres, 'preview_unlock', v_preview);
end $$;
