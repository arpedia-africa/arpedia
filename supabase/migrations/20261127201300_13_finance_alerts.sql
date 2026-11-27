-- Flow 13 · Finance alerts (spec check 13-10, 13-19).
-- payout_reminder (Server cron): 3 days before payout day, Finance hears about authors whose bank
-- account isn't verified and whether the Flutterwave balance covers the run. The Worker reads the
-- balance and sends the alert; this marks the cycle so it goes once.
-- Rule 19: a transfer pending over 48 hours that Flutterwave still can't settle is raised to
-- Finance once: payouts_pending_over now says which payouts it raised on this call.

alter table public.earning_cycles add column reminder_sent_at timestamptz;

create function public.payout_reminder_due() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  perform public._require_service('payout_reminder_due');
  update public.earning_cycles set reminder_sent_at = now()
  where id = (
    select id from public.earning_cycles
    where status in ('closed', 'prepared', 'approved') and not legacy and reminder_sent_at is null
      and payout_date is not null and payout_date between v_today and v_today + 3
    order by payout_date
    limit 1
    for update skip locked)
  returning * into c;
  if c.id is null then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'cycle_id', c.id, 'month', c.month, 'payout_date', c.payout_date, 'status', c.status,
      'payable_kobo', coalesce(sum(e.payable_kobo) filter (where e.status = 'payable' and v.ok), 0),
      'payable_authors', count(*) filter (where e.status = 'payable' and v.ok),
      'unverified_authors', count(*) filter (where e.status = 'held_unverified'
                                               or (e.status = 'payable' and not v.ok)),
      'unverified_kobo', coalesce(sum(e.payable_kobo) filter (where e.status = 'held_unverified'
                                                                or (e.status = 'payable' and not v.ok)), 0))
    from public.author_earnings e
    cross join lateral (select exists (select 1 from public.author_bank_accounts b
                                       where b.author_id = e.author_id and b.status = 'verified') as ok) v
    where e.cycle_id = c.id);
end $$;

create or replace function public.payouts_pending_over(p_hours int default 48) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform public._require_service('payouts_pending_over');
  -- now() is fixed for the transaction, so raised_at = now() marks exactly the rows raised here.
  update public.payouts set raised_at = now()
  where status = 'pending' and raised_at is null and sent_at < now() - make_interval(hours => p_hours);
  select coalesce(jsonb_agg(jsonb_build_object('payout_id', id, 'reference', reference,
                                               'transfer_id', flutterwave_transfer_id,
                                               'amount_kobo', amount_kobo, 'sent_at', sent_at,
                                               'newly_raised', raised_at = now()) order by sent_at), '[]')
  into v from public.payouts where status = 'pending' and sent_at < now() - make_interval(hours => p_hours);
  return v;
end $$;

revoke all on function public.payout_reminder_due() from public, anon, authenticated, service_role;
grant execute on function public.payout_reminder_due() to service_role;
