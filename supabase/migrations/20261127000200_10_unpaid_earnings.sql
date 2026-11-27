-- Spec check 10-16 · rule 37: an author with unpaid earnings can't delete their account until the
-- next payout is complete. _unpaid_earnings_kobo summed every earning ever made (flow 10 was built
-- before payouts existed), so any author who had ever earned could never delete. Flow 13 now pays:
-- unpaid = earned on the ledger, less earnings excluded from pay (undone, returned, refunded, gift
-- loops, self-reads, takedowns), less payouts that reached the author's bank.
create or replace function public._unpaid_earnings_kobo(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select greatest(0,
      coalesce((select sum(l.author_earning_kobo) from public.credit_ledger l where l.author_id = p_user), 0)
    - coalesce((select sum(x.kobo) from public.earning_exclusions x
                join public.credit_ledger l on l.id = x.ledger_id
                where l.author_id = p_user), 0)
    - coalesce((select sum(p.amount_kobo) from public.payouts p
                where p.author_id = p_user and p.status = 'successful'), 0)
  )::bigint
$$;
revoke all on function public._unpaid_earnings_kobo(uuid) from public, anon, authenticated;
