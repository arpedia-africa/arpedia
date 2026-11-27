-- Flow 13 · spec check 13-12 (edge "Flutterwave balance below the sendable amount", open question 5,
-- default: allow). When the balance can't cover the whole month, a Super admin may release in part:
-- verified lines are sent up to the amount they give (smallest first, so the most authors are paid),
-- and the rest stays approved, not sent: still `payable` in a `releasing` month, sent later with
-- the same RPC once the balance is topped up. The month only turns Paid when nothing is left to send.
-- The full release (`release_cycle`) is unchanged and still replays when called twice.
--
-- Same rules as a full release: Super admin, not the preparer, a fresh single-use code, hold ended,
-- the ledger matches. No amount is changed: each line is sent whole or not at all.

-- Paid (or Paid with failures) once nothing is queued or pending and nothing is left approved, not
-- sent. Used by _settle_payout and by a release that had nothing to send.
create function public._finish_cycle(p_cycle uuid) returns void
language sql security definer set search_path = '' as $$
  update public.earning_cycles c set status = case
      when exists (select 1 from public.author_earnings x where x.cycle_id = c.id and x.status = 'partly_failed')
      then 'paid_with_failures' else 'paid' end::public.earning_cycle_status
  where c.id = p_cycle and c.status in ('releasing', 'paid', 'paid_with_failures')
    and not exists (select 1 from public.payouts q join public.payout_runs pr on pr.id = q.run_id
                    where pr.cycle_id = c.id and q.status in ('queued', 'pending'))
    and not exists (select 1 from public.author_earnings x where x.cycle_id = c.id and x.status = 'payable');
$$;

-- Sends a cycle's verified payable lines, at most p_budget_kobo in total (null = all of them).
-- Lines with no verified account are held for a bank account (13-16), as before.
create function public._release_cycle_send(p_cycle uuid, p_budget_kobo bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  r public.payout_runs;
  v_recheck jsonb;
  e record;
  v_pid uuid;
  v_held int;
  v_sent bigint := 0;
  v_rest boolean;
  v_left_authors int;
  v_left_kobo bigint;
begin
  perform public._require_payout_super(true);
  if p_budget_kobo is not null and p_budget_kobo < 1 then
    perform public._raise('balance_too_low');
  end if;
  select * into c from public.earning_cycles where id = p_cycle for update;
  if c.id is null then
    perform public._raise('not_found');
  end if;
  -- A month already releasing can still send what was left approved, not sent.
  v_rest := c.status = 'releasing'
            and exists (select 1 from public.author_earnings x where x.cycle_id = c.id and x.status = 'payable');
  if c.status in ('releasing', 'paid', 'paid_with_failures') and not (v_rest and p_budget_kobo is not null) then
    select * into r from public.payout_runs where cycle_id = c.id order by created_at limit 1;
    return jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo, 'replayed', true);
  end if;
  if c.status <> 'prepared' and not v_rest then
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

  -- Lines with no verified account (or nothing to send) are held first, as the full release did, so
  -- what is left payable is all sendable.
  update public.author_earnings ae set status = 'held_unverified', held_reason = 'Bank account not verified'
  where ae.cycle_id = c.id and ae.status = 'payable'
    and (ae.payable_kobo <= 0
         or not exists (select 1 from public.author_bank_accounts b
                        where b.author_id = ae.author_id and b.status = 'verified'));
  get diagnostics v_held = row_count;

  if v_rest and not exists (select 1 from public.author_earnings x where x.cycle_id = c.id and x.status = 'payable') then
    -- What was left lost its verified account: held for the next close; the month may be done now.
    perform public._finish_cycle(c.id);
    perform public.write_audit('money', 'cycle.release_rest', 'earning_cycle', c.id::text, to_char(c.month, 'Mon YYYY'),
      format('Released %s: nothing left to send, %s held for a bank account', to_char(c.month, 'Mon YYYY'), v_held),
      null, jsonb_build_object('held_unverified', v_held));
    return jsonb_build_object('run_id', null, 'authors', 0, 'total_kobo', 0, 'held_unverified', v_held,
      'left_authors', 0, 'left_kobo', 0, 'rest', true, 'replayed', false);
  end if;
  if p_budget_kobo is not null
     and exists (select 1 from public.author_earnings x where x.cycle_id = c.id and x.status = 'payable')
     and not exists (select 1 from public.author_earnings x where x.cycle_id = c.id and x.status = 'payable'
                     and x.payable_kobo <= p_budget_kobo) then
    perform public._raise('balance_too_low', jsonb_build_object(
      'smallest_kobo', (select min(x.payable_kobo) from public.author_earnings x
                        where x.cycle_id = c.id and x.status = 'payable')));
  end if;

  insert into public.payout_runs (cycle_id, started_by, approved_by)
  values (c.id, c.prepared_by, auth.uid()) returning * into r;
  for e in
    select ae.*, b.id as account_id, b.payouts_resume_at
    from public.author_earnings ae
    join public.author_bank_accounts b on b.author_id = ae.author_id and b.status = 'verified'
    where ae.cycle_id = c.id and ae.status = 'payable'
    order by ae.payable_kobo, ae.author_id
  loop
    -- Smallest first: once one line doesn't fit, no later (larger) line does.
    exit when p_budget_kobo is not null and v_sent + e.payable_kobo > p_budget_kobo;
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
      v_sent := v_sent + e.payable_kobo;
    end if;
  end loop;
  update public.payout_runs set
    authors = (select count(*) from public.payouts where run_id = r.id),
    total_kobo = (select coalesce(sum(amount_kobo), 0) from public.payouts where run_id = r.id),
    status = 'sending'
  where id = r.id returning * into r;
  select count(*), coalesce(sum(payable_kobo), 0) into v_left_authors, v_left_kobo
  from public.author_earnings where cycle_id = c.id and status = 'payable';
  if not v_rest then
    update public.earning_cycles set status = 'releasing', approved_by = auth.uid(), approved_at = now()
    where id = c.id;
  end if;
  -- A release with nothing to send (every line held) is done at once instead of releasing for ever.
  perform public._finish_cycle(c.id);
  perform public.write_audit('money', case when v_rest then 'cycle.release_rest' else 'cycle.release' end,
    'earning_cycle', c.id::text, to_char(c.month, 'Mon YYYY'),
    format('Released %s: %s authors, %s kobo, %s held for a bank account, %s authors (%s kobo) approved, not sent',
           to_char(c.month, 'Mon YYYY'), r.authors, r.total_kobo, v_held, v_left_authors, v_left_kobo), null,
    jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo, 'held_unverified', v_held,
                       'budget_kobo', p_budget_kobo, 'left_authors', v_left_authors, 'left_kobo', v_left_kobo));
  return jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo,
    'held_unverified', v_held, 'left_authors', v_left_authors, 'left_kobo', v_left_kobo,
    'rest', v_rest, 'replayed', false);
