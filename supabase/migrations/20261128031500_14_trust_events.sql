-- Spec check 14-29 (flow 14 Analytics), server half, part 2: the events that start on the server
-- go to PostHog through the analytics outbox (20261127223500_15_server_analytics.sql), so they are
-- counted however the item was made (app, inbound email, staff console, automatic rule).
--   report_auto_hidden {content_type, reports}  an item is hidden by reports (once per item)
--   claim_created      {type, from_report}       a copyright, plagiarism or impersonation claim
--   appeal_created     {subject_type}            a reader or author appeals a decision
--   ticket_created     {channel, category}       a support ticket (app or email)
--   ticket_first_reply {hours, category}         the first staff reply on a ticket
--   ticket_solved      {hours, category}         a ticket is marked solved
-- distinct_id is the person who did it (reader, claimant, staff) or 'system'; properties hold no
-- personal data (no emails, names or text). A failing event never blocks the change.

create function public._report_hidden_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.analytics_outbox (event, distinct_id, props)
  select 'report_auto_hidden', 'system',
         jsonb_build_object('content_type', n.content_type, 'reports', count(*), 'source', 'server')
  from new_rows n join old_rows o on o.id = n.id
  where n.status = 'auto_hidden' and o.status is distinct from 'auto_hidden'
  group by n.content_type, n.content_id;
  return null;
exception when others then
  return null;
end $$;
create trigger reports_hidden_analytics after update on public.reports
  referencing old table as old_rows new table as new_rows
  for each statement execute function public._report_hidden_event();

create function public._claim_created_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._track('claim_created', coalesce(new.claimant_id::text, 'system'),
    jsonb_build_object('type', new.type, 'from_report', new.report_id is not null));
  return null;
exception when others then
  return null;
end $$;
create trigger copyright_claims_created_analytics after insert on public.copyright_claims
  for each row execute function public._claim_created_event();

create function public._appeal_created_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._track('appeal_created', new.user_id::text, jsonb_build_object('subject_type', new.subject_type));
  return null;
exception when others then
  return null;
end $$;
create trigger appeals_created_analytics after insert on public.appeals
  for each row execute function public._appeal_created_event();

create function public._ticket_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_hours numeric := round(extract(epoch from now() - new.created_at) / 3600.0, 1);
begin
  if tg_op = 'INSERT' then
    perform public._track('ticket_created', coalesce(new.user_id::text, 'system'),
      jsonb_build_object('channel', new.channel, 'category', new.category));
  else
    if old.first_replied_at is null and new.first_replied_at is not null then
      perform public._track('ticket_first_reply', coalesce(new.assignee_id::text, 'system'),
        jsonb_build_object('hours', round(extract(epoch from new.first_replied_at - new.created_at) / 3600.0, 1),
                           'category', new.category));
    end if;
    if new.status = 'solved' and old.status is distinct from 'solved' then
      perform public._track('ticket_solved', coalesce(new.assignee_id::text, 'system'),
        jsonb_build_object('hours', v_hours, 'category', new.category));
    end if;
  end if;
  return null;
exception when others then
  return null;
end $$;
create trigger support_tickets_created_analytics after insert on public.support_tickets
  for each row execute function public._ticket_event();
create trigger support_tickets_changed_analytics after update of first_replied_at, status on public.support_tickets
  for each row execute function public._ticket_event();

revoke execute on function public._report_hidden_event(), public._claim_created_event(),
  public._appeal_created_event(), public._ticket_event() from public, anon, authenticated;
