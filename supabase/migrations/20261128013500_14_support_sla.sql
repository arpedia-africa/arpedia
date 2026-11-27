-- Flow 14 · spec check 14-25 (rules 35 and 37, Server: sla_watch).
-- 1. sla_watch also watches support tickets: a ticket still waiting for its first reply after the
--    1-day promise is marked late once (`late_alerted_at`) and Support gets one alert per run
--    (`ticket_late` on trust_notify, sent by the flow 15 dispatcher), not one per ticket.
-- 2. A reader reply from the app reopens a Solved ticket within 7 days, as before; after that it
--    opens a new ticket linked to the old one instead of failing with ticket_closed (the email
--    path already did this). It now returns which of the two happened.

alter table public.support_tickets add column late_alerted_at timestamptz;

create or replace function public.sla_watch() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_late int;
  v_oldest text;
begin
  for r in
    update public.reports set late_alerted_at = now()
    where status <> 'resolved' and severity = 'high' and late_alerted_at is null
      and created_at < now() - interval '12 hours' and first_action_at is null
    returning id
  loop
    perform public._trust_notify('staff_alert', jsonb_build_object('report_id', r.id, 'late', true));
  end loop;

  with late as (
    update public.support_tickets set late_alerted_at = now()
    where status <> 'solved' and first_replied_at is null and late_alerted_at is null
      and first_reply_due_at < now()
    returning ref, first_reply_due_at
  )
  select count(*)::int, (array_agg(ref order by first_reply_due_at))[1] into v_late, v_oldest from late;
  if v_late > 0 then
    perform public._trust_notify('ticket_late', jsonb_build_object('count', v_late, 'oldest_ref', v_oldest));
  end if;
end $$;

drop function public.reader_reply_ticket(uuid, text);

create function public.reader_reply_ticket(p_ticket uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.support_tickets;
  v_id uuid;
  v_status text;
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 20000 then
    raise exception 'empty_message' using errcode = '22023';
  end if;
  select * into t from public.support_tickets where id = p_ticket and user_id = auth.uid() for update;
  if t.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if t.status = 'solved' and coalesce(t.reopen_until, now()) <= now() then
    insert into public.support_tickets (user_id, email, channel, category, subject, book_id, linked_ticket_id)
    values (t.user_id, (select email from auth.users where id = t.user_id), 'app', t.category,
            left('Re: ' || t.subject, 200), t.book_id, t.id)
    returning id into v_id;
    v_status := 'linked';
  else
    update public.support_tickets set status = 'open', solved_at = null, last_message_at = now() where id = t.id;
    v_id := t.id;
    v_status := case when t.status = 'solved' then 'reopened' else 'appended' end;
  end if;
  insert into public.ticket_messages (ticket_id, kind, author_id, body) values (v_id, 'reader', auth.uid(), btrim(p_body));
  return jsonb_build_object('status', v_status, 'ticket_id', v_id,
    'ref', (select ref from public.support_tickets where id = v_id));
end $$;

revoke all on function public.reader_reply_ticket(uuid, text) from public, anon, service_role;
grant execute on function public.reader_reply_ticket(uuid, text) to authenticated;
