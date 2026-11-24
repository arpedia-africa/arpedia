-- Flow 15 fix · welcome and receipt emails. The dispatcher (flow 15 notify) sends template emails
-- for notices on `user_notify`; nothing enqueued a welcome (reader finished onboarding) or a
-- receipt (web checkout paid). Google Play sends its own receipt, so only web payments get one.

-- ─── welcome: onboarding reaches `plans` or `done` for the first time ──────
create function public._welcome_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.onboarding_step_ord(old.onboarding_step) < public.onboarding_step_ord('plans')
     and public.onboarding_step_ord(new.onboarding_step) >= public.onboarding_step_ord('plans') then
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'welcome', 'user_id', new.id));
  end if;
  return null;
end $$;
revoke all on function public._welcome_notice() from public, anon, authenticated;

create trigger profiles_welcome_notice
  after update of onboarding_step on public.profiles
  for each row execute function public._welcome_notice();

-- ─── receipt: a web transaction becomes `succeeded` ────────────────────────
create function public._receipt_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_item text;
begin
  if new.store <> 'web' or new.status <> 'succeeded' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'succeeded' then return null; end if;
  if new.kind = 'plan' then
    select p.name || ' plan' into v_item from public.plans p where p.code = new.plan_code;
  else
    select t.credits || ' credits' into v_item from public.topup_products t where t.code = new.topup_code;
  end if;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'receipt', 'user_id', new.user_id,
    'transaction_id', new.id, 'amount_kobo', new.gross_kobo, 'item', coalesce(v_item, 'Arpedia'),
    'paid_at', new.created_at));
  return null;
end $$;
revoke all on function public._receipt_notice() from public, anon, authenticated;

create trigger transactions_receipt_notice
  after insert or update of status on public.transactions
  for each row execute function public._receipt_notice();
