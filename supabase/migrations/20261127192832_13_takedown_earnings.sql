-- Flow 13 · spec check 13-4 (flow 13 rule 5, flow 14 rule 31, open question 6 default).
-- A book taken down after a copyright claim is upheld has its earnings held back from the claim
-- date: decide_claim('uphold') now writes an `earning_exclusions` row (reason takedown) for every
-- earning row of that book since the claim was opened. Earnings before the claim date stay paid
-- (open question 6 default). close_cycle already nets takedown exclusions, and one found after
-- its month closed becomes a negative adjustment in the next cycle (rule 8).
--
-- Charges and their reversals (reader undo, Support return) are excluded together so they still
-- net to zero; a reversal written after the uphold (undo window) is excluded by a trigger.
--
-- The whole-line hold of 14-9 (claim_hold_at) stays while a claim is open. Once the claim is
-- upheld the book's money is held back by these exclusions, so a taken-down book with no open
-- claim no longer holds the author's other books.

create or replace function public._exclude_takedown(p_book uuid, p_since timestamptz, p_actor uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  insert into public.earning_exclusions (ledger_id, reason, credits, kobo, actor_id)
  select l.id, 'takedown', -l.delta, l.author_earning_kobo, p_actor
  from public.credit_ledger l
  where l.book_id = p_book and l.author_id is not null and l.author_earning_kobo <> 0
    and l.created_at >= p_since
  on conflict (ledger_id, reason) do nothing;
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function public._exclude_takedown(uuid, timestamptz, uuid) from public, anon, authenticated;

-- A reversal of a charge already held back for a takedown is held back too, so the pair nets to 0.
create or replace function public._takedown_reversal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_orig bigint := public._reversal_of(new.reason::text, new.ref_type, new.ref_ledger_id, new.idempotency_key);
begin
  if v_orig is not null and new.author_earning_kobo <> 0
     and exists (select 1 from public.earning_exclusions x where x.ledger_id = v_orig and x.reason = 'takedown') then
    insert into public.earning_exclusions (ledger_id, reason, credits, kobo)
    values (new.id, 'takedown', -new.delta, new.author_earning_kobo)
    on conflict (ledger_id, reason) do nothing;
  end if;
  return null;
end $$;
revoke all on function public._takedown_reversal() from public, anon, authenticated;

create trigger credit_ledger_takedown_reversal after insert on public.credit_ledger
  for each row when (new.author_id is not null and new.author_earning_kobo <> 0)
  execute function public._takedown_reversal();

create or replace function public.decide_claim(p_claim uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := public._require_trust_staff(array['publisher', 'operations_admin']::public.staff_role[], 'decide_claim');
  c public.copyright_claims;
  b public.books;
  v_excluded int := 0;
begin
  if p_decision not in ('reject', 'uphold') then
    raise exception 'bad_decision' using errcode = '22023';
  end if;
  if nullif(btrim(p_note), '') is null then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  select * into c from public.copyright_claims where id = p_claim for update;
  if c.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if c.status in ('upheld', 'rejected') then
    raise exception 'already_decided:%', public._staff_name(c.decided_by) using errcode = '40001';
  end if;
  select * into b from public.books where id = c.book_id for update;
  if p_decision = 'uphold' then
    update public.books set status = 'taken_down', claim_hold_at = coalesce(claim_hold_at, now()) where id = b.id;
    update public.book_revisions set status = 'taken_down' where id = b.current_revision_id and status = 'live';
    -- Held back from the claim date (open question 6: earnings before the claim stay paid).
    v_excluded := public._exclude_takedown(b.id, c.created_at, v_me);
  elsif not exists (select 1 from public.copyright_claims x where x.book_id = b.id and x.id <> c.id
                      and x.status in ('new', 'waiting_on_author')) then
    update public.books set claim_hold_at = null where id = b.id;
  end if;
  update public.copyright_claims set status = case when p_decision = 'uphold' then 'upheld' else 'rejected' end::public.claim_status,
    decided_by = v_me, decided_at = now(), decision_note = btrim(p_note)
  where id = c.id;
  if c.report_id is not null then
    update public.reports set status = 'resolved', outcome = case when p_decision = 'uphold' then 'removed' else 'dismissed' end::public.report_outcome,
      decided_by = v_me, resolved_at = now(), first_action_at = coalesce(first_action_at, now())
    where content_type = 'book' and content_id = b.id and reason = 'copyright' and status <> 'resolved';
  end if;
  perform public._trust_notify('claim_decided', jsonb_build_object('book_id', b.id, 'claim_id', c.id,
    'decision', p_decision, 'message', p_note, 'email', true));
  perform public.write_audit('trust', 'claim.' || p_decision, 'claim', c.id::text, c.ref,
    case when p_decision = 'uphold' then 'Claim upheld, book taken down' else 'Claim rejected' end,
    jsonb_build_object('book_status', b.status), jsonb_build_object('book_status',
      case when p_decision = 'uphold' then 'taken_down' else b.status::text end,
      'earnings_held_back_rows', v_excluded), p_note);
end $$;

-- 14-9 hold, narrowed: a taken-down book with no open claim is settled by its exclusions.
create or replace function public._line_status(p_author uuid, p_payable bigint, p_min bigint)
returns table (status public.author_earning_status, held_reason text)
language sql stable security definer set search_path = '' as $$
  select
    case
      when p_payable < p_min then 'carried'::public.author_earning_status
      when a.status::text = 'suspended' then 'held_dispute'
      when held.title is not null then 'held_dispute'
      when coalesce(a.payouts_paused, false) or h.id is not null then 'held_paused'
      when not exists (select 1 from public.author_bank_accounts b
                       where b.author_id = p_author and b.status = 'verified') then 'held_unverified'
      else 'payable'
    end,
    case
      when p_payable < p_min then null
      when a.status::text = 'suspended' then coalesce(a.suspended_reason, 'Author suspended')
      when held.title is not null then 'Claim open on ' || held.title
      when coalesce(a.payouts_paused, false) or h.id is not null
        then coalesce(h.reason, a.payouts_paused_reason, 'Payouts paused')
      when not exists (select 1 from public.author_bank_accounts b
                       where b.author_id = p_author and b.status = 'verified') then 'Bank account not verified'
    end
  from (select 1) one
  left join public.author_profiles a on a.user_id = p_author
  left join public.payout_holds h on h.author_id = p_author and h.lifted_at is null
  left join lateral (select bk.title from public.books bk
                     where bk.author_id = p_author and bk.claim_hold_at is not null
                       and (bk.status::text <> 'taken_down'
                            or exists (select 1 from public.copyright_claims x where x.book_id = bk.id
                                       and x.status in ('new', 'waiting_on_author')))
                     order by bk.claim_hold_at limit 1) held on true
$$;
