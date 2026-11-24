-- Spec check 09-7, 09-9, 09-14 · payment events the webhook used to drop or fail on.
--   09-9  A Play purchase or renewal for a store subscription that already belongs to another
--         Arpedia account ("This Google Play subscription is linked to another Arpedia account",
--         rule 7) is recorded and changes nothing. It used to raise no_subscription inside
--         grant_plan_credits, so the webhook answered 500 and RevenueCat retried forever.
--   09-7  Duplicate web charge (same minute): the second charge is flagged duplicate_charge, waits in
--         Refunds as "Refund the duplicate", raises a Finance alert, and a second plan charge for the
--         same period grants nothing (credits once per distinct billing period).
--   09-14 Flutterwave charges that come back pending or failed are written as transactions with that
--         status (no credits), so the admin Pending and Failed pills show; a pending charge that later
--         succeeds becomes the succeeded purchase.

-- Duplicate detection looks up the charge time of the reader's other web payments.
create index if not exists payment_events_fw_txn_idx on public.payment_events ((normalized ->> 'txn_id'))
  where provider = 'flutterwave';

-- Another web charge for the same thing by the same reader within a minute of this one.
create function public._duplicate_web_charge(p_user uuid, p_kind text, p_code text, p_txn text, p_at timestamptz)
returns public.transactions
language sql stable security definer set search_path = '' as $$
  select t.* from public.transactions t
  join public.payment_events pe on pe.provider = 'flutterwave' and pe.normalized ->> 'txn_id' = t.store_txn_id
       and pe.normalized ->> 'type' in ('initial_purchase', 'renewal', 'topup')
  where t.user_id = p_user and t.store = 'web' and t.kind = p_kind
    and coalesce(t.plan_code, t.topup_code) = p_code
    and t.status in ('succeeded', 'refunded', 'disputed') and t.store_txn_id <> p_txn
    and abs(extract(epoch from pe.occurred_at - p_at)) < 60
  order by t.created_at limit 1
$$;
revoke all on function public._duplicate_web_charge(uuid, text, text, text, timestamptz) from public, anon, authenticated;

