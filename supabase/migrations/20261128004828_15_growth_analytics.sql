-- Flow 15 · spec check 15-23 (rule 26): the Analytics Growth tab's retention, churn and promo numbers.
-- staff_analytics_growth(p_from, p_to) returns
--   cohorts     the last 6 sign-up weeks (Monday, Lagos) up to p_to: readers who signed up, and how
--               many came back (a reading session of 30 seconds or more) on day 1, 7 and 30. The
--               admin page decides which cells are ready (core `cohortCell`).
--   churn       subscriptions live when the 30 days to p_to began, how many ended (expired or
--               refunded) in them, by plan, with the main reason; the same for the 30 days before.
--   promos      codes redeemed in the period: readers who redeemed, and how many paid after.
-- Counts only; no reader is named. Groups under 5 come back null (rule 28).

create function public.staff_analytics_growth(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_last_week date := date_trunc('week', p_to)::date;
  v_cohorts jsonb;
  v_churn jsonb;
  v_promos jsonb;
begin
  perform public._insights_guard(p_from, p_to);

  with weeks as (
    select (v_last_week - 7 * g)::date wk from generate_series(0, 5) g
  ), joined as (
    select p.id, (p.created_at at time zone 'Africa/Lagos')::date d
    from public.profiles p
    where (p.created_at at time zone 'Africa/Lagos')::date between v_last_week - 35 and v_last_week + 6
      and not exists (select 1 from public.staff_roles s where s.user_id = p.id)
  ), back as (
    select j.id, j.d,
           bool_or(r.back_day = j.d + 1) d1, bool_or(r.back_day = j.d + 7) d7, bool_or(r.back_day = j.d + 30) d30
    from joined j
    join lateral (select distinct (s.started_at at time zone 'Africa/Lagos')::date as back_day
                  from public.reading_sessions s
                  where s.user_id = j.id and s.active_seconds >= 30
                    and (s.started_at at time zone 'Africa/Lagos')::date in (j.d + 1, j.d + 7, j.d + 30)) r on true
    group by j.id, j.d
  )
  select jsonb_agg(jsonb_build_object(
           'week', w.wk,
           'size', (select count(*) from joined j where j.d between w.wk and w.wk + 6),
           'd1', (select count(*) from back b where b.d between w.wk and w.wk + 6 and b.d1),
           'd7', (select count(*) from back b where b.d between w.wk and w.wk + 6 and b.d7),
           'd30', (select count(*) from back b where b.d between w.wk and w.wk + 6 and b.d30))
         order by w.wk)
    into v_cohorts from weeks w;

  with win (k, s, e) as (
    values ('now', p_to - 29, p_to), ('prev', p_to - 59, p_to - 30)
  ), subs as (
    select w.k, s.plan_code, s.status, s.user_id, s.ended_at,
           s.ended_at is not null and s.status in ('expired', 'refunded')
             and (s.ended_at at time zone 'Africa/Lagos')::date between w.s and w.e left_in
    from win w
    join public.subscriptions s
      on (s.created_at at time zone 'Africa/Lagos')::date < w.s
     and (s.ended_at is null or (s.ended_at at time zone 'Africa/Lagos')::date >= w.s)
  ), why as (
    select k, plan_code,
           case when status = 'refunded' then 'Refunded'
                when exists (select 1 from public.payment_events e
                             where e.normalized ->> 'user_id' = subs.user_id::text
                               and e.normalized ->> 'type' = 'billing_issue'
                               and e.occurred_at between subs.ended_at - interval '40 days' and subs.ended_at)
                  then 'Payment declined'
                else 'Chose not to renew' end reason
    from subs where left_in
  ), per as (
    select s.k, s.plan_code, count(*) subscribers, count(*) filter (where s.left_in) left_n
    from subs s group by 1, 2
  )
  select jsonb_build_object(
      'rate', (select case when sum(subscribers) >= 5 then round(100.0 * sum(left_n) / sum(subscribers), 1) end
               from per where k = 'now'),
      'previous', (select case when sum(subscribers) >= 5 then round(100.0 * sum(left_n) / sum(subscribers), 1) end
                   from per where k = 'prev'),
      'plans', coalesce((select jsonb_agg(jsonb_build_object(
                 'plan', coalesce(pl.name, per.plan_code),
                 'subscribers', public._small(per.subscribers),
                 'left', per.left_n,
                 'rate', case when per.subscribers >= 5 then round(100.0 * per.left_n / per.subscribers, 1) end,
                 'reason', (select w.reason from why w where w.k = 'now' and w.plan_code = per.plan_code
                            group by w.reason order by count(*) desc, w.reason limit 1))
               order by per.subscribers desc, per.plan_code)
               from per left join public.plans pl on pl.code = per.plan_code where per.k = 'now'), '[]'::jsonb))
    into v_churn;

  with r as (
    select pr.code, pr.user_id, min(pr.redeemed_at) first_at
    from public.promo_redemptions pr
    where (pr.redeemed_at at time zone 'Africa/Lagos')::date between p_from and p_to
    group by 1, 2
  ), per as (
    select r.code, count(*) started,
           count(*) filter (where exists (
             select 1 from public.transactions t
             where t.user_id = r.user_id and t.status = 'succeeded' and t.created_at > r.first_at)) paid
    from r group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', upper(per.code), 'kind', c.kind, 'amount', c.amount,
           'started', public._small(per.started),
           'paid', case when per.started >= 5 then per.paid end,
           'rate', case when per.started >= 5 then round(100.0 * per.paid / per.started, 1) end)
           order by per.started desc, per.code), '[]'::jsonb)
    into v_promos
    from per join public.promo_codes c on c.code = per.code;

  return jsonb_build_object('today', v_today, 'cohorts', v_cohorts, 'churn', v_churn, 'promos', v_promos);
end $$;

revoke all on function public.staff_analytics_growth(date, date) from public, anon, service_role;
grant execute on function public.staff_analytics_growth(date, date) to authenticated;
