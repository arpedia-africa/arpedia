-- Flow 00 rule 13 and flow 16 rule 40 (spec check 00-8): the top-bar bell opens Staff alerts
-- (s-staff-alerts). Alerts are worked out from live state, one kind per My account switch, and each
-- kind only for roles that can already open its page:
--   high_severity_reports (moderate_reports, always on)  open high-severity reports, last 7 days
--   failed_payouts        (release_payouts)              failed transfers not retried, last 7 days
--   copyright_claims      (decide_claims)                new claims, last 14 days
--   applications_waiting  (approve_books)                applications past the 5-day promise
--   system_health         (manage_settings)              integrations not working
-- "New" means since the staff member last signed in and since they last pressed Mark all read.
create table public.staff_alert_reads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now()
);
alter table public.staff_alert_reads enable row level security;
create policy staff_alert_reads_select on public.staff_alert_reads for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.staff_alert_reads from anon, authenticated;
grant select on public.staff_alert_reads to authenticated;

create function public._staff_alert_on(p_uid uuid, p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_kind = 'high_severity_reports'
    or coalesce((select a.enabled from public.staff_alert_prefs a where a.user_id = p_uid and a.kind = p_kind), true)
$$;

create function public.get_staff_alerts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_since timestamptz;
  v_items jsonb;
begin
  if not (public.is_staff() and public.staff_mfa_ok()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  v_since := greatest(
    coalesce((select r.read_at from public.staff_alert_reads r where r.user_id = uid), '-infinity'),
    coalesce((select u.last_sign_in_at from auth.users u where u.id = uid), '-infinity'));

  with a as (
    -- Open high-severity reports.
    select 'high_severity_reports' as kind, r.created_at as at, 'err' as tone, '/reports/' || r.id as href,
      'High-severity report: ' || case r.reason
        when 'spam' then 'spam' when 'harassment' then 'harassment' when 'hate' then 'hate speech'
        when 'sexual' then 'sexual content' when 'violence' then 'threat or violence'
        when 'self_harm' then 'self-harm' when 'copyright' then 'copyright' when 'spoilers' then 'spoilers'
        when 'impersonation' then 'impersonation' else 'other' end
        || ' in ' || case r.content_type
        when 'message' then case g.kind when 'room' then 'a reading room' else 'a club chat' end
        when 'dm' then 'a direct message' when 'review' then 'a review'
        when 'discussion_comment' then 'a discussion' when 'post_comment' then 'a post comment'
        when 'author_post' then 'an author post' when 'profile' then 'a profile' else 'a book' end as title,
      coalesce(case g.kind when 'room' then 'Reading room "' || g.name || '"' when 'dm' then null else g.name end,
               b.title, r.ref) as detail
    from public.reports r
    left join public.groups g on g.id = r.group_id
    left join public.books b on b.id = r.book_id
    where r.severity = 'high' and r.status <> 'resolved' and r.created_at > now() - interval '7 days'
      and public.has_permission('moderate_reports') and public._staff_alert_on(uid, 'high_severity_reports')
    union all
    -- Failed transfers nobody has retried yet, as one line.
    select 'failed_payouts', max(coalesce(p.settled_at, p.sent_at, p.queued_at)), 'err', '/payouts',
      count(*) || case when count(*) = 1 then ' payout failed at Flutterwave' else ' payouts failed at Flutterwave' end,
      coalesce(mode() within group (order by p.failure_reason), 'Check the payout for the reason')
    from public.payouts p
    where p.status = 'failed' and coalesce(p.settled_at, p.sent_at, p.queued_at) > now() - interval '7 days'
      and not exists (select 1 from public.payouts n where n.retry_of = p.id)
      and public.has_permission('release_payouts') and public._staff_alert_on(uid, 'failed_payouts')
    having count(*) > 0
    union all
    -- New copyright claims.
    select 'copyright_claims', c.created_at, 'org', '/claims/' || c.id,
      'New copyright claim on ' || b.title, 'From ' || c.claimant_name
    from public.copyright_claims c join public.books b on b.id = c.book_id
    where c.status = 'new' and c.created_at > now() - interval '14 days'
      and public.has_permission('decide_claims') and public._staff_alert_on(uid, 'copyright_claims')
    union all
    -- Applications past the 5-day review promise, as one line; "new" from when the latest went late.
    select 'applications_waiting', max(x.submitted_at) + interval '5 days', 'org', '/applications',
      count(*) || case when count(*) = 1 then ' author application is past 5 days'
                       else ' author applications are past 5 days' end,
      case when count(x.assigned_to) = 0 then 'Assigned to nobody'
           when count(x.assigned_to) = count(*) then 'All assigned'
           else (count(*) - count(x.assigned_to)) || ' assigned to nobody' end
    from public.author_applications x
    where x.status in ('new', 'needs_info') and x.submitted_at < now() - interval '5 days'
      and public.has_permission('approve_books') and public._staff_alert_on(uid, 'applications_waiting')
    having count(*) > 0
    union all
    -- Integrations that aren't working.
    select 'system_health', coalesce(h.checked_at, h.last_event_at, now()),
      case h.status when 'failing' then 'err' else 'org' end, '/integrations',
      h.label || case h.status when 'failing' then ' is failing' else ' is having problems' end,
      coalesce(h.error_note, h.last_event_text, 'See Integrations')
    from public.integration_health h
    where h.status <> 'working'
      and public.has_permission('manage_settings') and public._staff_alert_on(uid, 'system_health')
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'at', at, 'tone', tone, 'href', href,
           'title', title, 'detail', detail, 'new', at > v_since) order by at desc), '[]')
    into v_items
  from (select * from a order by at desc limit 20) t;

  return jsonb_build_object('items', v_items,
    'new_count', (select count(*) from jsonb_array_elements(v_items) e where (e ->> 'new')::boolean));
end $$;

-- Mark all read: what is there now stops counting as new. Personal, like the alert switches.
-- Returns the mark it replaced, so Undo can put it back (p_until, never later than now).
create function public.mark_staff_alerts_read(p_until timestamptz default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_prev timestamptz;
begin
  if not (public.is_staff() and public.staff_mfa_ok()) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  select r.read_at into v_prev from public.staff_alert_reads r where r.user_id = auth.uid();
  insert into public.staff_alert_reads (user_id, read_at)
  values (auth.uid(), least(coalesce(p_until, now()), now()))
  on conflict (user_id) do update set read_at = excluded.read_at;
  return coalesce(v_prev, '-infinity');
end $$;

revoke execute on function public._staff_alert_on(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_staff_alerts(), public.mark_staff_alerts_read(timestamptz) from public, anon;
grant execute on function public.get_staff_alerts(), public.mark_staff_alerts_read(timestamptz) to authenticated;
