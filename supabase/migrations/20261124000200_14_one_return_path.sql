-- Chapter charges (spend_credits) and the reader's own undo (flow 04 _undo_chapter) record the
-- chapter by chapter_uid only; chapter_id stays null. Flow 14's return keyed on chapter_id, so it
-- never locked the chapter again and never saw the reader's undo (a charge the reader had undone
-- could be paid back a second time by staff). Both helpers now fall back to chapter_uid.
create or replace function public._chapter_charge(p_ledger bigint)
returns table (txn_id uuid, user_id uuid, book_id uuid, chapter_id uuid, credits int, kobo int, charged_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.txn_id, min(l.user_id::text)::uuid, min(l.book_id::text)::uuid,
         coalesce(min(l.chapter_id::text)::uuid,
                  (select ch.id from public.chapters ch
                   left join public.books b on b.current_revision_id = ch.revision_id
                   where ch.chapter_uid = min(l.chapter_uid::text)::uuid
                   order by (b.id is null), ch.id limit 1)),
         -sum(l.delta)::int, sum(l.author_earning_kobo)::int, min(l.created_at)
  from public.credit_ledger l
  where l.txn_id = (select x.txn_id from public.credit_ledger x where x.id = p_ledger) and l.reason = 'chapter'
  group by l.txn_id
$$;

-- With no chapter row left to compare (p_chapter null) it can't tell, so it answers "undone": staff
-- are refused rather than risk paying a charge back twice.
create or replace function public._charge_undone(p_user uuid, p_chapter uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_chapter is null or exists (select 1 from public.credit_ledger l
                 where l.user_id = p_user and l.reason = 'undo' and l.created_at >= p_at
                   and (l.chapter_id = p_chapter
                        or l.chapter_uid = (select ch.chapter_uid from public.chapters ch where ch.id = p_chapter)))
$$;

-- Flow 14 · spec check 14-8: one path for returning a chapter charge. Flow 09's staff_return_chapter
-- reversed the charge itself (no Finance gate over 50 credits or a 4th return in 30 days, no
-- credit_returns row), so a charge could be returned twice through the two RPCs. It keeps its
-- checks and error codes, then hands over to flow 14's staff_return_chapter_charge. p_note stays in
-- the signature for old callers but isn't stored (no caller passes one; the reason is audited).
create or replace function public.staff_return_chapter(p_charge bigint, p_reason_code text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.credit_ledger;
  v_reason public.credit_return_reason;
  r jsonb;
begin
  if not (public.has_permission('answer_support') or public.has_permission('refund')) then
    raise exception 'Not allowed: return chapter' using errcode = 'insufficient_privilege';
  end if;
  v_reason := case p_reason_code when 'skipped_by_mistake' then 'skipped_ahead'
                                 when 'did_not_open' then 'did_not_open'
                                 when 'wrong_book' then 'wrong_book' end;
  if v_reason is null then
    perform public._raise('bad_reason');
  end if;
  select * into c from public.credit_ledger where id = p_charge;
  if not found or c.reason <> 'chapter' or c.delta >= 0 then
    perform public._raise('not_a_chapter_charge');
  end if;
  if exists (select 1 from public.credit_returns cr
             where cr.ledger_id = (select min(id) from public.credit_ledger where txn_id = c.txn_id and reason = 'chapter')
               and cr.state <> 'declined')
     or exists (select 1 from public.credit_ledger u join public.credit_ledger x on x.id = u.ref_ledger_id
                where x.txn_id = c.txn_id and u.reason = 'undo') then
    perform public._raise('already_returned');
  end if;
  if c.created_at > now() - make_interval(mins => (public._rules() ->> 'undo_minutes')::int) then
    perform public._raise('undo_window_open');
  end if;
  r := public.staff_return_chapter_charge(p_charge, v_reason);
  if r ->> 'state' = 'done' then
    -- Also by chapter_uid, for a charge whose chapter row is gone (same as flow 09 did).
    update public.entitlements set revoked_at = now(), revoked_reason = 'staff_return'
    where user_id = c.user_id and book_id = c.book_id and scope = 'chapter' and chapter_uid = c.chapter_uid
      and revoked_at is null;
  end if;
  return r || jsonb_build_object(
    'returned', case when r ->> 'state' = 'done' then (r ->> 'credits')::int else 0 end,
    'balance', public._balance(c.user_id));
end $$;
