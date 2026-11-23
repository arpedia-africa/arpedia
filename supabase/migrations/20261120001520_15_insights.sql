-- Flow 15 · Insights tabs (admin `analytics`, `analytics-growth`, `analytics-reading`).
-- Aggregates only, never personal rows; groups under 5 people come back null ("Fewer than 5", rule 28).

create function public._insights_guard(p_from date, p_to date) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_staff() and public.staff_mfa_ok() and public.has_permission('view_analytics')) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_to < p_from or p_to - p_from > 400 then
    raise exception 'Pick a shorter period' using errcode = '22023';
  end if;
end $$;

create function public._small(p numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case when p < 5 then null else p end
$$;

-- Growth: onboarding funnel of readers who signed up in the period (rule 26). Steps come from
-- flow 01's onboarding_step (the step the reader is on now); Subscribed reads flow 03/09's
-- subscriptions when it exists. Installs come from the store import (not built yet: null).
create function public.staff_analytics_funnel(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
  v_sub numeric;
begin
  perform public._insights_guard(p_from, p_to);
  select jsonb_build_object(
      'installed', null,
      'signed_up', public._small(count(*)),
      'interests', public._small(count(*) filter (where public.onboarding_step_ord(onboarding_step) > public.onboarding_step_ord('interests'))),
      'role', public._small(count(*) filter (where public.onboarding_step_ord(onboarding_step) > public.onboarding_step_ord('role'))),
      'profile', public._small(count(*) filter (where public.onboarding_step_ord(onboarding_step) > public.onboarding_step_ord('profile'))),
      'plans', public._small(count(*) filter (where public.onboarding_step_ord(onboarding_step) >= public.onboarding_step_ord('plans'))))
    into v
  from public.profiles p
  where p.deleted_at is null and not exists (select 1 from public.staff_roles s where s.user_id = p.id)
    and (p.created_at at time zone 'Africa/Lagos')::date between p_from and p_to;

  if to_regclass('public.subscriptions') is not null then
    execute $q$
      select count(distinct s.user_id) from public.subscriptions s
      join public.profiles p on p.id = s.user_id
      where (p.created_at at time zone 'Africa/Lagos')::date between $1 and $2
    $q$ into v_sub using p_from, p_to;
    v := v || jsonb_build_object('subscribed', public._small(v_sub));
  else
    v := v || jsonb_build_object('subscribed', null);
  end if;
  return v;
end $$;

-- Overview and Reading: per-book reading hours (from the book_hours rollup) and unlocks in the
-- period, with title, author and first genre; plus genre share of reading hours (rule 25).
create function public.staff_analytics_books(p_from date, p_to date, p_limit int default 6) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_top jsonb;
  v_genres jsonb;
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
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'author', author, 'genre', genre,
           'hours', hours, 'unlocks', unlocks)), '[]'::jsonb)
    into v_top from ranked;

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

  return jsonb_build_object('top', v_top, 'genres', v_genres);
end $$;

revoke execute on function public._insights_guard(date, date), public.staff_analytics_funnel(date, date),
  public.staff_analytics_books(date, date, int) from public, anon;
grant execute on function public.staff_analytics_funnel(date, date), public.staff_analytics_books(date, date, int)
  to authenticated;
