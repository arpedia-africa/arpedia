-- Flow 15 · spec check 15-20 (rule 29): scheduled reports. Each `export_schedules` row (monthly
-- earnings statement, weekly KPI, weekly safety summary, quarterly data-request log) is emailed
-- to its named recipients when its cron comes round (Lagos time): a few headline numbers and a
-- link into the console, which needs staff sign-in. No personal details go in the email.
-- The api Worker (routes/15/reports.ts) runs it hourly; these functions are service role only.

insert into public.email_templates (key, name, trigger, can_disable, finance_review, variables, position) values
  ('scheduled_report', 'Arpedia scheduled report', 'Scheduled report (earnings, KPI, safety, data requests)',
   true, false, '{subject,period,summary,link}', 40)
on conflict (key) do nothing;

insert into public.email_template_versions (template_key, number, subject, preheader, body)
select 'scheduled_report', 1, '{{subject}} · {{period}}', 'Your scheduled Arpedia report',
       '{{subject}} for {{period}}' || chr(10) || chr(10) || '{{summary}}' || chr(10) || chr(10) ||
       'See the details in the console (staff sign-in): {{link}}' || chr(10) || chr(10) ||
       'You get this because you are a named recipient in Exports → Scheduled reports.'
where not exists (select 1 from public.email_template_versions v where v.template_key = 'scheduled_report');

-- Enabled schedules with at least one recipient.
create function public.scheduled_reports_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_service('scheduled_reports_list');
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'report_kind', s.report_kind,
                                                       'recipients', s.recipients, 'cron', s.cron,
                                                       'last_sent_at', s.last_sent_at) order by s.report_kind)
                   from public.export_schedules s
                   where s.enabled and cardinality(s.recipients) > 0), '[]'::jsonb);
end $$;

-- Claims one firing before the emails go, so two Worker runs never send it twice. False when this
-- firing (or a later one) was already sent.
create function public.claim_scheduled_report(p_id uuid, p_fire_at timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('claim_scheduled_report');
  update public.export_schedules set last_sent_at = p_fire_at
  where id = p_id and enabled and (last_sent_at is null or last_sent_at < p_fire_at);
  return found;
end $$;

-- Headline numbers for one report over [p_from, p_to). Counts and kobo only, never who.
create function public.scheduled_report_summary(p_kind text, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.earning_cycles;
begin
  perform public._require_service('scheduled_report_summary');
  if p_kind = 'monthly_earnings' then
    select * into c from public.earning_cycles
    where month = (date_trunc('month', p_from at time zone 'Africa/Lagos'))::date;
    return jsonb_build_object(
      'cycle_status', coalesce(c.status::text, 'none'),
      'earnings_kobo', coalesce(c.earnings_kobo, 0),
      'authors', (select count(*) from public.author_earnings e where e.cycle_id = c.id and e.amount_kobo > 0),
      'payable_kobo', coalesce((select sum(e.payable_kobo) from public.author_earnings e
                                where e.cycle_id = c.id and e.status in ('payable', 'queued', 'paid', 'partly_failed')), 0),
      'held_authors', (select count(*) from public.author_earnings e
                       where e.cycle_id = c.id and e.status::text like 'held%'),
      'carried_authors', (select count(*) from public.author_earnings e where e.cycle_id = c.id and e.status = 'carried'),
      'payout_date', c.payout_date);
  elsif p_kind = 'weekly_kpi' then
    return jsonb_build_object(
      'signups', (select count(*) from auth.users u where u.created_at >= p_from and u.created_at < p_to),
      'active_readers', (select count(distinct s.user_id) from public.reading_sessions s
                         where s.started_at >= p_from and s.started_at < p_to),
      'reading_hours', (select coalesce(round(sum(s.active_seconds) / 3600.0), 0) from public.reading_sessions s
                        where s.started_at >= p_from and s.started_at < p_to),
      'unlocks', (select count(distinct l.txn_id) from public.credit_ledger l
                  where l.reason in ('unlock_all', 'chapter') and l.delta < 0
                    and l.created_at >= p_from and l.created_at < p_to),
      'credits_spent', (select coalesce(-sum(l.delta), 0) from public.credit_ledger l
                        where l.reason in ('unlock_all', 'chapter', 'tip', 'message') and l.delta < 0
                          and l.created_at >= p_from and l.created_at < p_to),
      'revenue_kobo', (select coalesce(sum(t.gross_kobo), 0) from public.transactions t
                       where t.status = 'succeeded' and t.created_at >= p_from and t.created_at < p_to));
  elsif p_kind = 'weekly_safety' then
    return jsonb_build_object(
      'reports', (select count(*) from public.reports r where r.created_at >= p_from and r.created_at < p_to),
      'high', (select count(*) from public.reports r
               where r.severity = 'high' and r.created_at >= p_from and r.created_at < p_to),
      'resolved', (select count(*) from public.reports r where r.resolved_at >= p_from and r.resolved_at < p_to),
      'open_now', (select count(*) from public.reports r where r.status <> 'resolved'),
      'sanctions', (select count(*) from public.user_sanctions s where s.created_at >= p_from and s.created_at < p_to),
      'appeals', (select count(*) from public.appeals a where a.created_at >= p_from and a.created_at < p_to));
  elsif p_kind = 'quarterly_data_requests' then
    return jsonb_build_object(
      'deletions_requested', (select count(*) from public.account_deletions d
                              where d.requested_at >= p_from and d.requested_at < p_to),
      'deletions_done', (select count(*) from public.account_deletions d
                         where d.status = 'done' and d.completed_at >= p_from and d.completed_at < p_to),
      'deletions_blocked', (select count(*) from public.account_deletions d
                            where d.status = 'blocked' and d.requested_at >= p_from and d.requested_at < p_to),
      'reader_exports', (select count(*) from public.email_sends e
                         where e.template_key = 'data_export_ready' and e.sent_at >= p_from and e.sent_at < p_to),
      'staff_personal_exports', (select count(*) from public.exports x
                                 where x.includes_pii and x.created_at >= p_from and x.created_at < p_to));
  end if;
  raise exception 'unknown report kind' using errcode = '22023';
end $$;

revoke all on function public.scheduled_reports_list() from public, anon, authenticated, service_role;
revoke all on function public.claim_scheduled_report(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.scheduled_report_summary(text, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.scheduled_reports_list() to service_role;
grant execute on function public.claim_scheduled_report(uuid, timestamptz) to service_role;
grant execute on function public.scheduled_report_summary(text, timestamptz, timestamptz) to service_role;
