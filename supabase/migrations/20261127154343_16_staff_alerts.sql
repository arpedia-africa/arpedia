-- Flow 16 · spec check 16-14 (rule 40): staff alert preferences are read, and every kind on
-- My account has a producer. Delivery stays email through the flow 15 dispatcher (the admin
-- prototype has no bell list yet).
--   high-severity reports   flow 14 staff_alert (always on for High; the switch covers the rest)
--   failed payouts          flow 13 payout_alert payout_failed / transfer_stuck
--   copyright claims        new: a new claim, and an open claim within 2 days of its due date
--   applications waiting    flow 11 application_sla
--   system health           new: a service in Integrations turns orange or red

-- 1. The dispatcher's lookup also returns which alerts each staff member turned off.
create or replace function public.notify_lookup(p_users uuid[] default '{}', p_books uuid[] default '{}',
                                     p_roles text[] default '{}', p_follow_authors uuid[] default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_service('notify_lookup');
  return jsonb_build_object(
    'users', coalesce((select jsonb_object_agg(u.id, jsonb_build_object(
        'email', case when p.erased_at is null and p.deleted_at is null then u.email end,
        'first_name', coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'there'),
        'name', public.sender_name(u.id)))
      from auth.users u join public.profiles p on p.id = u.id
      where u.id = any(coalesce(p_users, '{}'))), '{}'),
    'books', coalesce((select jsonb_object_agg(b.id, jsonb_build_object('title', b.title, 'author_id', b.author_id))
      from public.books b where b.id = any(coalesce(p_books, '{}'))), '{}'),
    'staff', coalesce((select jsonb_object_agg(r.role, r.ids) from (
        select x.role, jsonb_agg(distinct s.user_id) ids
        from unnest(coalesce(p_roles, '{}')) x(role)
        join public.staff_roles s on s.active and (s.role::text = x.role or s.role = 'super_admin')
        group by x.role) r), '{}'),
    -- Alerts each staff member turned off on My account (flow 16 rule 40).
    'staff_off', coalesce((select jsonb_object_agg(a.user_id, a.kinds) from (
        select p.user_id, jsonb_agg(p.kind) kinds from public.staff_alert_prefs p
        where not p.enabled and p.user_id in (
          select s.user_id from unnest(coalesce(p_roles, '{}')) x(role)
          join public.staff_roles s on s.active and (s.role::text = x.role or s.role = 'super_admin'))
        group by p.user_id) a), '{}'),
    'followers', coalesce((select jsonb_object_agg(f.author, f.ids) from (
        select a.author, (select jsonb_agg(fl.follower_id) from (
            select fo.follower_id from public.follows fo where fo.followee_id = a.author limit 10000) fl) ids
        from unnest(coalesce(p_follow_authors, '{}')) a(author)) f where f.ids is not null), '{}'));
end $$;

-- 2. System health.
create or replace function public.worker_set_integration_health(p_service text, p_status text,
  p_last_event_at timestamptz default null, p_last_event_text text default null, p_error_rate numeric default null,
  p_error_note text default null, p_key_masked text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before text;
  v_label text;
begin
  select status, label into v_before, v_label from public.integration_health where service = p_service for update;
  if p_key_masked is not null and p_key_masked !~ '•{4,}' then
    perform public._raise('key_not_masked');
  end if;
  update public.integration_health set status = p_status, last_event_at = coalesce(p_last_event_at, last_event_at),
    last_event_text = coalesce(left(p_last_event_text, 200), last_event_text), error_rate_24h = p_error_rate,
    error_note = left(p_error_note, 200), key_masked = coalesce(p_key_masked, key_masked), checked_at = now()
  where service = p_service;
  if not found then
    perform public._raise('bad_service');
  end if;
  -- System health alert when a service turns orange or red (or orange to red), once per change.
  if (v_before = 'working' and p_status in ('degraded', 'failing')) or (v_before = 'degraded' and p_status = 'failing') then
    perform public._trust_notify('system_alert', jsonb_build_object('service', p_service, 'label', v_label,
      'status', p_status, 'note', left(coalesce(p_error_note, p_last_event_text), 200)));
  end if;
end $$;

-- 3. Copyright claims: a new claim, and once when an open claim is within 2 days of its due date.
alter table public.copyright_claims add column deadline_alerted_at timestamptz;

create function public._claim_new_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._trust_notify('claim_new', jsonb_build_object('claim_id', new.id, 'ref', new.ref,
    'book_id', new.book_id, 'claimant_name', new.claimant_name));
  return new;
end $$;
create trigger copyright_claims_new_alert after insert on public.copyright_claims
  for each row execute function public._claim_new_alert();

create function public.claim_deadline_watch() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    update public.copyright_claims set deadline_alerted_at = now()
    where status in ('new', 'waiting_on_author') and deadline_alerted_at is null
      and due_at < now() + interval '2 days'
    returning id, ref, book_id, due_at
  loop
    perform public._trust_notify('claim_deadline', jsonb_build_object('claim_id', r.id, 'ref', r.ref,
      'book_id', r.book_id, 'due_at', r.due_at));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public._claim_new_alert(), public.claim_deadline_watch() from public, anon, authenticated;
grant execute on function public.claim_deadline_watch() to service_role;

select cron.schedule('claim_deadline_watch', '20 * * * *', 'select public.claim_deadline_watch()');
