-- Flow 09 · spec check 09-3 (rule 8): start a Flutterwave web checkout.
--   start_web_checkout       the api Worker (POST /v1/payments/web-checkout) asks for a checkout for a
--                            signed-in reader: a plan (current web price, rule 30) or a top-up. It
--                            refuses an unknown or inactive product, a reader with a live plan (they
--                            manage it instead), a deleted account, an account without an email and
--                            more than 10 checkouts an hour,
--                            and writes the `arp:{kind}:{code}:{user}:{nonce}` tx_ref the webhook
--                            already reads. A plan comes back with the Flutterwave payment plan
--                            saved for its price, if there is one (web renewals, OPEN-QUESTIONS 17).
--   set_web_payment_plan     the Worker saves the payment plan it created for a plan at a price, so
--                            every reader on that price shares one (first one saved wins).
-- Credits still come only from the webhook (charge.completed, re-queried by id) through
-- ingest_payment_event; a checkout row grants nothing. Promo codes at web checkout are 09-4.

create table public.web_payment_plans (
  plan_code text not null references public.plans (code),
  price_kobo bigint not null check (price_kobo > 0),
  flutterwave_plan_id text not null,
  created_at timestamptz not null default now(),
  primary key (plan_code, price_kobo)
);

create table public.web_checkouts (
  tx_ref text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('plan', 'topup')),
  code text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  credits integer not null check (credits > 0),
  flutterwave_plan_id text,
  created_at timestamptz not null default now()
);
create index web_checkouts_user_idx on public.web_checkouts (user_id, created_at desc);

alter table public.web_payment_plans enable row level security;
alter table public.web_checkouts enable row level security;
-- Finance and Super admin can look a checkout up next to its transaction; nobody writes from a client.
create policy web_checkouts_staff_read on public.web_checkouts for select to authenticated
  using ((select public.is_staff_any(array['finance']::public.staff_role[])));
create policy web_payment_plans_staff_read on public.web_payment_plans for select to authenticated
  using ((select public.is_staff_any(array['finance']::public.staff_role[])));
revoke all on public.web_checkouts, public.web_payment_plans from anon;
revoke insert, update, delete, truncate on public.web_checkouts, public.web_payment_plans from authenticated;

create function public.start_web_checkout(p_user uuid, p_kind text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_name text;
  v_plan jsonb;
  v_amount bigint;
  v_credits int;
  v_months int;
  v_title text;
  v_fw text;
  v_ref text;
begin
  perform public._require_service('start_web_checkout');
  if p_kind not in ('plan', 'topup') or coalesce(p_code, '') !~ '^[a-z0-9_]{1,40}$' then
    raise exception 'bad_request' using errcode = '22023';
  end if;

  select u.email, p.full_name into v_email, v_name
  from auth.users u join public.profiles p on p.id = u.id
  where u.id = p_user and p.deleted_at is null;
  if not found then
    raise exception 'account_unavailable' using errcode = '42501';
  end if;
  if coalesce(btrim(v_email), '') = '' then
    raise exception 'no_email' using errcode = '22023',
      hint = 'Add an email address to your account to pay on the web.';
  end if;

  -- Each checkout calls Flutterwave: 10 an hour per reader is plenty for a person.
  if (select count(*) from public.web_checkouts
      where user_id = p_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = '54000', hint = 'Too many tries. Wait a few minutes.';
  end if;

  if p_kind = 'plan' then
    v_plan := public._plan(p_code);
    if v_plan is null or not (v_plan ->> 'active')::boolean then
      raise exception 'unknown_product' using errcode = 'P0002';
    end if;
    -- A reader on a live plan (either store) changes or renews it instead of buying a second one.
    if exists (select 1 from public.subscriptions s where s.user_id = p_user
               and s.status in ('active', 'grace', 'billing_retry', 'paused')) then
      raise exception 'already_subscribed' using errcode = '23505',
        hint = 'You already have a plan. Manage it from your account.';
    end if;
    v_amount := (v_plan ->> 'price_web_kobo')::bigint;
    v_credits := (v_plan ->> 'total_credits')::int;
    v_months := (v_plan ->> 'months')::int;
    v_title := 'Arpedia ' || (v_plan ->> 'name');
    select flutterwave_plan_id into v_fw from public.web_payment_plans
    where plan_code = p_code and price_kobo = v_amount;
  else
    select t.price_kobo, t.credits into v_amount, v_credits
    from public.topup_products t where t.code = p_code and t.active;
    if not found then
      raise exception 'unknown_product' using errcode = 'P0002';
    end if;
    v_title := 'Arpedia ' || v_credits || ' credits';
  end if;

  v_ref := 'arp:' || p_kind || ':' || p_code || ':' || p_user || ':' || replace(gen_random_uuid()::text, '-', '');
  insert into public.web_checkouts (tx_ref, user_id, kind, code, amount_kobo, credits, flutterwave_plan_id)
  values (v_ref, p_user, p_kind, p_code, v_amount, v_credits, v_fw);

  return jsonb_build_object('tx_ref', v_ref, 'kind', p_kind, 'code', p_code, 'amount_kobo', v_amount,
    'credits', v_credits, 'months', v_months, 'title', v_title, 'email', lower(btrim(v_email)),
    'name', nullif(btrim(v_name), ''), 'flutterwave_plan_id', v_fw);
end $$;

create function public.set_web_payment_plan(p_tx_ref text, p_flutterwave_plan_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_co public.web_checkouts;
  v_fw text;
begin
  perform public._require_service('set_web_payment_plan');
  select * into v_co from public.web_checkouts where tx_ref = p_tx_ref;
  if not found or v_co.kind <> 'plan' or coalesce(btrim(p_flutterwave_plan_id), '') = '' then
    raise exception 'bad_request' using errcode = '22023';
  end if;
  insert into public.web_payment_plans (plan_code, price_kobo, flutterwave_plan_id)
  values (v_co.code, v_co.amount_kobo, btrim(p_flutterwave_plan_id))
  on conflict (plan_code, price_kobo) do nothing;
  -- Two first checkouts at once: both use the one saved first.
  select flutterwave_plan_id into v_fw from public.web_payment_plans
  where plan_code = v_co.code and price_kobo = v_co.amount_kobo;
  update public.web_checkouts set flutterwave_plan_id = v_fw where tx_ref = p_tx_ref;
  return v_fw;
end $$;

revoke all on function public.start_web_checkout(uuid, text, text), public.set_web_payment_plan(text, text)
  from public, anon, authenticated;
grant execute on function public.start_web_checkout(uuid, text, text), public.set_web_payment_plan(text, text)
  to service_role;
