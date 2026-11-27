-- 13-11: when Flutterwave won't take a transfer at release, the payout quietly went back to the
-- queue (1 h, then 6 h) and Finance heard nothing until the third error. Now the first error of a
-- run tells Finance once (again only if it happens more than 6 hours after the last alert), and
-- the cycle page shows "Paused, retrying" with the next try while any transfer waits after an error.

alter table public.payout_runs add column retry_alerted_at timestamptz;

-- Worker (service key), after payout_transfer_error gave a delay: true when Finance should be told.
create function public.payout_retry_alert(p_payout uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('payout_retry_alert');
  update public.payout_runs r set retry_alerted_at = now()
  from public.payouts p
  where p.id = p_payout and r.id = p.run_id
    and (r.retry_alerted_at is null or r.retry_alerted_at < now() - interval '6 hours');
  return found;
end $$;

-- s-royalty-cycle: transfers of this cycle waiting to be tried again after an API error.
create function public.admin_cycle_retrying(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_payout_staff();
  return (select jsonb_build_object('count', count(*), 'next_at', min(q.not_before),
                                    'kobo', coalesce(sum(q.amount_kobo), 0))
          from public.payouts q join public.payout_runs r on r.id = q.run_id
          where r.cycle_id = p_cycle and q.status = 'queued' and q.api_errors > 0
            and q.flutterwave_transfer_id is null);
end $$;

revoke all on function public.payout_retry_alert(uuid), public.admin_cycle_retrying(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.payout_retry_alert(uuid) to service_role;
grant execute on function public.admin_cycle_retrying(uuid) to authenticated;