-- Mark a duplicate and put it in front of Finance as a refund candidate.
create function public._flag_duplicate_charge(p_tx uuid, p_first uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.transactions;
begin
  update public.transactions set flag = 'duplicate_charge' where id = p_tx returning * into t;
  insert into public.credit_alerts (user_id, kind, detail)
  values (t.user_id, 'duplicate_charge', jsonb_build_object('transaction_id', t.id, 'store_txn_id', t.store_txn_id,
    'first_transaction_id', p_first));
  insert into public.refund_requests (transaction_id, user_id, reason, credits_granted, credits_used,
                                      recommendation, type, amount_kobo)
  values (t.id, t.user_id, 'Charged twice within a minute', t.credits_granted, 0, 'duplicate', 'full',
          nullif(t.gross_kobo, 0))
  on conflict do nothing;
  perform pgmq.send('payments_out', jsonb_build_object('kind', 'finance_alert', 'alert', 'duplicate_charge',
    'transaction_id', t.id));
end $$;
revoke all on function public._flag_duplicate_charge(uuid, uuid) from public, anon, authenticated;

create or replace function public.apply_payment_event(p_event bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e public.payment_events;
  n jsonb;
  v_type text;
  v_user uuid;
  v_store text;
  v_sub public.subscriptions;
  v_plan text;
  v_topup text;
  v_tx public.transactions;
  v_dup public.transactions;
  v_granted int;
  v_has_sub boolean;
  v_fresh boolean;
  v_stale boolean;
  v_outcome text;
begin
  select * into e from public.payment_events where id = p_event for update;
  if e.processed_at is not null then
    return coalesce(e.outcome, 'done');
  end if;
  n := e.normalized;
  v_type := n ->> 'type';
  v_user := (n ->> 'user_id')::uuid;
  v_store := coalesce(n ->> 'store', case e.provider when 'flutterwave' then 'web' else 'play' end);
  if not exists (select 1 from public.profiles where id = v_user) then
    perform public._raise('unknown_user');
  end if;

  if v_type = 'unpaid' then
    -- 09-14: a pending or failed charge is kept for the admin pills; it grants nothing.
    if n ->> 'status' not in ('pending', 'failed')
       or not exists (select 1 from public.plans where n ->> 'kind' = 'plan' and code = n ->> 'plan_code'
                      union all
                      select 1 from public.topup_products where n ->> 'kind' = 'topup' and code = n ->> 'topup_code') then
      update public.payment_events set processed_at = now(), outcome = 'unpaid: unknown product, ignored', error = null
      where id = p_event;
      return 'unpaid: unknown product, ignored';
    end if;
    insert into public.transactions (user_id, kind, plan_code, topup_code, store, store_txn_id, gross_kobo,
                                     fee_kobo, status)
    values (v_user, n ->> 'kind', case when n ->> 'kind' = 'plan' then n ->> 'plan_code' end,
            case when n ->> 'kind' = 'topup' then n ->> 'topup_code' end, v_store, n ->> 'txn_id',
            coalesce((n ->> 'gross_kobo')::bigint, 0), 0, n ->> 'status')
    on conflict (store, store_txn_id) do update set status = excluded.status
      where public.transactions.status in ('pending', 'failed');
    v_outcome := 'charge ' || (n ->> 'status');

  elsif v_type = 'topup' then
    v_topup := public._event_topup_code(n);
    perform pg_advisory_xact_lock(hashtext(v_user::text));
    v_dup := case when v_store = 'web'
      then public._duplicate_web_charge(v_user, 'topup', v_topup, n ->> 'txn_id', e.occurred_at) end;
    insert into public.transactions (user_id, kind, topup_code, store, store_txn_id, gross_kobo, fee_kobo)
    values (v_user, 'topup', v_topup, v_store, n ->> 'txn_id', coalesce((n ->> 'gross_kobo')::bigint, 0),
            coalesce((n ->> 'fee_kobo')::bigint, 0))
    on conflict (store, store_txn_id) do update set status = 'succeeded', gross_kobo = excluded.gross_kobo,
      fee_kobo = excluded.fee_kobo
      where public.transactions.status in ('pending', 'failed');
    select * into v_tx from public.transactions where store = v_store and store_txn_id = n ->> 'txn_id';
    v_granted := public.grant_topup(v_user, v_topup, v_store || ':' || (n ->> 'txn_id'), true);
    update public.transactions set credits_granted = credits_granted + v_granted,
      flag = case when exists (select 1 from public.credit_alerts a where a.kind = 'lapsed_topup'
                               and a.detail ->> 'store_txn_id' = v_store || ':' || (n ->> 'txn_id'))
                  then 'lapsed_subscriber' else flag end
    where id = v_tx.id;
    -- A second top-up within a minute still grants (a refund takes it back) but waits for Finance.
    if v_dup.id is not null and v_granted > 0 then
      perform public._flag_duplicate_charge(v_tx.id, v_dup.id);
    end if;
    v_outcome := format('topup +%s', v_granted) || case when v_dup.id is not null then ' (duplicate)' else '' end;

  elsif v_type in ('refund', 'chargeback') then
    select * into v_tx from public.transactions where store = v_store and store_txn_id = n ->> 'txn_id' for update;
    if not found then
      perform public._raise('unknown_transaction');
    end if;
    -- A partial refund leaves the purchase succeeded (refunded_kobo shows the part), so the reader
    -- can still ask for the rest.
    update public.transactions set
      refunded_kobo = least(gross_kobo, refunded_kobo + coalesce((n ->> 'refund_kobo')::bigint, gross_kobo)),
      status = case
        when v_type = 'chargeback' then 'disputed'
        when least(gross_kobo, refunded_kobo + coalesce((n ->> 'refund_kobo')::bigint, gross_kobo)) >= gross_kobo
          then 'refunded'
        else status end
    where id = v_tx.id
    returning * into v_tx;
    v_outcome := (public.clawback_purchase(v_tx.id, v_type, v_tx.kind = 'plan' and v_tx.status <> 'succeeded',
      case when v_tx.gross_kobo > 0 and v_tx.refunded_kobo < v_tx.gross_kobo and v_type = 'refund'
           then ceil(v_tx.credits_granted * v_tx.refunded_kobo::numeric / v_tx.gross_kobo)::int end))::text;
    if v_type = 'chargeback' then
      insert into public.credit_alerts (user_id, kind, detail)
      values (v_user, 'chargeback', jsonb_build_object('transaction_id', v_tx.id, 'store_txn_id', n ->> 'txn_id'));
      perform pgmq.send('payments_out', jsonb_build_object('kind', 'finance_alert', 'alert', 'chargeback',
        'transaction_id', v_tx.id));
    end if;

  else
    -- Subscription events, found by the store's original transaction id.
    select * into v_sub from public.subscriptions
    where store = v_store and store_original_txn_id = n ->> 'original_txn_id' for update;
    -- Kept: the lock and lookups below reset FOUND.
    v_has_sub := found;
    v_stale := v_has_sub and e.occurred_at < v_sub.last_event_at;

    if v_type in ('initial_purchase', 'renewal') and v_has_sub and v_sub.user_id <> v_user then
      -- 09-9 (rule 7): the store subscription belongs to another Arpedia account. Nothing moves; the
      -- app tells the reader it is linked elsewhere.
      v_outcome := 'linked_elsewhere: recorded, not applied';

    elsif v_type in ('initial_purchase', 'renewal') then
      v_plan := public._event_plan_code(n);
      if v_plan is null then
        perform public._raise('unknown_plan');
      end if;
      perform pg_advisory_xact_lock(hashtext(v_user::text));
      v_dup := case when v_store = 'web'
        then public._duplicate_web_charge(v_user, 'plan', v_plan, n ->> 'txn_id', e.occurred_at) end;
      v_fresh := not v_has_sub or v_sub.status in ('expired', 'refunded');
      if not v_has_sub then
        -- Also covers a RENEWAL that arrives before its INITIAL_PURCHASE.
        insert into public.subscriptions (user_id, plan_code, status, store, store_original_txn_id, period_start,
                                          period_end, last_event_at, flutterwave_plan_id)
        values (v_user, v_plan, 'active', v_store, n ->> 'original_txn_id', (n ->> 'period_start')::timestamptz,
                (n ->> 'period_end')::timestamptz, e.occurred_at, n ->> 'flutterwave_plan_id')
        returning * into v_sub;
      elsif not v_stale and v_dup.id is null then
        update public.subscriptions set plan_code = v_plan, status = 'active', auto_renew = true,
          pending_plan_code = null, pause_until = null, ended_at = null, last_event_at = e.occurred_at,
          flutterwave_plan_id = coalesce(n ->> 'flutterwave_plan_id', flutterwave_plan_id)
        where id = v_sub.id returning * into v_sub;
      end if;
      insert into public.transactions (user_id, kind, plan_code, subscription_id, store, store_txn_id,
                                       gross_kobo, fee_kobo, period_start)
      values (v_user, 'plan', v_plan, v_sub.id, v_store, n ->> 'txn_id', coalesce((n ->> 'gross_kobo')::bigint, 0),
              coalesce((n ->> 'fee_kobo')::bigint, 0), (n ->> 'period_start')::timestamptz)
      on conflict (store, store_txn_id) do update set status = 'succeeded', subscription_id = excluded.subscription_id,
        gross_kobo = excluded.gross_kobo, fee_kobo = excluded.fee_kobo, period_start = excluded.period_start
        where public.transactions.status in ('pending', 'failed');
      if v_dup.id is not null then
        -- 09-7: the same period was already paid for a moment ago; credits come once per period.
        v_granted := 0;
        select * into v_tx from public.transactions where store = v_store and store_txn_id = n ->> 'txn_id';
        perform public._flag_duplicate_charge(v_tx.id, v_dup.id);
      elsif v_stale then
        -- An older renewal still grants once, but the period stays as the newer event set it.
        v_granted := public.grant_plan_credits(v_user, v_sub.id, v_store || ':' || (n ->> 'txn_id'),
          v_sub.period_start, v_sub.period_end, true);
      else
        v_granted := public.grant_plan_credits(v_user, v_sub.id, v_store || ':' || (n ->> 'txn_id'),
          (n ->> 'period_start')::timestamptz, (n ->> 'period_end')::timestamptz, not v_fresh);
      end if;
      update public.transactions set credits_granted = credits_granted + v_granted
      where store = v_store and store_txn_id = n ->> 'txn_id';
      v_outcome := format('%s +%s', v_type, v_granted) || case when v_dup.id is not null then ' (duplicate)' else '' end;

    elsif not v_has_sub then
      perform public._raise('unknown_subscription');

    elsif v_stale then
      v_outcome := 'stale: recorded, not applied';

    elsif v_sub.status in ('expired', 'refunded') then
      -- An ended subscription only comes back with a new purchase or renewal (above); a late
      -- cancellation, uncancellation or expiration must not reopen or relabel it.
      v_outcome := 'ended: recorded, not applied';

    else
      case v_type
        when 'cancellation' then
          update public.subscriptions set status = 'cancelled', auto_renew = false where id = v_sub.id;
        when 'uncancellation' then
          update public.subscriptions set status = 'active', auto_renew = true where id = v_sub.id;
        when 'billing_issue' then
          update public.subscriptions set status = 'grace' where id = v_sub.id;
          perform pgmq.send('user_notify', jsonb_build_object('kind', 'billing_issue', 'user_id', v_user,
            'subscription_id', v_sub.id));
        when 'billing_recovered' then
          update public.subscriptions set status = 'active' where id = v_sub.id;
        when 'product_change' then
          update public.subscriptions set pending_plan_code = coalesce(n ->> 'new_plan_code',
            (select code from public.plans where play_product_id = n ->> 'new_product_id')) where id = v_sub.id;
        when 'pause' then
          update public.subscriptions set status = 'paused', pause_until = (n ->> 'pause_until')::timestamptz
          where id = v_sub.id;
        when 'resume' then
          update public.subscriptions set status = 'active', pause_until = null where id = v_sub.id;
        when 'expiration' then
          perform public._expire_subscription(v_sub.id);
        else
          perform public._raise('unknown_event_type', jsonb_build_object('type', v_type));
      end case;
      update public.subscriptions set last_event_at = e.occurred_at where id = v_sub.id;
      v_outcome := v_type;
    end if;
  end if;

  update public.payment_events set processed_at = now(), outcome = v_outcome, error = null where id = p_event;
  return v_outcome;
end $$;
