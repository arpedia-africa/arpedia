-- Flow 16 · spec check 16-6 (rule 39): status, last event and 24-hour error rate for the services
-- the health cron did not measure, from what Arpedia already records (no provider call, no secret):
--   google_play / app_store  RevenueCat webhooks for that store (`payment_events.normalized.store`)
--   flutterwave_transfers    payout transfers sent, and sends the API refused (`payouts.api_errors`)
--   fcm                      push tickets and receipts (`push_log`); a stale device token is not a failure
--   resend                   transactional email sent and bounced (`email_sends`)
-- expo_updates has no event of its own in the database; it keeps its last status (Q6 default).
-- Same shape as worker_payment_health: {service: {last_at, last_type, total, failed}}.

create function public.worker_service_health() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'google_play', (
      select jsonb_build_object('last_at', max(e.received_at),
        'last_type', (array_agg(e.event_type order by e.received_at desc))[1],
        'total', count(*) filter (where e.received_at > now() - interval '24 hours'),
        'failed', count(*) filter (where e.received_at > now() - interval '24 hours' and e.error is not null))
      from public.payment_events e
      where e.provider = 'revenuecat' and e.normalized ->> 'store' = 'play'),
    'app_store', (
      select jsonb_build_object('last_at', max(e.received_at),
        'last_type', (array_agg(e.event_type order by e.received_at desc))[1],
        'total', count(*) filter (where e.received_at > now() - interval '24 hours'),
        'failed', count(*) filter (where e.received_at > now() - interval '24 hours' and e.error is not null))
      from public.payment_events e
      where e.provider = 'revenuecat' and e.normalized ->> 'store' = 'app_store'),
    'flutterwave_transfers', (
      select jsonb_build_object(
        'last_at', greatest((select max(v.received_at) from public.payout_events v), max(p.sent_at)),
        'last_type', case
          when (select max(v.received_at) from public.payout_events v) >= coalesce(max(p.sent_at), '-infinity')
            then 'transfer ' || (select v.status::text from public.payout_events v order by v.received_at desc limit 1)
          when max(p.sent_at) is not null then 'transfer sent' end,
        'total', count(*) filter (where coalesce(p.sent_at, p.queued_at) > now() - interval '24 hours'
                                    and (p.sent_at is not null or p.api_errors > 0)),
        'failed', count(*) filter (where p.queued_at > now() - interval '24 hours'
                                     and p.sent_at is null and p.api_errors > 0))
      from public.payouts p),
    'fcm', (
      select jsonb_build_object('last_at', max(l.sent_at), 'last_type', 'push sent',
        'total', count(*) filter (where l.sent_at > now() - interval '24 hours'),
        'failed', count(*) filter (where l.sent_at > now() - interval '24 hours' and l.status = 'failed'
                                     and coalesce(l.skip_reason, '') <> 'DeviceNotRegistered'))
      from public.push_log l
      where l.sent_at is not null),
    'resend', (
      select jsonb_build_object('last_at', max(s.sent_at), 'last_type', 'email sent',
        'total', count(*) filter (where s.sent_at > now() - interval '24 hours'),
        'failed', count(*) filter (where s.sent_at > now() - interval '24 hours' and s.bounced_at is not null))
      from public.email_sends s))
$$;

revoke all on function public.worker_service_health() from public, anon, authenticated;
grant execute on function public.worker_service_health() to service_role;
