-- Spec check 09-10 · Resend receipt (rules 31 and 33, admin s-transaction and s-subscription).
-- Finance and Super admin can send a web payment's receipt email again. Only web payments that went
-- through (succeeded, or later refunded or disputed, which were paid once) have an Arpedia receipt:
-- Google Play and App Store send their own. The same `receipt` notice as the first send goes on
-- `user_notify`, dated when the payment was made, and the resend is in the audit log.

create function public.staff_resend_receipt(p_transaction uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.transactions;
  v_item text;
begin
  perform public._require_money_staff();
  select * into t from public.transactions where id = p_transaction;
  if not found then
    perform public._raise('unknown_transaction');
  end if;
  if t.store <> 'web' then
    perform public._raise('not_web');
  end if;
  if t.status not in ('succeeded', 'refunded', 'disputed') then
    perform public._raise('not_paid');
  end if;
  if t.kind = 'plan' then
    select p.name || ' plan' into v_item from public.plans p where p.code = t.plan_code;
  else
    select tp.credits || ' credits' into v_item from public.topup_products tp where tp.code = t.topup_code;
  end if;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'receipt', 'user_id', t.user_id,
    'transaction_id', t.id, 'amount_kobo', t.gross_kobo, 'item', coalesce(v_item, 'Arpedia'),
    'paid_at', t.created_at, 'resent', true));
  perform public.write_audit('money', 'resend_receipt', 'transaction', t.id::text, t.store_txn_id,
    'Resent the receipt');
  return jsonb_build_object('status', 'sent', 'user_id', t.user_id);
end $$;
revoke all on function public.staff_resend_receipt(uuid) from public, anon;
grant execute on function public.staff_resend_receipt(uuid) to authenticated;
