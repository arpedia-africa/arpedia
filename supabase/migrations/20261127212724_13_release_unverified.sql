-- 13-16: a `payable` line whose author has no verified account at release time (account replaced
-- or rejected after prepare) was skipped by the release loop and stayed `payable` for ever: the
-- next close only carries `carried` and `held_*` lines, so the money was orphaned. Release now
-- marks such a line `held_unverified`, so the next close carries it in (rule 11) like any other
-- hold, and says how many were held in the audit entry and the result.
create or replace function public.release_cycle(p_cycle uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  r public.payout_runs;
  v_recheck jsonb;
  e record;
  v_pid uuid;
  v_held int;
begin
  perform public._require_payout_super(true);
  select * into c from public.earning_cycles where id = p_cycle for update;
  if c.id is null then
    perform public._raise('not_found');
  end if;
  if c.status in ('releasing', 'paid', 'paid_with_failures') then
    select * into r from public.payout_runs where cycle_id = c.id order by created_at limit 1;
    return jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo, 'replayed', true);
  end if;
  if c.status <> 'prepared' then
    perform public._raise('bad_status', jsonb_build_object('status', c.status));
  end if;
  if c.prepared_by = auth.uid() then
    perform public._raise('same_person');
  end if;
  if now() < c.closed_at + make_interval(days => c.hold_days) then
    perform public._raise('hold_not_ended');
  end if;
  v_recheck := public.recheck_cycle(c.id);
  if (v_recheck ->> 'diff_kobo')::bigint <> 0 then
    perform public._raise('ledger_mismatch', v_recheck);
  end if;

  insert into public.payout_runs (cycle_id, started_by, approved_by)
  values (c.id, c.prepared_by, auth.uid()) returning * into r;
  for e in
    select ae.*, b.id as account_id, b.payouts_resume_at
    from public.author_earnings ae
    join public.author_bank_accounts b on b.author_id = ae.author_id and b.status = 'verified'
    where ae.cycle_id = c.id and ae.status = 'payable' and ae.payable_kobo > 0
  loop
    v_pid := null;
    insert into public.payouts (run_id, author_earning_id, author_id, bank_account_id, amount_kobo, attempt,
                                reference, not_before)
    values (r.id, e.id, e.author_id, e.account_id, e.payable_kobo, 1,
            public._payout_reference(c.month, e.author_id, 1), greatest(now(), e.payouts_resume_at))
    on conflict (reference) do nothing
    returning id into v_pid;
    if v_pid is not null then
      perform pgmq.send('payout_transfer', jsonb_build_object('payout_id', v_pid));
      update public.author_earnings set status = 'queued' where id = e.id;
    end if;
  end loop;
  -- Lines still payable had no verified account: hold them so the next close carries them.
  update public.author_earnings set status = 'held_unverified', held_reason = 'Bank account not verified'
  where cycle_id = c.id and status = 'payable';
  get diagnostics v_held = row_count;
  update public.payout_runs set
    authors = (select count(*) from public.payouts where run_id = r.id),
    total_kobo = (select coalesce(sum(amount_kobo), 0) from public.payouts where run_id = r.id),
    status = 'sending'
  where id = r.id returning * into r;
  update public.earning_cycles set status = 'releasing', approved_by = auth.uid(), approved_at = now()
  where id = c.id;
  perform public.write_audit('money', 'cycle.release', 'earning_cycle', c.id::text, to_char(c.month, 'Mon YYYY'),
    format('Released %s: %s authors, %s kobo, %s held for a bank account', to_char(c.month, 'Mon YYYY'),
           r.authors, r.total_kobo, v_held), null,
    jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo, 'held_unverified', v_held));
  return jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo,
    'held_unverified', v_held, 'replayed', false);
end $$;
