-- Flow 14 · spec check 14-11 (rule 38, open question 3 default): staff credit grants by tier.
-- Support grants up to 200 at once; Operations and Super admins up to 500. Anything above the
-- caller's tier waits: a Support grant of 201 to 500 for an Operations admin, Finance or a Super
-- admin; any grant over 500 for Finance or a Super admin; never the person who asked.
-- Removing credits needs Finance (or a Super admin): up to 500 at once, more waits for a second
-- Finance or Super admin. A removal never takes a balance below zero.
-- "Tell the reader" sends one notice (user_notify `credits_granted`) only once a grant is in the
-- balance: at once for a grant inside the tier, on approval for one that waited, never when it is
-- turned down. The flow 09 function is replaced (same first three arguments, so old callers work).

alter table public.credit_grant_requests
  add column kind text not null default 'add' check (kind in ('add', 'remove')),
  add column notify boolean not null default false,
  add column message text check (char_length(message) <= 300);

-- The matrix note follows rule 38 (was "Up to 500").
update public.role_permissions set limit_note = 'Up to 200'
where role = 'support' and permission = 'grant_credits';

-- How many credits the caller may grant at once (0 = none).
create function public._grant_tier() returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when not public.has_permission('grant_credits') then 0
    when public.is_staff_any(array['operations_admin']::public.staff_role[]) then 500
    else 200
  end
$$;

-- Queue the reader's notice for an applied grant (dispatcher: workers/api/src/routes/15/notify.ts).
create function public._grant_notice(p_user uuid, p_credits integer, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'credits_granted', 'user_id', p_user,
    'credits', p_credits, 'message', nullif(trim(coalesce(p_message, '')), '')));
end $$;

-- Take credits off a reader: top-ups first (a refunded top-up is the usual case), then promo,
-- rollover and plan. All rows share one transaction id. Caller holds the reader's advisory lock.
create function public._remove_credits(p_user uuid, p_credits integer, p_reason text, p_actor uuid,
                                       p_meta jsonb default '{}') returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  b public.credit_balances;
  v_txn uuid := gen_random_uuid();
  v_left int := p_credits;
  v_take int;
  v_first bigint;
  v_id bigint;
  k public.ledger_bucket;
begin
  select * into b from public.credit_balances where user_id = p_user;
  if coalesce(b.topup + b.promo + b.rollover + b.plan, 0) < p_credits then
    perform public._raise('not_enough_credits');
  end if;
  foreach k in array array['topup', 'promo', 'rollover', 'plan']::public.ledger_bucket[] loop
    exit when v_left = 0;
    v_take := least(v_left, case k when 'topup' then b.topup when 'promo' then b.promo
                                     when 'rollover' then b.rollover else b.plan end);
    if v_take > 0 then
      v_id := public._ledger_add(p_user, -v_take, 'staff_adjust', k, v_txn, null, null,
        'staff', p_actor::text, p_reason, coalesce(p_meta, '{}'), p_actor);
      v_first := coalesce(v_first, v_id);
      v_left := v_left - v_take;
    end if;
  end loop;
  return v_first;
end $$;

drop function public.staff_grant_credits(uuid, integer, text);

