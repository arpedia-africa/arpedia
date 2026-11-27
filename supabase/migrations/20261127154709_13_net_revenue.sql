-- Flow 13 · spec check 13-18 (rule 31): earning_cycles.net_revenue_kobo was never written, so the
-- cycle page always said "Not in yet". Net revenue for the month (WAT) uses the same definition as
-- the Revenue page (flow 09 admin_revenue): gross less store fees less refunds, over succeeded,
-- refunded and disputed transactions. It is refreshed while the cycle is closed or prepared (close
-- and recheck), and kept as it was once the run is approved and money moves.

create function public._cycle_net_revenue(p_month date) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(t.gross_kobo - t.fee_kobo - t.refunded_kobo), 0)::bigint
  from public.transactions t
  where t.status in ('succeeded', 'refunded', 'disputed')
    and t.created_at >= public._cycle_start(p_month) and t.created_at < public._cycle_end(p_month)
$$;

create function public._cycle_net_revenue_set() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('closed', 'prepared') or (new.status <> 'open' and new.net_revenue_kobo is null) then
    new.net_revenue_kobo := public._cycle_net_revenue(new.month);
  end if;
  return new;
end $$;
create trigger earning_cycles_net_revenue before insert or update on public.earning_cycles
  for each row execute function public._cycle_net_revenue_set();

revoke all on function public._cycle_net_revenue(date), public._cycle_net_revenue_set() from public, anon, authenticated;

-- Cycles already closed get theirs now.
update public.earning_cycles set net_revenue_kobo = public._cycle_net_revenue(month) where status <> 'open';
