-- Flow 16 fix · plan price changes are two-person (rule 17: Finance proposes, a Super admin
-- confirms; nobody approves their own request; default Q1: two-person for plan prices, code only for
-- pricing rules). save_plan used to write the new price straight away.
-- Now a change to a plan's web price, credits or bonus becomes a `price_change` approval request; a
-- different Super admin confirms it with a fresh 2-step code (decide_approval), which writes the
-- price version. Name, badge and date-only edits still save directly.

-- Validate a plan change and write its price version. Used on direct saves and on confirmation, so
-- the plan check runs again against the rules in force when the change is confirmed.
create function public._apply_plan_change(p jsonb, p_by uuid, p_summary text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := p ->> 'plan_code';
  v_before jsonb := public._plan(v_code);
  v_price bigint := (p ->> 'price_web_kobo')::bigint;
  v_credits integer := (p ->> 'credits')::integer;
  v_bonus integer := coalesce((p ->> 'bonus_credits')::integer, 0);
  v_check jsonb;
begin
  if v_before is null then
    perform public._raise('unknown_plan');
  end if;
  if char_length(trim(coalesce(p ->> 'name', ''))) not between 1 and 40 or v_price is null or v_price <= 0
     or v_credits is null or v_credits <= 0 or v_bonus < 0 then
    perform public._raise('bad_plan');
  end if;
  v_check := public._plan_check(public._rules(), jsonb_build_object(v_code, jsonb_build_object(
    'price_web_kobo', v_price, 'credits', v_credits, 'bonus_credits', v_bonus)));
  if exists (select 1 from jsonb_array_elements(v_check) x where not (x ->> 'ok')::boolean) then
    perform public._raise('plan_check_failed', jsonb_build_object('check', v_check));
  end if;
  insert into public.plan_price_versions (plan_code, name, badge, price_web_kobo, credits, bonus_credits,
                                          effective_from, changed_by, note)
  values (v_code, trim(p ->> 'name'), nullif(trim(coalesce(p ->> 'badge', '')), ''), v_price, v_credits, v_bonus,
          greatest(coalesce((p ->> 'effective_from')::timestamptz, now()), now()), p_by, p ->> 'note');
  perform public.write_audit('money', 'save_plan', 'plan', v_code, trim(p ->> 'name'), p_summary, v_before,
    p - 'plan_code', p ->> 'note');
  return public._plan(v_code);
end $$;
revoke all on function public._apply_plan_change(jsonb, uuid, text) from public, anon, authenticated;

-- Same signature and checks as before. A money change returns the current plan plus
-- `pending_request` (the approval request id); nothing changes until a Super admin confirms.
create or replace function public.save_plan(p_code text, p_name text, p_badge text, p_price_web_kobo bigint,
                                            p_credits integer, p_bonus integer, p_effective_from timestamptz,
                                            p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := public._plan(p_code);
  v_payload jsonb;
  v_check jsonb;
  r public.approval_requests;
begin
  perform public._require_price_staff();
  if not public.is_staff('finance') then
    raise exception 'Not allowed: change_prices' using errcode = 'insufficient_privilege';
  end if;
  if v_before is null then
    perform public._raise('unknown_plan');
  end if;
  v_payload := jsonb_build_object('plan_code', p_code, 'name', trim(coalesce(p_name, '')), 'badge', p_badge,
    'price_web_kobo', p_price_web_kobo, 'credits', p_credits, 'bonus_credits', coalesce(p_bonus, 0),
    'effective_from', coalesce(p_effective_from, now()), 'note', p_note);
  -- One open change per plan, so two confirmations can never race, and a direct name edit can't be
  -- undone by confirming an older proposal.
  perform pg_advisory_xact_lock(hashtext('price_change:' || p_code));
  if exists (select 1 from public.approval_requests a where a.kind = 'price_change' and a.status = 'pending'
             and a.expires_at > now() and a.payload ->> 'plan_code' = p_code) then
    perform public._raise('change_pending');
  end if;
  if p_price_web_kobo is not distinct from (v_before ->> 'price_web_kobo')::bigint
     and p_credits is not distinct from (v_before ->> 'credits')::integer
     and coalesce(p_bonus, 0) = (v_before ->> 'bonus_credits')::integer then
    return public._apply_plan_change(v_payload, auth.uid(), 'Changed plan');
  end if;

  -- A money change: check it now so Finance hears about a failing plan check straight away.
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 or p_price_web_kobo is null
     or p_price_web_kobo <= 0 or p_credits is null or p_credits <= 0 or coalesce(p_bonus, 0) < 0 then
    perform public._raise('bad_plan');
  end if;
  v_check := public._plan_check(public._rules(), jsonb_build_object(p_code, jsonb_build_object(
    'price_web_kobo', p_price_web_kobo, 'credits', p_credits, 'bonus_credits', coalesce(p_bonus, 0))));
  if exists (select 1 from jsonb_array_elements(v_check) x where not (x ->> 'ok')::boolean) then
    perform public._raise('plan_check_failed', jsonb_build_object('check', v_check));
  end if;
  r := public.request_approval('price_change', v_payload, p_note);
  return v_before || jsonb_build_object('pending_request', r.id);
end $$;

-- decide_approval as in flow 16, plus: confirming a price change needs a fresh 2-step code and
-- writes the price version (as the person who proposed it). If the plan check now fails, nothing
-- is decided and the Super admin can reject it instead.
create or replace function public.decide_approval(p_id uuid, p_approve boolean, p_reason text default null)
returns public.approval_requests
language plpgsql security definer set search_path = '' as $$
declare
  r public.approval_requests;
begin
  select * into r from public.approval_requests where id = p_id for update;
  if not found or not (public.staff_mfa_ok() and exists (select 1 from public.staff_roles s
          where s.user_id = auth.uid() and s.active and s.role = any (public._approval_roles(r.kind, true)))) then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if r.requested_by = auth.uid() then
    perform public._raise('own_request');
  end if;
  if r.status <> 'pending' then
    perform public._raise('already_decided');
  end if;
  if r.expires_at < now() then
    update public.approval_requests set status = 'expired' where id = p_id;
    perform public._raise('request_expired');
  end if;
  if r.kind = 'price_change' and p_approve then
    perform public._require_price_staff();
  end if;
  update public.approval_requests
    set status = case when p_approve then 'approved' else 'rejected' end, approver_id = auth.uid(),
        decided_at = now(), reason = coalesce(nullif(trim(coalesce(p_reason, '')), ''), reason)
    where id = p_id returning * into r;
  perform public.write_audit(case when r.kind in ('payout_release', 'price_change') then 'money' else 'team' end,
    case when p_approve then 'approval.approve' else 'approval.reject' end, 'approval_request', r.id::text,
    r.kind, case when p_approve then 'Approved' else 'Rejected' end, null, to_jsonb(r), p_reason);
  if r.kind = 'price_change' and p_approve then
    perform public._apply_plan_change(r.payload, r.requested_by, 'Changed plan (confirmed by a Super admin)');
  end if;
  return r;
end $$;
