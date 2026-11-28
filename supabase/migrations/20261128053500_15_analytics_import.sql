-- Flow 15 · spec check 15-21 (rule 26; Server: analytics-import). Installs from the Google Play
-- Console export (OPEN-QUESTIONS 100) and signups by source from PostHog, written nightly by the
-- api Worker's analytics-import. Kept apart from analytics_daily, which analytics_rollup rebuilds
-- from the database every hour and would wipe. Aggregates only: no reader is named.

create table public.analytics_imports (
  day date not null,
  metric text not null check (metric in ('installs', 'signups_by_source')),
  dim jsonb not null default '{}',
  value numeric not null check (value >= 0),
  source text not null check (source in ('play_console', 'posthog')),
  imported_at timestamptz not null default now(),
  primary key (day, metric, dim)
);
alter table public.analytics_imports enable row level security;
-- Read through staff_analytics_imports only; written through analytics_import_save only.
revoke all on public.analytics_imports from public, anon, authenticated;

-- The sources rule 26 names; anything else a reader came with is Unknown.
create function public.signup_sources() returns text[]
language sql immutable set search_path = '' as $$
  select array['play_search', 'book_link', 'church', 'instagram', 'author_code', 'unknown']
$$;
revoke all on function public.signup_sources() from public, anon, authenticated;

-- Replace one metric's days from p_from to p_to with p_rows [{day, dim, value}]: the stores restate
-- recent days, so a day is always the last import's number. Days with no row are cleared.
create function public.analytics_import_save(p_metric text, p_from date, p_to date, p_rows jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_source text := case p_metric when 'installs' then 'play_console' when 'signups_by_source' then 'posthog' end;
  n int;
begin
  if v_source is null then
    raise exception 'Unknown metric %', p_metric using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 100 then
    raise exception 'Pick at most 100 days' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be a list' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where r ->> 'day' is null or r ->> 'value' is null
       or (r ->> 'day')::date not between p_from and p_to
       or (r ->> 'value')::numeric < 0
       or (p_metric = 'installs' and coalesce(r -> 'dim', '{}') <> '{}')
       or (p_metric = 'signups_by_source'
           and (coalesce(r -> 'dim', '{}') - 'source' <> '{}'
                or not (coalesce(r -> 'dim' ->> 'source', '') = any (public.signup_sources()))))
  ) then
    raise exception 'A row is outside the days or not a known source' using errcode = '22023';
  end if;

  delete from public.analytics_imports where metric = p_metric and day between p_from and p_to;
  insert into public.analytics_imports (day, metric, dim, value, source)
  select (r ->> 'day')::date, p_metric, coalesce(r -> 'dim', '{}'), sum((r ->> 'value')::numeric), v_source
  from jsonb_array_elements(p_rows) r
  group by 1, 3;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.analytics_import_save(text, date, date, jsonb) from public, anon, authenticated;
grant execute on function public.analytics_import_save(text, date, date, jsonb) to service_role;

-- Growth tab (rule 26): installs in the period and the same length before, the last day the store
-- export covers, and signups by source. Null where nothing was imported; groups under 5 null.
create function public.staff_analytics_imports(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_len int := p_to - p_from + 1;
  v_sources jsonb;
begin
  perform public._insights_guard(p_from, p_to);

  with s as (
    select a.dim ->> 'source' src, sum(a.value) n
    from public.analytics_imports a
    where a.metric = 'signups_by_source' and a.day between p_from and p_to
    group by 1
  )
  select case when count(*) > 0 then jsonb_agg(jsonb_build_object(
           'source', s.src,
           'signups', public._small(s.n),
           'share', case when s.n >= 5 then round(100.0 * s.n / nullif((select sum(n) from s), 0), 1) end)
           order by s.n desc, array_position(public.signup_sources(), s.src)) end
    into v_sources from s;

  return jsonb_build_object(
    'installs', (select public._small(sum(a.value)) from public.analytics_imports a
                 where a.metric = 'installs' and a.day between p_from and p_to),
    'installs_previous', (select public._small(sum(a.value)) from public.analytics_imports a
                          where a.metric = 'installs' and a.day between p_from - v_len and p_from - 1),
    'installs_through', (select max(a.day) from public.analytics_imports a
                         where a.metric = 'installs' and a.day <= p_to),
    'sources', v_sources,
    'imported_at', (select max(a.imported_at) from public.analytics_imports a));
end $$;

revoke all on function public.staff_analytics_imports(date, date) from public, anon, service_role;
grant execute on function public.staff_analytics_imports(date, date) to authenticated;
