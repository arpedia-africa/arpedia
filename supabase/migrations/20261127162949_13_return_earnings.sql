-- Flow 13 · spec check 13-6 (rule 4, rule 8): a chapter returned by Support through flow 14
-- (_do_credit_return) writes 'refund' rows with no ref_ledger_id. close_cycle only knew the reader's
-- own 'undo' rows, so a Support return
--   * got no staff_return exclusion ("what was not paid" missed it),
--   * was left out of book_credits while its negative kobo still netted the amount, so a line's
--     credits no longer equalled amount ÷ 160,
--   * was never seen as a late event when the charge was from an earlier, closed month.
-- Now the return rows name the charge they reverse (ref_ledger_id), and close_cycle treats a
-- credit_return refund like an undo. Rows written before this change are matched by their
-- idempotency key ('credit_return:<charge id>'); the ledger itself is never edited.

-- The charge row a reversal undoes: an undo or staff return's ref_ledger_id, or for a flow 14
-- return row written before ref_ledger_id was set, the id in its idempotency key. Null otherwise.
create or replace function public._reversal_of(p_reason text, p_ref_type text, p_ref_ledger bigint, p_key text)
returns bigint
language sql immutable set search_path = '' as $$
  select case
    when p_reason = 'undo' then p_ref_ledger
    when p_reason = 'refund' and p_ref_type = 'credit_return'
      then coalesce(p_ref_ledger, nullif(substring(p_key from '^credit_return:([0-9]+)$'), '')::bigint)
  end
$$;
revoke all on function public._reversal_of(text, text, bigint, text) from public, anon, authenticated;