create function public.staff_grant_credits(p_user uuid, p_credits integer, p_reason text,
                                           p_notify boolean default false, p_message text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_tier int;
  v_id bigint;
  v_req uuid;
begin
  perform public.require_permission('grant_credits');
  v_tier := public._grant_tier();
  if p_credits is null or p_credits <= 0 or p_credits > 100000 then
    perform public._raise('bad_amount');
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    perform public._raise('reason_required');
  end if;
  if char_length(coalesce(p_message, '')) > 300 then
    perform public._raise('message_too_long');
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    perform public._raise('unknown_user');
  end if;
  if p_credits > v_tier then
    insert into public.credit_grant_requests (user_id, credits, reason, requested_by, kind, notify, message)
    values (p_user, p_credits, trim(p_reason), v_actor, 'add', coalesce(p_notify, false),
            nullif(trim(coalesce(p_message, '')), ''))
    returning id into v_req;
    perform public.write_audit('money', 'request_credit_grant', 'user', p_user::text, null,
      format('Asked to grant %s credits', p_credits), null,
      jsonb_build_object('request_id', v_req, 'tier', v_tier), p_reason);
    return jsonb_build_object('status', 'pending', 'request_id', v_req,
      'approver', case when p_credits > 500 then 'finance' else 'operations_admin' end);
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  v_id := public._ledger_add(p_user, p_credits, 'staff_adjust', 'promo', gen_random_uuid(), null, null,
    'staff', v_actor::text, trim(p_reason), '{}', v_actor);
  perform public.write_audit('money', 'grant_credits', 'user', p_user::text, null,
    format('Granted %s credits', p_credits), null, jsonb_build_object('ledger_id', v_id), p_reason);
  if coalesce(p_notify, false) then
    perform public._grant_notice(p_user, p_credits, p_message);
  end if;
  return jsonb_build_object('status', 'applied', 'ledger_id', v_id);
end $$;

create function public.staff_remove_credits(p_user uuid, p_credits integer, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id bigint;
  v_req uuid;
begin
  perform public._require_money_staff();
  if p_credits is null or p_credits <= 0 or p_credits > 100000 then
    perform public._raise('bad_amount');
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    perform public._raise('reason_required');
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    perform public._raise('unknown_user');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  if coalesce((select topup + promo + rollover + plan from public.credit_balances where user_id = p_user), 0)
     < p_credits then
    perform public._raise('not_enough_credits');
  end if;
  if p_credits > 500 then
    insert into public.credit_grant_requests (user_id, credits, reason, requested_by, kind)
    values (p_user, p_credits, trim(p_reason), v_actor, 'remove') returning id into v_req;
    perform public.write_audit('money', 'request_credit_removal', 'user', p_user::text, null,
      format('Asked to remove %s credits', p_credits), null, jsonb_build_object('request_id', v_req), p_reason);
    return jsonb_build_object('status', 'pending', 'request_id', v_req, 'approver', 'finance');
  end if;
  v_id := public._remove_credits(p_user, p_credits, trim(p_reason), v_actor);
  perform public.write_audit('money', 'remove_credits', 'user', p_user::text, null,
    format('Removed %s credits', p_credits), null, jsonb_build_object('ledger_id', v_id), p_reason);
  return jsonb_build_object('status', 'applied', 'ledger_id', v_id);
end $$;

-- Second person. Finance and Super admins decide everything; an Operations admin may also decide
-- a grant (not a removal) of 500 or less, which only a Support request can be.
create or replace function public.decide_credit_grant(p_request uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  r public.credit_grant_requests;
  v_id bigint;
  v_word text;
begin
  if not (public.staff_mfa_ok()
          and public.is_staff_any(array['finance', 'operations_admin']::public.staff_role[])) then
    raise exception 'Not allowed: money' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.credit_grant_requests where id = p_request for update;
  if not found then
    perform public._raise('not_pending');
  end if;
  if not (public.staff_mfa_ok()
          and (public.is_staff('finance')
               or (r.kind = 'add' and r.credits <= 500
                   and public.is_staff_any(array['operations_admin']::public.staff_role[])))) then
    raise exception 'Not allowed: money' using errcode = 'insufficient_privilege';
  end if;
  if r.status <> 'pending' then
    perform public._raise('not_pending');
  end if;
  if r.requested_by = v_actor then
    perform public._raise('same_person');
  end if;
  v_word := case r.kind when 'remove' then 'removal' else 'grant' end;
  if not p_approve then
    update public.credit_grant_requests set status = 'rejected', approved_by = v_actor, decided_at = now()
    where id = r.id;
    perform public.write_audit('money', 'reject_credit_' || v_word, 'user', r.user_id::text, null,
      format('Rejected a %s credit %s', r.credits, v_word), null, jsonb_build_object('request_id', r.id),
      r.reason);
    return jsonb_build_object('status', 'rejected');
  end if;
  perform pg_advisory_xact_lock(hashtext(r.user_id::text));
  if r.kind = 'remove' then
    v_id := public._remove_credits(r.user_id, r.credits, r.reason, r.requested_by,
      jsonb_build_object('request_id', r.id, 'approved_by', v_actor));
  else
    v_id := public._ledger_add(r.user_id, r.credits, 'staff_adjust', 'promo', gen_random_uuid(),
      'grant_request:' || r.id, null, 'staff', r.requested_by::text, r.reason,
      jsonb_build_object('request_id', r.id, 'approved_by', v_actor), r.requested_by);
  end if;
  update public.credit_grant_requests set status = 'applied', approved_by = v_actor, decided_at = now(),
    ledger_id = v_id where id = r.id;
  perform public.write_audit('money', 'approve_credit_' || v_word, 'user', r.user_id::text, null,
    format('Approved a %s credit %s', r.credits, v_word), null,
    jsonb_build_object('request_id', r.id, 'ledger_id', v_id), r.reason);
  if r.kind = 'add' and r.notify then
    perform public._grant_notice(r.user_id, r.credits, r.message);
  end if;
  return jsonb_build_object('status', 'applied', 'ledger_id', v_id);
end $$;

revoke all on function public._grant_tier() from public, anon, authenticated, service_role;
revoke all on function public._grant_notice(uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public._remove_credits(uuid, integer, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.staff_grant_credits(uuid, integer, text, boolean, text) from public, anon;
revoke all on function public.staff_remove_credits(uuid, integer, text) from public, anon;
grant execute on function public.staff_grant_credits(uuid, integer, text, boolean, text) to authenticated;
grant execute on function public.staff_remove_credits(uuid, integer, text) to authenticated;
