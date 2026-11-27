-- Flow 15 · spec check 15-26 (and the server events of 11-13, 13-20, 14-29). Staff and system
-- events were written only to audit_log, so PostHog never saw them. An outbox now collects them
-- and the api Worker sends them to PostHog each minute (when the project key is set; otherwise
-- they wait 7 days and are purged).
--   * audit_log → event (trigger): application_decided {decision, days}, bank_account_reviewed
--     {decision}, cycle_closed {month, authors, kobo}, cycle_prepared {month}, cycle_released
--     {authors, kobo}, payout_retry {mode}, report_decided {decision, action, severity,
--     hours_to_first_action}, appeal_decided {outcome, hours}, claim_decided {decision},
--     credit_returned {credits, reason}, campaign_scheduled {reach, moved}, campaign_cancelled,
--     export_created {kind, includes_pii}.
--   * Table changes: campaign_sent {sent, delivered} when a campaign finishes; payout_settled
--     {status} when a transfer succeeds, fails or is reversed.
-- distinct_id is the staff member who acted (or the author for a payout); no reader personal data
-- goes into the properties, only ids, counts and decisions.

create table public.analytics_outbox (
  id bigint generated always as identity primary key,
  event text not null check (char_length(event) between 1 and 80),
  distinct_id text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index analytics_outbox_unsent_idx on public.analytics_outbox (id) where sent_at is null;
alter table public.analytics_outbox enable row level security;
revoke all on public.analytics_outbox from public, anon, authenticated;

create function public._track(p_event text, p_distinct text, p_props jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.analytics_outbox (event, distinct_id, props)
  values (p_event, coalesce(p_distinct, 'system'), coalesce(p_props, '{}') || jsonb_build_object('source', 'server'))
$$;

create function public._audit_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := coalesce(new.after, '{}');
  v_event text;
  v_props jsonb := '{}';
  v_at timestamptz;
begin
  case
    when new.action like 'application.%' and new.action <> 'application.assign' then
      select coalesce(x.submitted_at, x.created_at) into v_at from public.author_applications x
       where x.id::text = new.object_id;
      v_event := 'application_decided';
      v_props := jsonb_build_object('decision', substr(new.action, 13),
        'days', case when v_at is not null then round(extract(epoch from now() - v_at) / 86400.0, 1) end);
    when new.action like 'bank_account.%' then
      v_event := 'bank_account_reviewed';
      v_props := jsonb_build_object('decision', substr(new.action, 14));
    when new.action = 'cycle.close' then
      v_event := 'cycle_closed';
      select jsonb_build_object('month', to_char(c.month, 'YYYY-MM'),
               'authors', (select count(*) from public.author_earnings e where e.cycle_id = c.id),
               'kobo', c.earnings_kobo)
        into v_props from public.earning_cycles c where c.id::text = new.object_id;
    when new.action = 'cycle.prepare' then
      v_event := 'cycle_prepared';
      select jsonb_build_object('month', to_char(c.month, 'YYYY-MM')) into v_props
        from public.earning_cycles c where c.id::text = new.object_id;
    when new.action = 'cycle.release' then
      v_event := 'cycle_released';
      v_props := jsonb_build_object('authors', a -> 'authors', 'kobo', a -> 'total_kobo');
    when new.action = 'payout.retry' then
      v_event := 'payout_retry';
      v_props := jsonb_build_object('mode', case when (a ->> 'waiting')::boolean
                                                 then 'new_account_when_verified' else 'same_account_confirmed' end);
    when new.action = 'report.decide' then
      v_event := 'report_decided';
      select jsonb_build_object('decision', a ->> 'outcome', 'action', a ->> 'action', 'severity', r.severity,
               'hours_to_first_action',
               round(extract(epoch from coalesce(r.first_action_at, now()) - r.created_at) / 3600.0, 1))
        into v_props from public.reports r where r.id::text = new.object_id;
    when new.action = 'appeal.decide' then
      v_event := 'appeal_decided';
      select jsonb_build_object('outcome', a ->> 'status',
               'hours', round(extract(epoch from now() - x.created_at) / 3600.0, 1))
        into v_props from public.appeals x where x.id::text = new.object_id;
    when new.action in ('claim.uphold', 'claim.reject') then
      v_event := 'claim_decided';
      v_props := jsonb_build_object('decision', substr(new.action, 7));
    when new.action = 'return_chapter' then
      v_event := 'credit_returned';
      v_props := jsonb_build_object('credits', (substring(new.summary from 'Returned (\d+) credits'))::int,
                                    'reason', new.reason);
    when new.action = 'campaign.schedule' then
      v_event := 'campaign_scheduled';
      v_props := jsonb_build_object('campaign_id', new.object_id, 'reach', a -> 'reach', 'moved', a -> 'moved');
    when new.action = 'campaign.cancel' then
      v_event := 'campaign_cancelled';
      v_props := jsonb_build_object('campaign_id', new.object_id);
    when new.action = 'export.create' then
      v_event := 'export_created';
      v_props := jsonb_build_object('kind', new.object_label, 'includes_pii', a -> 'includes_pii');
    else
      return null;
  end case;
  perform public._track(v_event, coalesce(new.actor_id::text, 'system'), coalesce(v_props, '{}'));
  return null;
exception when others then
  -- Analytics never stops the action it describes.
  return null;
end $$;
create trigger audit_log_analytics after insert on public.audit_log
  for each row execute function public._audit_event();

create function public._campaign_sent_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'sent' and old.status is distinct from 'sent' then
    perform public._track('campaign_sent', coalesce(new.created_by::text, 'system'),
      jsonb_build_object('campaign_id', new.id, 'sent', new.counts -> 'sent', 'delivered', new.counts -> 'delivered'));
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger campaigns_sent_analytics after update of status on public.campaigns
  for each row execute function public._campaign_sent_event();

create function public._payout_settled_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('successful', 'failed', 'reversed') and old.status is distinct from new.status then
    perform public._track('payout_settled', new.author_id::text, jsonb_build_object('status', new.status));
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger payouts_settled_analytics after update of status on public.payouts
  for each row execute function public._payout_settled_event();

-- The api Worker: a batch to send, then the ids it sent. Sent and week-old rows are purged.
create function public.analytics_outbox_take(p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('analytics_outbox_take');
  delete from public.analytics_outbox
   where (sent_at is not null and sent_at < now() - interval '1 day') or created_at < now() - interval '7 days';
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'event', o.event, 'distinct_id', o.distinct_id,
                                                       'props', o.props, 'at', o.created_at) order by o.id)
                   from (select * from public.analytics_outbox where sent_at is null
                         order by id limit least(greatest(coalesce(p_limit, 200), 1), 1000)) o), '[]'::jsonb);
end $$;

create function public.analytics_outbox_done(p_ids bigint[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public._require_service('analytics_outbox_done');
  update public.analytics_outbox set sent_at = now() where id = any (coalesce(p_ids, '{}')) and sent_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public._track(text, text, jsonb), public._audit_event(), public._campaign_sent_event(),
  public._payout_settled_event(), public.analytics_outbox_take(int), public.analytics_outbox_done(bigint[])
  from public, anon, authenticated;
grant execute on function public.analytics_outbox_take(int), public.analytics_outbox_done(bigint[]) to service_role;
