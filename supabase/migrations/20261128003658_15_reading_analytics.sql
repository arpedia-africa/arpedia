-- Flow 15 · spec check 15-24 (rule 27): the Analytics Reading tab.
-- 1. reading_sessions gains `pages` (standard pages turned) and `offline` (read without a
--    connection), both optional: log_reading_session takes them as defaulted arguments, so the app
--    keeps working before it sends them. Until it does, both KPIs stay "-".
-- 2. staff_analytics_reading(p_from, p_to): pages per session, offline share, highlights,
--    paragraph discussions, how far readers get, highlights and discussions per book, most
--    discussed paragraphs and reading room attendance. Aggregates only: no reader is named, and
--    groups under 5 readers come back null ("Fewer than 5", rule 28).

alter table public.reading_sessions
  add column pages numeric(7, 2) check (pages >= 0 and pages <= 5000),
  add column offline boolean;

drop function public.log_reading_session(uuid, uuid, uuid, timestamptz, timestamptz, integer);
create function public.log_reading_session(p_client_id uuid, p_book uuid, p_device_id uuid,
  p_started_at timestamptz, p_ended_at timestamptz, p_active_seconds integer,
  p_pages numeric default null, p_offline boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reading_sessions (client_id, user_id, book_id, device_id, started_at, ended_at, active_seconds,
                                       pages, offline)
  values (p_client_id, public._uid(), p_book, p_device_id, p_started_at, least(p_ended_at, now()),
    least(greatest(p_active_seconds, 0),
          greatest(extract(epoch from least(p_ended_at, now()) - p_started_at)::int, 0)),
    case when p_pages is not null then least(greatest(round(p_pages, 2), 0), 5000) end, p_offline)
  on conflict (user_id, client_id) do update set ended_at = excluded.ended_at,
    active_seconds = excluded.active_seconds,
    pages = coalesce(excluded.pages, public.reading_sessions.pages),
    offline = coalesce(excluded.offline, public.reading_sessions.offline);
end $$;
revoke all on function public.log_reading_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, numeric, boolean)
  from public, anon, service_role;
grant execute on function public.log_reading_session(uuid, uuid, uuid, timestamptz, timestamptz, integer, numeric, boolean)
  to authenticated;

create function public.staff_analytics_reading(p_from date, p_to date, p_limit int default 5) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_len int := p_to - p_from + 1;
  v_prev_from date := p_from - (p_to - p_from + 1);
  v_kpis jsonb;
  v_far jsonb;
  v_books jsonb;
  v_paras jsonb;
  v_rooms jsonb;
  v_lim int := greatest(1, least(coalesce(p_limit, 5), 20));