end $$;

-- The full release keeps its behaviour (everything verified is sent; a second call replays).
create or replace function public._release_cycle_base(p_cycle uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public._release_cycle_send(p_cycle, null);
end $$;

-- Release in part (or send what is left): a code for release_payout, then up to p_budget_kobo.
create function public.release_cycle_part(p_cycle uuid, p_stepup uuid, p_budget_kobo bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if p_budget_kobo is null then
    perform public._raise('balance_too_low');
  end if;
  perform public._consume_stepup(p_stepup, 'release_payout');
  return public._release_cycle_send(p_cycle, p_budget_kobo);
end $$;

-- A month is Paid only when nothing is queued or pending and nothing is left approved, not sent.
create or replace function public._settle_payout(p_payout uuid, p_status public.payout_status, p_reason text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.payouts;
  e public.author_earnings;
  v_run uuid;
  v_cycle uuid;
begin
  select * into p from public.payouts where id = p_payout for update;
  if p.id is null or not public._transfer_status_applies(p.status, p_status) then
    return false;
  end if;
  update public.payouts set status = p_status,
    failure_reason = case when p_status in ('failed', 'reversed') then p_reason end,
    settled_at = case when p_status in ('successful', 'failed', 'reversed') then now() end
  where id = p.id;
  select * into e from public.author_earnings where id = p.author_earning_id;
  if p_status = 'successful' then
    update public.author_earnings set status = 'paid' where id = e.id;
  elsif p_status in ('failed', 'reversed') then
    -- The amount goes back to the author's payable balance on this line (rule 17).
    update public.author_earnings set status = 'partly_failed', held_reason = p_reason where id = e.id;
  end if;
  if p_status in ('successful', 'failed', 'reversed') then
    perform pgmq.send('user_notify', jsonb_build_object(
      'kind', case p_status when 'successful' then 'payout_paid' else 'payout_failed' end,
      'user_id', p.author_id, 'amount_kobo', p.amount_kobo, 'reference', p.reference));
  end if;
  -- Run and cycle finish when nothing is queued or pending.
  v_run := p.run_id;
  if not exists (select 1 from public.payouts where run_id = v_run and status in ('queued', 'pending')) then
    update public.payout_runs set status = case
        when exists (select 1 from public.payouts where run_id = v_run and status in ('failed', 'reversed'))
        then 'done_with_failures' else 'done' end::public.payout_run_status
    where id = v_run returning cycle_id into v_cycle;
    perform public._finish_cycle(v_cycle);
  end if;
  return true;
end $$;

revoke execute on function public._finish_cycle(uuid), public._release_cycle_send(uuid, bigint),
  public._settle_payout(uuid, public.payout_status, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.release_cycle_part(uuid, uuid, bigint) from public, anon, service_role;
grant execute on function public.release_cycle_part(uuid, uuid, bigint) to authenticated;
