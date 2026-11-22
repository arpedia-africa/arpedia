-- Flow 05 · Library (docs/prd/05-library.md): saved books, the grid/list choice, the reader's own
-- library rows (view library_items) and one RPC that reads a shelf with its counts.
-- Offline is device-only (files on the phone) and never comes from here.

-- ─── saved_books (rule 3) ───────────────────────────────────────────────────
create table public.saved_books (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- An owned book the reader never opened sits in Saved; "Remove from Saved" hides it there without
-- touching the entitlement (rule 23). Opening it moves it to Reading either way.
create table public.library_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- ─── profiles.library_view (rule 8) ─────────────────────────────────────────
alter table public.profiles
  add column library_view text not null default 'grid' check (library_view in ('grid', 'list'));

-- ─── library_items: the caller's own rows (security invoker) ────────────────
-- One row per book with progress, a save, or an active entitlement. Only reader-owned facts live
-- here (every table under it is owner-only); catalogue fields (title, author, cover, price) are
-- added by get_library, which also shows books that are no longer live to readers who kept access.
create view public.library_items with (security_invoker) as
  with mine as (
    select book_id from public.reading_progress where user_id = (select auth.uid())
    union
    select book_id from public.saved_books where user_id = (select auth.uid())
    union
    select book_id from public.entitlements where user_id = (select auth.uid()) and revoked_at is null
  )
  select
    m.book_id,
    rp.book_id is not null and rp.finished_at is null and rp.max_percent > 0 as reading,
    rp.finished_at is not null as finished,
    sb.book_id is not null as saved_row,
    exists (select 1 from public.entitlements e
            where e.user_id = (select auth.uid()) and e.book_id = m.book_id
              and e.scope = 'book' and e.revoked_at is null) as owns_book,
    rp.book_id is not null as opened,
    lh.book_id is not null as hidden,
    coalesce(rp.percent, 0) as percent,
    coalesce(rp.max_percent, 0) as max_percent,
    rp.chapter_uid,
    rp.revision_id,
    rp.last_opened_at,
    rp.finished_at,
    sb.created_at as saved_at,
    (select x.stars from public.reviews x where x.book_id = m.book_id and x.user_id = (select auth.uid()))
      as my_stars,
    (select g.sender_id from public.gifts g
     where g.book_id = m.book_id and g.recipient_id = (select auth.uid())
     order by g.created_at desc limit 1) as gift_from_id
  from mine m
  left join public.reading_progress rp on rp.user_id = (select auth.uid()) and rp.book_id = m.book_id
  left join public.saved_books sb on sb.user_id = (select auth.uid()) and sb.book_id = m.book_id
  left join public.library_hidden lh on lh.user_id = (select auth.uid()) and lh.book_id = m.book_id;

-- ─── get_library (Server) ───────────────────────────────────────────────────
-- Shelf rules 2–4: Reading = progress, not finished, max_percent > 0. Finished = finished_at.
-- Saved = a save, plus owned books never opened (unless hidden). Counts are computed per call.
-- Sorts: last_opened (default), title, progress; Finished sorts by finish date unless title or
-- progress is chosen. Keyset cursor {k, id} over a text sort key that orders like the real one.
create function public.get_library(p_shelf text, p_sort text default 'last_opened',
  p_after jsonb default null, p_limit integer default 24) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_sort text := coalesce(p_sort, 'last_opened');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_desc boolean;
  v_items jsonb;
  v_next jsonb;
  v_counts jsonb;
begin
  if v_user is null then perform public._raise('signed_out'); end if;
  if p_shelf not in ('reading', 'saved', 'finished') then perform public._raise('bad_shelf'); end if;
  if v_sort not in ('last_opened', 'title', 'progress') then perform public._raise('bad_sort'); end if;
  v_desc := v_sort <> 'title';

  with lib as (
  select li.book_id,
    case
      when v_sort = 'title' then lower(b.title)
      when v_sort = 'progress' then lpad((round(li.percent * 100))::bigint::text, 6, '0')
      when p_shelf = 'finished' then to_char(li.finished_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS')
      when p_shelf = 'saved' then to_char(coalesce(li.last_opened_at, li.saved_at, e.created_at, b.created_at)
                                            at time zone 'UTC', 'YYYYMMDDHH24MISSUS')
      else to_char(li.last_opened_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS')
    end as k,
    jsonb_build_object(
      'book_id', b.id,
      'title', b.title,
      'author_name', ap.full_name,
      'cover_key', r.cover_key,
      'percent', li.percent,
      'max_percent', li.max_percent,
      'chapter_uid', li.chapter_uid,
      'chapter_ord', (select count(*) from public.chapters c2
                      where c2.revision_id = r.id
                        and c2.ord <= (select c1.ord from public.chapters c1
                                       where c1.revision_id = r.id and c1.chapter_uid = li.chapter_uid)),
      'chapters_total', (select count(*) from public.chapters c3 where c3.revision_id = r.id),
      'pages', r.pages,
      'last_opened_at', li.last_opened_at,
      'finished_at', li.finished_at,
      'owns_book', li.owns_book,
      'paid_credits', paid.v,
      'price_credits', ef.effective_price,
      'remaining_credits', case when li.owns_book then 0 else public._remaining(v_user, b.id) end,
      'preview_percent', ef.effective_preview_percent,
      'preview_ended', not li.owns_book and paid.v = 0 and li.opened
                       and li.max_percent >= ef.effective_preview_percent - 0.05,
      'coming_soon_at', case when b.status = 'scheduled' then
                          (select min(s.schedule_at) from public.book_revisions s
                           where s.book_id = b.id and s.status = 'scheduled') end,
      'gift_from_name', gp.full_name,
      'my_stars', li.my_stars,
      'words_left', greatest(round(coalesce(r.words, 0) * (1 - li.percent / 100.0)), 0)::int,
      'unpublished', b.status not in ('live', 'scheduled'),
      'shelves', jsonb_build_object('reading', li.reading, 'finished', li.finished,
        'saved', (li.saved_row or (li.owns_book and not li.opened and not li.hidden)))) as item,
    li.reading,
    (li.saved_row or (li.owns_book and not li.opened and not li.hidden)) as saved,
    li.finished
  from public.library_items li
  join public.books b on b.id = li.book_id
  join public.profiles ap on ap.id = b.author_id
  left join public.book_revisions r on r.id = coalesce(b.current_revision_id, li.revision_id)
  left join public.book_effective ef on ef.book_id = b.id
  left join public.profiles gp on gp.id = li.gift_from_id
  left join lateral (select e.created_at from public.entitlements e
                     where e.user_id = v_user and e.book_id = b.id and e.scope = 'book'
                       and e.revoked_at is null limit 1) e on true
  cross join lateral (select public._chapter_paid(v_user, b.id) as v) paid
  -- An unpublished book stays only for readers who kept access (owned or started); never as a bare save.
  where b.status in ('live', 'scheduled') or li.owns_book or li.opened
  ), page as (
    select l.* from lib l
    where case p_shelf when 'reading' then l.reading when 'saved' then l.saved else l.finished end
      and l.k is not null
      and (p_after is null
           or (v_desc and (l.k, l.book_id) < (p_after->>'k', (p_after->>'id')::uuid))
           or (not v_desc and (l.k, l.book_id) > (p_after->>'k', (p_after->>'id')::uuid)))
    order by
      case when v_desc then l.k end desc, case when v_desc then l.book_id end desc,
      case when not v_desc then l.k end asc, case when not v_desc then l.book_id end asc
    limit v_limit + 1
  ), numbered as (
    select p.*, row_number() over (
      order by case when v_desc then p.k end desc, case when v_desc then p.book_id end desc,
               case when not v_desc then p.k end asc, case when not v_desc then p.book_id end asc) as n
    from page p
  )
  select
    (select coalesce(jsonb_agg(x.item order by x.n), '[]') from numbered x where x.n <= v_limit),
    (select jsonb_build_object('k', x.k, 'id', x.book_id) from numbered x
     where x.n = v_limit and exists (select 1 from numbered y where y.n = v_limit + 1)),
    (select jsonb_build_object(
       'reading', count(*) filter (where l.reading),
       'saved', count(*) filter (where l.saved),
       'finished', count(*) filter (where l.finished)) from lib l)
  into v_items, v_next, v_counts;

  return jsonb_build_object('items', v_items, 'counts', v_counts, 'next', v_next);
end $$;

-- ─── save_book / unsave_book / set_library_view (Server) ───────────────────
create function public.save_book(p_book uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
begin
  if v_user is null then perform public._raise('signed_out'); end if;
  -- Unpublished books can't be saved (edge cases); live and coming-soon books can.
  if not exists (select 1 from public.books where id = p_book and status in ('live', 'scheduled')) then
    perform public._raise('not_available');
  end if;
  insert into public.saved_books (user_id, book_id) values (v_user, p_book) on conflict do nothing;
  delete from public.library_hidden where user_id = v_user and book_id = p_book;
end $$;

create function public.unsave_book(p_book uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
begin
  if v_user is null then perform public._raise('signed_out'); end if;
  delete from public.saved_books where user_id = v_user and book_id = p_book;
  -- Saved only because it is owned and unopened: hide it there, keep the entitlement (rule 23).
  if public._owns_book(v_user, p_book)
     and not exists (select 1 from public.reading_progress where user_id = v_user and book_id = p_book) then
    insert into public.library_hidden (user_id, book_id) values (v_user, p_book) on conflict do nothing;
  end if;
end $$;

create function public.set_library_view(p_view text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
begin
  if v_user is null then perform public._raise('signed_out'); end if;
  if p_view not in ('grid', 'list') then perform public._raise('bad_view'); end if;
  update public.profiles set library_view = p_view where id = v_user;
end $$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.saved_books enable row level security;
alter table public.library_hidden enable row level security;

-- Owner only; staff don't browse readers' libraries (Admin side: none).
create policy saved_books_select on public.saved_books for select to authenticated
  using (user_id = (select auth.uid()));
create policy library_hidden_select on public.library_hidden for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on public.saved_books, public.library_hidden, public.library_items from anon, authenticated;
grant select on public.saved_books, public.library_hidden, public.library_items to authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('get_library', 'save_book', 'unsave_book', 'set_library_view')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

grant execute on function
  public.get_library(text, text, jsonb, integer),
  public.save_book(uuid),
  public.unsave_book(uuid),
  public.set_library_view(text)
  to authenticated;