begin
  perform public._insights_guard(p_from, p_to);

  -- Key numbers. Sessions of 30 seconds or more, as on Overview.
  with s as (
    select (r.started_at at time zone 'Africa/Lagos')::date >= p_from cur, r.pages, r.offline, r.active_seconds
    from public.reading_sessions r
    where (r.started_at at time zone 'Africa/Lagos')::date between v_prev_from and p_to and r.active_seconds >= 30
  ), pg as (
    select avg(pages) filter (where cur) now_avg, avg(pages) filter (where not cur) prev_avg,
           count(pages) filter (where cur) now_n, count(pages) filter (where not cur) prev_n,
           sum(active_seconds) filter (where cur and offline) off_s,
           sum(active_seconds) filter (where cur and offline is not null) known_s
    from s
  ), h as (
    select count(*) n from public.annotations a
    where a.kind = 'highlight' and a.deleted_at is null
      and (a.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
  ), f as (
    select count(*) n from public.reading_progress p
    where p.finished_at is not null and (p.finished_at at time zone 'Africa/Lagos')::date between p_from and p_to
  ), d as (
    select count(*) n, count(distinct c.user_id) readers from public.passage_comments c
    where c.status = 'visible' and (c.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
  )
  select jsonb_build_object(
      'pages_per_session', case when pg.now_n >= 5 then round(pg.now_avg, 1) end,
      'pages_per_session_prev', case when pg.prev_n >= 5 then round(pg.prev_avg, 1) end,
      'offline_share', case when pg.known_s > 0 then round(100.0 * coalesce(pg.off_s, 0) / pg.known_s, 1) end,
      'highlights', h.n,
      'highlights_per_finished', case when f.n >= 5 then round(h.n::numeric / f.n, 1) end,
      'discussions', d.n,
      'discussion_readers', public._small(d.readers))
    into v_kpis from pg, h, f, d;

  -- How far readers get: furthest point of every reader who unlocked a book and opened it in the period.
  with r as (
    select p.max_percent, p.finished_at is not null or p.max_percent >= 99.5 done,
           coalesce(rv.pages, 0) pages
    from public.reading_progress p
    join public.books b on b.id = p.book_id
    left join public.book_revisions rv on rv.id = b.current_revision_id
    where (p.last_opened_at at time zone 'Africa/Lagos')::date between p_from and p_to
      and exists (select 1 from public.entitlements e where e.user_id = p.user_id and e.book_id = p.book_id
                  and e.source in ('unlock_all', 'chapter') and e.revoked_at is null)
  ), bands (ord, label) as (
    values (1, 'Under 25%'), (2, '25 to 50%'), (3, '50 to 75%'), (4, '75 to 99%'), (5, 'Finished')
  ), banded as (
    select case when done then 5 when max_percent < 25 then 1 when max_percent < 50 then 2
                when max_percent < 75 then 3 else 4 end ord, max_percent, done, pages
    from r
  ), lengths (ord, label, lo, hi) as (
    values (1, 'under 150 pages', 0, 150), (2, '150 to 300 pages', 150, 300), (3, 'over 300 pages', 300, 2147483647)
  ), tot as (select count(*) n from banded)
  select jsonb_build_object(
      'readers', tot.n,
      'bands', case when tot.n >= 5 then (
        select jsonb_agg(jsonb_build_object('label', b.label,
                 'share', round(100.0 * (select count(*) from banded x where x.ord = b.ord) / tot.n, 1)) order by b.ord)
        from bands b) end,
      'by_length', (
        select jsonb_agg(jsonb_build_object('label', l.label,
                 'avg', (select case when count(*) >= 5 then round(avg(case when x.done then 100 else x.max_percent end), 1) end
                         from banded x where x.pages >= l.lo and x.pages < l.hi)) order by l.ord)
        from lengths l))
    into v_far from tot;

  -- Highlights and discussions per book (top by highlights, then discussions). A discussion is a
  -- paragraph readers commented on; replies are the comments after the first on it.
  with hl as (
    select a.book_id, count(*) n from public.annotations a
    where a.kind = 'highlight' and a.deleted_at is null
      and (a.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
    group by 1
  ), dc as (
    select c.book_id, count(*) n, count(distinct c.para_id) paras, count(distinct c.user_id) readers
    from public.passage_comments c
    where c.status = 'visible' and (c.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
    group by 1
  ), off as (
    select r.book_id, sum(r.active_seconds) filter (where r.offline) off_s,
           sum(r.active_seconds) filter (where r.offline is not null) known_s
    from public.reading_sessions r
    where (r.started_at at time zone 'Africa/Lagos')::date between p_from and p_to
    group by 1
  ), ranked as (
    select b.id, b.title, coalesce(nullif(pr.full_name, ''), 'Unknown author') author,
           coalesce(hl.n, 0) highlights, coalesce(dc.paras, 0) discussions, coalesce(dc.n - dc.paras, 0) replies,
           case when off.known_s > 0 then round(100.0 * coalesce(off.off_s, 0) / off.known_s, 1) end offline
    from public.books b
    join public.profiles pr on pr.id = b.author_id
    left join hl on hl.book_id = b.id
    left join dc on dc.book_id = b.id
    left join off on off.book_id = b.id
    where coalesce(hl.n, 0) + coalesce(dc.n, 0) > 0
    order by coalesce(hl.n, 0) desc, coalesce(dc.n, 0) desc, b.title
    limit v_lim
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'author', k.author,
           'highlights', k.highlights, 'discussions', k.discussions, 'replies', k.replies, 'offline', k.offline)
           order by k.highlights desc, k.discussions desc, k.title), '[]'::jsonb)
    into v_books from ranked k;

  -- Most discussed paragraphs: 5 or more readers commented in the period. The text is the book's own
  -- (the passage quote readers commented on), never a comment.
  with p as (
    select c.book_id, c.para_id, count(*) comments, count(distinct c.user_id) readers,
           mode() within group (order by c.quote) filter (where c.quote is not null) quote
    from public.passage_comments c
    where c.status = 'visible' and (c.created_at at time zone 'Africa/Lagos')::date between p_from and p_to
    group by 1, 2
    having count(distinct c.user_id) >= 5
    order by count(*) desc, c.book_id, c.para_id
    limit 3
  )
  select coalesce(jsonb_agg(jsonb_build_object('book_id', p.book_id, 'title', b.title, 'quote', p.quote,
           'chapter', (select ch.ord + 1 from public.paragraph_anchors pa
                       join public.chapters ch on ch.revision_id = pa.revision_id and ch.chapter_uid = pa.chapter_uid
                       where pa.revision_id = b.current_revision_id and pa.para_id = p.para_id limit 1),
           'comments', p.comments,
           'highlights', (select count(*) from public.annotations a where a.book_id = p.book_id and a.kind = 'highlight'
                          and a.deleted_at is null and a.start_para_id = p.para_id))
           order by p.comments desc), '[]'::jsonb)
    into v_paras from p join public.books b on b.id = p.book_id;

  -- Reading rooms held (started) in the period. Stayed to the end: still a member and seen in the
  -- room's last 10 minutes. Unlocks after: members who unlocked the room's book within 7 days.
  with rm as (
    select r.group_id, g.name, r.starts_at, r.ended_at, r.book_id
    from public.reading_rooms r join public.groups g on g.id = r.group_id
    where (r.starts_at at time zone 'Africa/Lagos')::date between p_from and p_to and r.starts_at <= now()
  ), st as (
    select rm.group_id,
           count(m.user_id) joined,
           count(m.user_id) filter (where rm.ended_at is not null and m.banned_at is null
                                     and m.last_seen_at >= rm.ended_at - interval '10 minutes') stayed,
           (select count(*) from public.messages x where x.group_id = rm.group_id and x.kind <> 'system') messages,
           (select count(distinct e.user_id) from public.entitlements e
            join public.group_members gm on gm.group_id = rm.group_id and gm.user_id = e.user_id
            where e.book_id = rm.book_id and e.source in ('unlock_all', 'chapter')
              and e.created_at >= rm.starts_at and e.created_at < rm.starts_at + interval '7 days') unlocks
    from rm left join public.group_members m on m.group_id = rm.group_id
    group by rm.group_id, rm.ended_at, rm.starts_at, rm.book_id
  )
  select jsonb_build_object(
      'stayed_pct', case when sum(st.joined) filter (where rm.ended_at is not null) >= 5
                         then round(100.0 * sum(st.stayed) / sum(st.joined) filter (where rm.ended_at is not null), 0) end,
      'rows', coalesce((select jsonb_agg(x order by x ->> 'held' desc) from (
          select jsonb_build_object('id', rm2.group_id, 'name', rm2.name, 'held', rm2.starts_at,
                   'joined', public._small(st2.joined),
                   'stayed_pct', case when rm2.ended_at is not null and st2.joined >= 5
                                      then round(100.0 * st2.stayed / st2.joined, 0) end,
                   'messages', st2.messages, 'unlocks', public._small(st2.unlocks)) x
          from rm rm2 join st st2 on st2.group_id = rm2.group_id
          order by rm2.starts_at desc limit v_lim) y), '[]'::jsonb))
    into v_rooms from rm join st on st.group_id = rm.group_id;

  return jsonb_build_object('days', v_len, 'kpis', v_kpis, 'how_far', v_far, 'books', v_books,
                            'paragraphs', v_paras, 'rooms', coalesce(v_rooms, jsonb_build_object('rows', '[]'::jsonb)));
end $$;

revoke all on function public.staff_analytics_reading(date, date, int) from public, anon, service_role;
grant execute on function public.staff_analytics_reading(date, date, int) to authenticated;
