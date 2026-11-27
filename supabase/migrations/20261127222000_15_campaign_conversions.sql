-- 15-17: campaign `counts.conversions` was never computed, so the Conversions column was always 0.
-- Rule 20: a conversion is an unlock, a club or room join, a return to reading or a follow within
-- 24 hours of the push; a reader who got two pushes inside 24 hours counts for the later one only.
-- The api Worker refreshes the count for campaigns sent in the last 2 days (24 hours plus margin).

-- Readers of one campaign who did something within their window: from the push (delivered, else
-- sent) to 24 hours later, or to their next marketing push if that came first.
create function public._campaign_conversions(p_campaign uuid) returns integer
language sql stable security definer set search_path = '' as $$
  with w as (
    select l.user_id, coalesce(l.delivered_at, l.sent_at) as t0,
      least(coalesce(l.delivered_at, l.sent_at) + interval '24 hours',
            coalesce((select min(coalesce(n.delivered_at, n.sent_at)) from public.push_log n
                      where n.user_id = l.user_id and n.id <> l.id and n.category = 'marketing'
                        and n.status in ('sent', 'delivered', 'opened')
                        and coalesce(n.delivered_at, n.sent_at) > coalesce(l.delivered_at, l.sent_at)),
                     'infinity'::timestamptz)) as t1
    from public.push_log l
    where l.campaign_id = p_campaign and l.status in ('sent', 'delivered', 'opened')
      and coalesce(l.delivered_at, l.sent_at) is not null
  )
  select count(distinct w.user_id)::int from w
  where exists (select 1 from public.credit_ledger c where c.user_id = w.user_id and c.delta < 0
                  and c.reason in ('unlock_all', 'chapter') and c.created_at >= w.t0 and c.created_at < w.t1)
     or exists (select 1 from public.group_members g where g.user_id = w.user_id
                  and g.joined_at >= w.t0 and g.joined_at < w.t1)
     or exists (select 1 from public.follows f where f.follower_id = w.user_id
                  and f.created_at >= w.t0 and f.created_at < w.t1)
     or exists (select 1 from public.reading_sessions r where r.user_id = w.user_id
                  and r.started_at >= w.t0 and r.started_at < w.t1)
$$;

-- Worker (service key): refresh conversions of recently sent campaigns; returns how many it updated.
create function public.refresh_campaign_conversions() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v int;
begin
  perform public._require_service('refresh_campaign_conversions');
  update public.campaigns c
  set counts = c.counts || jsonb_build_object('conversions', public._campaign_conversions(c.id))
  where c.status = 'sent' and c.sent_at > now() - interval '2 days';
  get diagnostics v = row_count;
  return v;
end $$;

revoke all on function public._campaign_conversions(uuid), public.refresh_campaign_conversions()
  from public, anon, authenticated, service_role;
grant execute on function public.refresh_campaign_conversions() to service_role;
