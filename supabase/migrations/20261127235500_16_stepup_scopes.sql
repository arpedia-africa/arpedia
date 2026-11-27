-- Flow 16 · spec check 16-3 (rule 6): releasing a payout, confirming a price change and exporting
-- personal details each need a fresh code that is single-use and valid for 5 minutes. Until now they
-- took any two-step proof from the last 10 minutes, which can be reused. Each RPC now takes the
-- step-up id from verify_stepup (scopes release_payout, confirm_price_change, export_personal) and
-- consumes it first, in the same transaction, so a failed call leaves the code unused.
-- The originals are wrapped rather than copied (renamed *_base, no longer callable by clients).

-- True when this transaction consumed a step-up for `p_scope` (consumed_at = now() only for a row
-- consumed in the current transaction). Clients cannot write staff_stepups, so this can't be faked.
create function public._stepup_used_now(p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_stepups
                 where user_id = auth.uid() and scope = p_scope and consumed_at = now())
$$;

-- A step-up made from a backup code does not renew the session's two-step time, so the fresh-code
-- checks also accept a step-up consumed in this transaction. save_earning_settings and save_plan keep
-- the 10-minute two-step check (rule 6 does not list them).
create or replace function public._require_payout_super(p_fresh boolean default false) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_staff('super_admin') and public.has_permission('release_payouts')) then
    raise exception 'Not allowed: Super admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_fresh and not (public._stepup_used_now('release_payout')
                      or coalesce(public.staff_mfa_verified_at() > now() - interval '10 minutes', false)) then
    raise exception 'two_step_required' using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function public._require_price_staff() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('change_prices')
          and (public._stepup_used_now('confirm_price_change')
               or coalesce(public.staff_mfa_verified_at() > now() - interval '10 minutes', false))) then
    raise exception 'Not allowed: change_prices' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Release a prepared month (flow 13 rule 15): a code for release_payout, then the release itself.
alter function public.release_cycle(uuid) rename to _release_cycle_base;
create function public.release_cycle(p_cycle uuid, p_stepup uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._consume_stepup(p_stepup, 'release_payout');
  return public._release_cycle_base(p_cycle);
end $$;

-- Confirming a price change needs a code for confirm_price_change; other decisions (and rejecting a
-- price change) are unchanged.
alter function public.decide_approval(uuid, boolean, text) rename to _decide_approval_base;
create function public.decide_approval(p_id uuid, p_approve boolean, p_reason text default null,
                                       p_stepup uuid default null)
returns public.approval_requests
language plpgsql security definer set search_path = '' as $$
begin
  if p_approve and exists (select 1 from public.approval_requests where id = p_id and kind = 'price_change') then
    perform public._consume_stepup(p_stepup, 'confirm_price_change');
  end if;
  return public._decide_approval_base(p_id, p_approve, p_reason);
end $$;

-- An export with personal columns needs a code for export_personal; other exports are unchanged.
alter function public.staff_create_export(public.export_kind, jsonb, text[], text)
  rename to _staff_create_export_base;
create function public.staff_create_export(p_kind public.export_kind, p_params jsonb, p_columns text[],
                                           p_reason text default null, p_stepup uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if p_columns && public.export_pii_columns() then
    perform public._consume_stepup(p_stepup, 'export_personal');
  end if;
  return public._staff_create_export_base(p_kind, p_params, p_columns, p_reason);
end $$;

revoke execute on function public._stepup_used_now(text),
  public._release_cycle_base(uuid),
  public._decide_approval_base(uuid, boolean, text),
  public._staff_create_export_base(public.export_kind, jsonb, text[], text)
  from public, anon, authenticated, service_role;
revoke execute on function public.release_cycle(uuid, uuid),
  public.decide_approval(uuid, boolean, text, uuid),
  public.staff_create_export(public.export_kind, jsonb, text[], text, uuid)
  from public, anon, service_role;
grant execute on function public.release_cycle(uuid, uuid),
  public.decide_approval(uuid, boolean, text, uuid),
  public.staff_create_export(public.export_kind, jsonb, text[], text, uuid)
  to authenticated;