create or replace function public._do_credit_return(p_return uuid, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.credit_returns;
  v_txn uuid := gen_random_uuid();
  v_rows int;
begin
  select * into r from public.credit_returns where id = p_return for update;
  -- Same lock as staff_return_chapter_charge, then re-check the reader's own undo: a return that
  -- waited for Finance must never pay back a charge the reader already undid.
  perform 1 from public.profiles where id = r.user_id for update;
  if public._charge_undone(r.user_id, r.chapter_id,
                           (select l.created_at from public.credit_ledger l where l.id = r.ledger_id)) then
    raise exception 'already_undone' using errcode = '23505';
  end if;
  -- One staff-return row per bucket row of the charge; author earning reversed on each.
  -- ref_ledger_id names the charge row it reverses (flow 13 close_cycle: exclusion, late adjustment).
  insert into public.credit_ledger (user_id, delta, reason, bucket, expires_at, txn_id, ref_type, ref_id, idempotency_key,
                                    book_id, chapter_id, author_id, author_earning_kobo, actor_id, note, ref_ledger_id)
  select l.user_id, -l.delta, 'refund', l.bucket, l.expires_at, v_txn, 'credit_return', r.id::text,
         'credit_return:' || l.id, l.book_id, l.chapter_id, l.author_id, -l.author_earning_kobo, p_actor, 'Staff return',
         l.id
  from public.credit_ledger l
  where l.txn_id = (select x.txn_id from public.credit_ledger x where x.id = r.ledger_id) and l.reason = 'chapter'
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'already_returned' using errcode = '23505';
  end if;
  update public.entitlements e set revoked_at = now(), revoked_reason = 'staff_return'
  from public.chapters ch
  where ch.id = r.chapter_id and e.user_id = r.user_id and e.book_id = r.book_id and e.scope = 'chapter'
    and e.chapter_uid = ch.chapter_uid and e.revoked_at is null;
  update public.credit_returns set state = 'done', return_txn_id = v_txn, decided_at = now(),
    approved_by = case when state = 'pending_approval' then p_actor else approved_by end
  where id = r.id;
  return v_txn;
end $$;

create or replace function public._close_cycle(p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := public._cycle_start(p_month);
  v_end timestamptz := public._cycle_end(p_month);
  st public.earning_settings := public._earning_settings();
  c public.earning_cycles;
  v_lines int;
  v_check jsonb;
  v_lines_kobo bigint;
  v_excl_kobo bigint;
  v_adj_in_window bigint;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    perform public._raise('bad_month');
  end if;
  if now() < v_end then
    perform public._raise('month_not_ended');
  end if;
  insert into public.earning_cycles (month) values (p_month) on conflict (month) do nothing;
  select * into c from public.earning_cycles where month = p_month for update;
  if c.legacy or c.status not in ('open', 'closed') then
    perform public._raise('cycle_locked', jsonb_build_object('status', c.status));
  end if;

  -- Re-run: undo this cycle's own work first (nothing has been paid from it yet).
  update public.author_earnings set carried_to = null
  where carried_to in (select id from public.author_earnings where cycle_id = c.id);
  update public.earning_exclusions set cycle_id = null where cycle_id = c.id;
  delete from public.author_earnings where cycle_id = c.id;

  -- Self-reads never earn (rule 4): record them so the month excludes them.
  insert into public.earning_exclusions (ledger_id, reason, credits, kobo)
  select l.id, 'self_read', -l.delta, l.author_earning_kobo
  from public.credit_ledger l
  where l.author_id is not null and l.user_id = l.author_id and l.author_earning_kobo <> 0
    and l.created_at >= v_start and l.created_at < v_end
  on conflict (ledger_id, reason) do nothing;
  -- Undone and returned chapters: counted for "what was not paid" (their reversal rows net).
  -- Flow 14 Support returns are 'refund' rows (ref_type credit_return): staff_return too.
  insert into public.earning_exclusions (ledger_id, reason, credits, kobo)
  select public._reversal_of(l.reason::text, l.ref_type, l.ref_ledger_id, l.idempotency_key),
         case when l.idempotency_key like 'return:%' or l.reason::text = 'refund' then 'staff_return' else 'undone' end
           ::public.earning_exclusion_reason,
         l.delta, -l.author_earning_kobo
  from public.credit_ledger l
  where l.author_id is not null
    and public._reversal_of(l.reason::text, l.ref_type, l.ref_ledger_id, l.idempotency_key) is not null
    and l.created_at >= v_start and l.created_at < v_end
  on conflict (ledger_id, reason) do nothing;
  -- This cycle accounts for every exclusion not yet picked up whose row is this month or earlier.
  update public.earning_exclusions x set cycle_id = c.id
  from public.credit_ledger l
  where l.id = x.ledger_id and x.cycle_id is null and l.created_at < v_end;

  with lr as (
    select l.*,
      -- Excluded rows are left out (self-read, gift loop, takedown, refund clawback).
      exists (select 1 from public.earning_exclusions x
              where x.ledger_id = l.id and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback'))
        as excluded,
      -- A reversal of a charge from an earlier month is a late event: an adjustment (rule 8).
      exists (select 1 from public.credit_ledger o
              where o.id = public._reversal_of(l.reason::text, l.ref_type, l.ref_ledger_id, l.idempotency_key)
                and o.created_at < v_start) as late,
      public._reversal_of(l.reason::text, l.ref_type, l.ref_ledger_id, l.idempotency_key) is not null as reversal
    from public.credit_ledger l
    where l.author_id is not null and l.author_earning_kobo <> 0
      and l.created_at >= v_start and l.created_at < v_end
  ),
  -- Late exclusions (gift loop found after its month closed) come off this cycle as an adjustment.
  late_excl as (
    select l.author_id, -sum(x.kobo) as kobo
    from public.earning_exclusions x join public.credit_ledger l on l.id = x.ledger_id
    where x.cycle_id = c.id and l.created_at < v_start
      and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback')
    group by l.author_id
  ),
  carry as (
    select e.author_id, sum(e.payable_kobo) as kobo
    from public.author_earnings e join public.earning_cycles pc on pc.id = e.cycle_id
    -- Only from released months: an unreleased month still pays its own lines.
    where pc.month < p_month and e.carried_to is null
      and pc.status in ('releasing', 'paid', 'paid_with_failures')
      and e.status in ('carried', 'held_unverified', 'held_paused', 'held_dispute')
    group by e.author_id
  ),
  per_author as (
    select a.author_id,
      coalesce(sum(-r.delta) filter (where not r.excluded and not r.late
                                     and (r.reason in ('unlock_all', 'chapter', 'undo')
                                          or (r.reason = 'refund' and r.reversal))), 0)::int as book_credits,
      coalesce(sum(-r.delta) filter (where not r.excluded and not r.late
                                     and r.reason in ('tip', 'message')), 0)::int as tm_credits,
      coalesce(sum(-r.delta) filter (where r.excluded), 0)::int as excl_credits,
      coalesce(sum(r.author_earning_kobo) filter (where not r.excluded and not r.late), 0)::bigint as amount,
      coalesce(sum(r.author_earning_kobo) filter (where not r.excluded and r.late), 0)::bigint as late_kobo
    from (select author_id from lr union select author_id from late_excl union select author_id from carry) a
    left join lr r on r.author_id = a.author_id
    group by a.author_id
  ),
  lines as (
    select p.*, coalesce(cr.kobo, 0)::bigint as carry_in,
      (p.late_kobo + coalesce(le.kobo, 0))::bigint as adjustment
    from per_author p
    left join carry cr on cr.author_id = p.author_id
    left join late_excl le on le.author_id = p.author_id
  )
  insert into public.author_earnings (cycle_id, author_id, book_credits, tip_message_credits, excluded_credits,
                                      amount_kobo, carry_in_kobo, adjustment_kobo, payable_kobo, status, held_reason)
  select c.id, l.author_id, l.book_credits, l.tm_credits, l.excl_credits, l.amount, l.carry_in, l.adjustment,
         l.amount + l.carry_in + l.adjustment, s.status, s.held_reason
  from lines l
  cross join lateral public._line_status(l.author_id, l.amount + l.carry_in + l.adjustment, st.min_payout_kobo) s
  where l.amount <> 0 or l.carry_in <> 0 or l.adjustment <> 0 or l.excl_credits <> 0;
  get diagnostics v_lines = row_count;

  -- Carried-in lines now live in this cycle.
  update public.author_earnings e set carried_to = n.id
  from public.author_earnings n, public.earning_cycles pc
  where n.cycle_id = c.id and n.author_id = e.author_id and pc.id = e.cycle_id and pc.month < p_month
    and pc.status in ('releasing', 'paid', 'paid_with_failures')
    and e.carried_to is null and e.status in ('carried', 'held_unverified', 'held_paused', 'held_dispute');

  -- ledger_check: every earning row of the month is in a line, an exclusion or an adjustment.
  v_check := public._cycle_ledger(p_month);
  select coalesce(sum(amount_kobo), 0) into v_lines_kobo from public.author_earnings where cycle_id = c.id;
  select coalesce(sum(l.author_earning_kobo), 0) into v_excl_kobo
  from public.credit_ledger l
  where l.created_at >= v_start and l.created_at < v_end and l.author_id is not null
    and exists (select 1 from public.earning_exclusions x where x.ledger_id = l.id
                and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback'));
  select coalesce(sum(l.author_earning_kobo), 0) into v_adj_in_window
  from public.credit_ledger l
  where l.created_at >= v_start and l.created_at < v_end and l.author_id is not null
    and exists (select 1 from public.credit_ledger o
                where o.id = public._reversal_of(l.reason::text, l.ref_type, l.ref_ledger_id, l.idempotency_key)
                  and o.created_at < v_start)
    and not exists (select 1 from public.earning_exclusions x where x.ledger_id = l.id
                    and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback'));
  v_check := v_check || jsonb_build_object('lines_kobo', v_lines_kobo, 'excluded_kobo', v_excl_kobo,
    'late_kobo', v_adj_in_window,
    'diff_kobo', (v_check ->> 'ledger_kobo')::bigint - v_lines_kobo - v_excl_kobo - v_adj_in_window,
    'checked_at', now());

  update public.earning_cycles set
    status = 'closed',
    closed_at = coalesce(closed_at, now()),
    hold_days = st.hold_days,
    min_payout_kobo = st.min_payout_kobo,
    payout_date = public._payout_date(coalesce(closed_at, now()), st.hold_days, st.payout_day),
    credits_books = (select coalesce(sum(book_credits), 0) from public.author_earnings where cycle_id = c.id),
    credits_tips_messages = (select coalesce(sum(tip_message_credits), 0) from public.author_earnings
                             where cycle_id = c.id),
    earnings_kobo = v_lines_kobo,
    ledger_check = v_check
  where id = c.id
  returning * into c;

  if auth.uid() is not null then
    perform public.write_audit('money', 'cycle.close', 'earning_cycle', c.id::text, to_char(p_month, 'Mon YYYY'),
      format('Closed %s: %s authors, %s kobo', to_char(p_month, 'Mon YYYY'), v_lines, v_lines_kobo));
  end if;
  return jsonb_build_object('cycle_id', c.id, 'authors', v_lines, 'earnings_kobo', c.earnings_kobo,
    'payout_date', c.payout_date, 'ledger_check', c.ledger_check);
end $$;
