-- Flow 09 · Credits and plans (docs/prd/09-credits-plans.md).
-- Every way credits ENTER the ledger (plan grants, rollover, top-ups, promos, staff grants, chapter
-- returns) and every way they EXPIRE or are clawed back. Spending stays in flow 03 (spend_credits).
--
-- Payments arrive at Cloudflare Workers (RevenueCat, Flutterwave). A Worker verifies the provider,
-- maps the event to the normalized shape below and calls ingest_payment_event() with the service key.
-- Outbound calls to providers (Flutterwave refund / plan cancel / resume charge, RevenueCat promotional
-- entitlement) are queued on pgmq `payments_out` for a Worker; pushes go to `user_notify` (flow 15).
--
-- Normalized event (payment_events.normalized):
--   { type: initial_purchase | renewal | topup | cancellation | uncancellation | expiration |
--           billing_issue | billing_recovered | product_change | pause | resume | refund | chargeback,
--     user_id, store: play | web | app_store, product_id?, plan_code?, topup_code?,
--     txn_id, original_txn_id, period_start?, period_end?, gross_kobo?, fee_kobo?,
--     new_plan_code?, pause_until?, refund_kobo?, flutterwave_plan_id? }

-- ─── Reference data: plans, top-ups, pricing rules ──────────────────────────
create table public.plans (
  code text primary key check (code in ('monthly', 'quarterly', 'yearly')),
  name text not null,
  months integer not null check (months > 0),
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  price_play_kobo bigint not null check (price_play_kobo > 0),
  price_web_kobo bigint not null check (price_web_kobo > 0),
  play_product_id text not null unique,
  badge text,
  active boolean not null default true,
  sort integer not null default 0,
  effective_from timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans
  for each row execute function public.set_updated_at();

-- Web price and credit changes. The current values of a plan are the latest version in effect.
create table public.plan_price_versions (
  id bigint generated always as identity primary key,
  plan_code text not null references public.plans (code),
  name text not null,
  badge text,
  price_web_kobo bigint not null check (price_web_kobo > 0),
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  effective_from timestamptz not null,
  changed_by uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index plan_price_versions_plan_idx on public.plan_price_versions (plan_code, effective_from desc);

create table public.topup_products (
  code text primary key,
  credits integer not null check (credits > 0),
  price_kobo bigint not null check (price_kobo > 0),
  play_product_id text not null unique,
  active boolean not null default true
);

create table public.pricing_rule_versions (
  id uuid primary key default gen_random_uuid(),
  effective_at timestamptz not null,
  rules jsonb not null,
  changed_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  note text,
  created_at timestamptz not null default now()
);
create index pricing_rule_versions_at_idx on public.pricing_rule_versions (effective_at desc);

insert into public.plans (code, name, months, credits, bonus_credits, price_play_kobo, price_web_kobo,
                          play_product_id, badge, sort) values
  ('monthly',   'Monthly',   1,  300,  0,   90000,  80000, 'arpedia_monthly',   null,           1),
  ('quarterly', 'Quarterly', 3,  800,  0,  240000, 210000, 'arpedia_quarterly', 'Most popular', 2),
  ('yearly',    'Yearly',    12, 2800, 200, 840000, 750000, 'arpedia_yearly',   'Best value',   3);
insert into public.plan_price_versions (plan_code, name, badge, price_web_kobo, credits, bonus_credits,
                                        effective_from, note)
select code, name, badge, price_web_kobo, credits, bonus_credits, '2026-01-01', 'Launch prices' from public.plans;

insert into public.topup_products (code, credits, price_kobo, play_product_id) values
  ('topup_200',  200,  60000,  'arpedia_topup_200'),
  ('topup_500',  500,  150000, 'arpedia_topup_500'),
  ('topup_1000', 1000, 300000, 'arpedia_topup_1000');

insert into public.pricing_rule_versions (effective_at, rules, note) values
  ('2026-01-01', '{"words_per_page": 250, "credits_per_page": 0.5, "credit_value_kobo": 300,
    "preview_pct": 10, "split_pages": 20, "undo_minutes": 10, "author_rate_kobo": 160,
    "rollover_cap_plans": 1, "pause_max_months": 3, "auto_unlock_default": true,
    "store_fee_pct": 15}', 'Launch rules');

-- ─── Ledger and subscriptions (extended) ────────────────────────────────────
alter table public.credit_ledger add column rate_version uuid references public.pricing_rule_versions (id);

alter table public.subscriptions
  add column store text not null default 'play' check (store in ('play', 'web', 'app_store')),
  add column auto_renew boolean not null default true,
  add column pause_until timestamptz,
  add column last_event_at timestamptz not null default now(),
  add column store_original_txn_id text,
  add column flutterwave_plan_id text,
  add column pending_plan_code text references public.plans (code),
  add column reminder_sent_for timestamptz,
  add column ended_at timestamptz,
  add constraint subscriptions_plan_fk foreign key (plan_code) references public.plans (code);
create unique index subscriptions_store_txn_idx on public.subscriptions (store, store_original_txn_id)
  where store_original_txn_id is not null;

-- ─── Payments ───────────────────────────────────────────────────────────────
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('revenuecat', 'flutterwave')),
  event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  normalized jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  error text,
  unique (provider, event_id)
);
create index payment_events_unprocessed_idx on public.payment_events (received_at) where processed_at is null;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('plan', 'topup')),
  plan_code text references public.plans (code),
  topup_code text references public.topup_products (code),
  subscription_id uuid references public.subscriptions (id),
  store text not null check (store in ('play', 'web', 'app_store')),
  store_txn_id text not null,
  gross_kobo bigint not null default 0 check (gross_kobo >= 0),
  fee_kobo bigint not null default 0 check (fee_kobo >= 0),
  net_kobo bigint generated always as (gross_kobo - fee_kobo) stored,
  status text not null default 'succeeded'
    check (status in ('pending', 'succeeded', 'failed', 'refunded', 'disputed')),
  period_start timestamptz,
  credits_granted integer not null default 0,
  refunded_kobo bigint not null default 0 check (refunded_kobo >= 0),
  flag text,
  created_at timestamptz not null default now(),
  unique (store, store_txn_id),
  check ((kind = 'plan') = (plan_code is not null)),
  check ((kind = 'topup') = (topup_code is not null))
);
create index transactions_user_idx on public.transactions (user_id, created_at desc);
create index transactions_created_idx on public.transactions (created_at desc);

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id),
  user_id uuid not null references public.profiles (id),
  reason text not null check (char_length(reason) between 1 and 500),
  requested_at timestamptz not null default now(),
  credits_granted integer not null default 0,
  credits_used integer not null default 0,
  recommendation text not null check (recommendation in ('full', 'partial', 'decline', 'duplicate')),
  status text not null default 'waiting' check (status in ('waiting', 'refunding', 'refunded', 'declined', 'failed')),
  type text check (type in ('full', 'partial')),
  amount_kobo bigint check (amount_kobo > 0),
  note text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  flutterwave_refund_id text
);
create unique index refund_requests_open_idx on public.refund_requests (transaction_id)
  where status in ('waiting', 'refunding');

-- ─── Balances cache ─────────────────────────────────────────────────────────
-- Maintained only by the ledger trigger below; ledger_reconcile checks it nightly.
create table public.credit_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan integer not null default 0,
  rollover integer not null default 0,
  topup integer not null default 0,
  promo integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.credit_daily_snapshot (
  day date primary key,
  issued integer not null,
  spent integer not null,
  expired integer not null,
  unspent_total bigint not null,
  unspent_by_bucket jsonb not null,
  created_at timestamptz not null default now()
);

create table public.credit_grant_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  credits integer not null check (credits > 0),
  reason text not null check (char_length(reason) between 3 and 500),
  requested_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  ledger_id bigint references public.credit_ledger (id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (approved_by <> requested_by)
);
create index credit_grant_requests_pending_idx on public.credit_grant_requests (created_at) where status = 'pending';

-- Anomalies for s-credits (admin) and Finance alerts: chargebacks, lapsed top-ups, reconcile gaps.
create table public.credit_alerts (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id),
  kind text not null check (kind in ('chargeback', 'lapsed_topup', 'reconcile', 'gift_loop', 'transfers',
                                     'duplicate_charge', 'clawback_short')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id)
);
create index credit_alerts_open_idx on public.credit_alerts (created_at desc) where resolved_at is null;

-- ─── Promo codes ────────────────────────────────────────────────────────────
create table public.promo_codes (
  code text primary key check (code ~ '^[a-z0-9]{4,16}$'),
  kind text not null check (kind in ('bonus_credits', 'plan_discount', 'trial_days')),
  amount integer not null check (amount > 0),
  max_uses integer check (max_uses > 0),
  uses_per_reader integer not null default 1 check (uses_per_reader > 0),
  new_readers_only boolean not null default false,
  web_only boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  campaign_tag text,
  status text not null default 'active' check (status in ('scheduled', 'active', 'paused', 'ended')),
  uses integer not null default 0,
  locked_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind <> 'plan_discount' or amount between 1 and 90),
  check (ends_at is null or ends_at > starts_at)
);

create table public.promo_redemptions (
  id bigint generated always as identity primary key,
  code text not null references public.promo_codes (code),
  user_id uuid not null references public.profiles (id),
  transaction_id uuid references public.transactions (id),
  ledger_id bigint references public.credit_ledger (id),
  redeemed_at timestamptz not null default now()
);
create index promo_redemptions_user_idx on public.promo_redemptions (code, user_id);

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- Pricing rules in effect now (or at p_at).
create function public._rules(p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = '' as $$
  select rules from public.pricing_rule_versions where effective_at <= p_at
  order by effective_at desc, created_at desc limit 1
$$;

create function public._rules_version(p_at timestamptz default now()) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.pricing_rule_versions where effective_at <= p_at
  order by effective_at desc, created_at desc limit 1
$$;

-- A plan's values in effect now: the latest version (web price, credits, name, badge).
create function public._plan(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code', p.code, 'name', v.name, 'months', p.months, 'credits', v.credits,
           'bonus_credits', v.bonus_credits, 'total_credits', v.credits + v.bonus_credits,
           'price_play_kobo', p.price_play_kobo, 'price_web_kobo', v.price_web_kobo,
           'play_product_id', p.play_product_id, 'badge', v.badge, 'active', p.active, 'sort', p.sort)
  from public.plans p
  cross join lateral (select * from public.plan_price_versions pv
                      where pv.plan_code = p.code and pv.effective_from <= now()
                      order by pv.effective_from desc, pv.id desc limit 1) v
  where p.code = p_code
$$;

create function public._bucket(p_user uuid, p_bucket public.ledger_bucket) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::int from public.credit_ledger where user_id = p_user and bucket = p_bucket
$$;

-- Next 00:00 in Lagos.
create function public._next_wat_midnight() returns timestamptz
language sql stable set search_path = '' as $$
  select (date_trunc('day', now() at time zone 'Africa/Lagos') + interval '1 day') at time zone 'Africa/Lagos'
$$;

-- Plan check (rule 26): net per credit = price × (1 − store fee) ÷ credits must exceed the author rate,
-- for every active plan (Play and web price) and top-up. p_plans overrides plan values by code.
create function public._plan_check(p_rules jsonb, p_plans jsonb default '{}') returns jsonb
language sql stable security definer set search_path = '' as $$
  with rows as (
    select 'plan' as kind, x.code, s.store,
           case s.store when 'play' then (x.p ->> 'price_play_kobo')::bigint
                        else (x.p ->> 'price_web_kobo')::bigint end as price_kobo,
           (x.p ->> 'total_credits')::int as credits
    from (select pl.code, public._plan(pl.code) || coalesce(p_plans -> pl.code, '{}') as p
          from public.plans pl where pl.active) x0
    cross join lateral (select x0.code, x0.p || jsonb_build_object('total_credits',
      (x0.p ->> 'credits')::int + (x0.p ->> 'bonus_credits')::int) as p) x
    cross join (values ('play'), ('web')) s(store)
    union all
    select 'topup', t.code, 'any', t.price_kobo, t.credits from public.topup_products t where t.active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', kind, 'code', code, 'store', store, 'price_kobo', price_kobo, 'credits', credits,
           'net_per_credit_kobo', round(price_kobo * (1 - (p_rules ->> 'store_fee_pct')::numeric / 100) / credits, 2),
           'ok', price_kobo * (1 - (p_rules ->> 'store_fee_pct')::numeric / 100) / credits
                 > (p_rules ->> 'author_rate_kobo')::numeric)
         order by kind, code, store), '[]')
  from rows
$$;

-- Insert one ledger row that adds or removes credits outside spend_credits (grants, expiry,
-- clawback, returns). Returns the row id, or null when the key was already used.
create function public._ledger_add(p_user uuid, p_delta integer, p_reason public.ledger_reason,
                                   p_bucket public.ledger_bucket, p_txn uuid, p_key text,
                                   p_expires timestamptz default null, p_ref_type text default null,
                                   p_ref_id text default null, p_note text default null,
                                   p_meta jsonb default '{}', p_actor uuid default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if p_delta = 0 then
    return null;
  end if;
  -- Checked first, not ON CONFLICT: the balances trigger runs before a conflict would be seen.
  -- Callers hold the reader's advisory lock, so the check cannot race.
  if p_key is not null and exists (select 1 from public.credit_ledger where idempotency_key = p_key) then
    return null;
  end if;
  insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, idempotency_key, expires_at,
                                    ref_type, ref_id, note, meta, actor_id, rate_version)
  values (p_user, p_delta, p_reason, p_bucket, p_txn, p_key, p_expires, p_ref_type, p_ref_id, p_note,
          coalesce(p_meta, '{}'), p_actor, public._rules_version())
  returning id into v_id;
  return v_id;
end $$;

-- ─── Balances trigger ───────────────────────────────────────────────────────
-- Keeps credit_balances in step with the ledger, stamps balance_after, and refuses any row that
-- would take a bucket below zero (balance never goes negative).
create function public._ledger_balance_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b public.credit_balances;
begin
  insert into public.credit_balances (user_id) values (new.user_id) on conflict do nothing;
  select * into b from public.credit_balances where user_id = new.user_id for update;
  if (case new.bucket when 'plan' then b.plan when 'rollover' then b.rollover
                      when 'topup' then b.topup else b.promo end) + new.delta < 0 then
    raise exception 'credit bucket % would go below zero', new.bucket using errcode = 'check_violation';
  end if;
  update public.credit_balances set
    plan = plan + case when new.bucket = 'plan' then new.delta else 0 end,
    rollover = rollover + case when new.bucket = 'rollover' then new.delta else 0 end,
    topup = topup + case when new.bucket = 'topup' then new.delta else 0 end,
    promo = promo + case when new.bucket = 'promo' then new.delta else 0 end,
    updated_at = now()
  where user_id = new.user_id
  returning plan + rollover + topup + promo into b.plan;
  new.balance_after := coalesce(new.balance_after, b.plan);
  return new;
end $$;
create trigger credit_ledger_balance before insert on public.credit_ledger
  for each row execute function public._ledger_balance_trigger();

-- Existing rows (earlier flows, before this trigger).
insert into public.credit_balances (user_id, plan, rollover, topup, promo)
select user_id,
       coalesce(sum(delta) filter (where bucket = 'plan'), 0),
       coalesce(sum(delta) filter (where bucket = 'rollover'), 0),
       coalesce(sum(delta) filter (where bucket = 'topup'), 0),
       coalesce(sum(delta) filter (where bucket = 'promo'), 0)
from public.credit_ledger group by user_id;

-- ─── spend_credits: frozen gifting ──────────────────────────────────────────
-- Same as flow 03, plus the Freeze gifting switch from s-credits (admin), rule 27.
create or replace function public.spend_credits(p_user uuid, p_amount integer, p_reason public.ledger_reason,
                                                p_book uuid, p_chapter_uid uuid, p_author uuid, p_key text,
                                                p_meta jsonb default '{}', p_counterparty uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'u:' || p_user || ':' || p_key;
  v_first public.credit_ledger;
  v_txn uuid := gen_random_uuid();
  v_balance int;
  v_left int := p_amount;
  v_take int;
  v_first_id bigint;
  v_id bigint;
  b record;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 100 then
    perform public._raise('bad_key');
  end if;
  if p_amount is null or p_amount <= 0 then
    perform public._raise('bad_amount');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_first from public.credit_ledger where idempotency_key = v_key;
  if found then
    return jsonb_build_object('ledger_id', v_first.id, 'txn_id', v_first.txn_id,
      'spent', -(select sum(delta) from public.credit_ledger where txn_id = v_first.txn_id),
      'balance', public._balance(p_user), 'replayed', true);
  end if;

  if p_reason = 'gift_out' and coalesce((public._config('gifting_frozen'))::boolean, false) then
    perform public._raise('gifting_frozen');
  end if;

  v_balance := public._balance(p_user);
  if v_balance < p_amount then
    perform public._raise('insufficient_credits',
      jsonb_build_object('missing', p_amount - v_balance, 'balance', v_balance, 'need', p_amount));
  end if;

  for b in
    select bucket, sum(delta)::int as available from public.credit_ledger
    where user_id = p_user group by bucket having sum(delta) > 0
    order by array_position(array['rollover', 'plan', 'promo', 'topup']::public.ledger_bucket[], bucket)
  loop
    exit when v_left = 0;
    v_take := least(v_left, b.available);
    v_left := v_left - v_take;
    v_balance := v_balance - v_take;
    insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, ref_type, ref_id,
      idempotency_key, book_id, chapter_uid, author_id, author_earning_kobo, counterparty_user_id,
      balance_after, meta, rate_version)
    values (p_user, -v_take, p_reason, b.bucket, v_txn, case when p_book is not null then 'book' end,
      p_book::text, case when v_first_id is null then v_key else v_key || '#' || b.bucket end,
      p_book, p_chapter_uid, p_author,
      case when p_author is not null then v_take * (public._rules() ->> 'author_rate_kobo')::int else 0 end,
      p_counterparty, v_balance, coalesce(p_meta, '{}'), public._rules_version())
    returning id into v_id;
    v_first_id := coalesce(v_first_id, v_id);
  end loop;

  if v_left > 0 then
    perform public._raise('insufficient_credits',
      jsonb_build_object('missing', v_left, 'balance', v_balance + p_amount - v_left, 'need', p_amount));
  end if;
  return jsonb_build_object('ledger_id', v_first_id, 'txn_id', v_txn, 'spent', p_amount,
    'balance', v_balance, 'replayed', false);
end $$;

-- ─── Grants, rollover, expiry, clawback (internal) ──────────────────────────
-- Rule 11: at a renewal into p_plan, all remaining rolled-over credits expire, unused plan credits
-- move to rollover up to the cap (one plan's worth of p_plan), the excess expires.
create function public.roll_over(p_user uuid, p_plan text, p_txn uuid, p_key text, p_until timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_plan int := public._bucket(p_user, 'plan');
  v_roll int := public._bucket(p_user, 'rollover');
  v_cap int := ((public._plan(p_plan) ->> 'total_credits')::int
                * (public._rules() ->> 'rollover_cap_plans')::numeric)::int;
  v_moved int;
begin
  v_moved := least(greatest(v_plan, 0), v_cap);
  perform public._ledger_add(p_user, -v_roll, 'expiry', 'rollover', p_txn, p_key || ':expire_rollover',
    null, 'plan', p_plan, 'Rolled-over credits not used in time');
  perform public._ledger_add(p_user, -v_moved, 'expiry', 'plan', p_txn, p_key || ':carry_out',
    null, 'plan', p_plan, 'Carried over to the next period');
  perform public._ledger_add(p_user, v_moved, 'rollover', 'rollover', p_txn, p_key || ':carry_in',
    p_until, 'plan', p_plan, 'Carried over from last period');
  perform public._ledger_add(p_user, -(greatest(v_plan, 0) - v_moved), 'expiry', 'plan', p_txn,
    p_key || ':over_cap', null, 'plan', p_plan, 'Over the rollover cap');
  return jsonb_build_object('rolled_over', v_moved, 'expired', v_roll + greatest(v_plan, 0) - v_moved);
end $$;

-- Rule 9: the plan's credits, once per store transaction. Returns credits granted (0 on replay).
create function public.grant_plan_credits(p_user uuid, p_sub uuid, p_txn_ref text, p_period_start timestamptz,
                                          p_period_end timestamptz, p_rollover boolean default true)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'plan:' || p_txn_ref;
  v_sub public.subscriptions;
  v_credits int;
  v_txn uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  if exists (select 1 from public.credit_ledger where idempotency_key = v_key) then
    return 0;
  end if;
  select * into v_sub from public.subscriptions where id = p_sub and user_id = p_user;
  if not found then
    perform public._raise('no_subscription');
  end if;
  v_credits := (public._plan(v_sub.plan_code) ->> 'total_credits')::int;
  if p_rollover then
    perform public.roll_over(p_user, v_sub.plan_code, v_txn, v_key, p_period_end);
  else
    -- A fresh start after expiry: nothing carries over (rule 21).
    perform public._ledger_add(p_user, -public._bucket(p_user, 'rollover'), 'expiry', 'rollover', v_txn,
      v_key || ':expire_rollover', null, 'plan', v_sub.plan_code, 'Plan ended');
    perform public._ledger_add(p_user, -public._bucket(p_user, 'plan'), 'expiry', 'plan', v_txn,
      v_key || ':expire_plan', null, 'plan', v_sub.plan_code, 'Plan ended');
  end if;
  perform public._ledger_add(p_user, v_credits, 'plan_grant', 'plan', v_txn, v_key, p_period_end,
    'plan', v_sub.plan_code, null, jsonb_build_object('subscription_id', p_sub, 'store_txn_id', p_txn_ref));
  update public.subscriptions set period_start = p_period_start, period_end = p_period_end
  where id = p_sub;
  return v_credits;
end $$;

-- Rule 10: top-up credits, never expiring. A webhook grant for a lapsed subscriber still grants
-- (money was taken) and is flagged for Finance.
create function public.grant_topup(p_user uuid, p_code text, p_txn_ref text, p_from_webhook boolean default false)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_credits int;
begin
  select credits into v_credits from public.topup_products where code = p_code;
  if not found then
    perform public._raise('unknown_topup');
  end if;
  if public._plan_state(p_user) ->> 'state' <> 'plan' then
    if not p_from_webhook then
      perform public._raise('topup_needs_plan');
    end if;
    insert into public.credit_alerts (user_id, kind, detail)
    values (p_user, 'lapsed_topup', jsonb_build_object('topup', p_code, 'store_txn_id', p_txn_ref));
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  if public._ledger_add(p_user, v_credits, 'top_up', 'topup', gen_random_uuid(), 'topup:' || p_txn_ref,
       null, 'topup', p_code) is null then
    return 0;
  end if;
  return v_credits;
end $$;

-- Rule 20: plan and rolled-over credits expire when a subscription ends; top-ups stay.
create function public._expire_subscription(p_sub uuid, p_status text default 'expired') returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_sub public.subscriptions;
  v_txn uuid := gen_random_uuid();
  v_plan int;
  v_roll int;
begin
  select * into v_sub from public.subscriptions where id = p_sub for update;
  if v_sub.status in ('expired', 'refunded') and p_status = v_sub.status then
    return 0;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_sub.user_id::text));
  -- Another live subscription keeps the credits (e.g. a new purchase on another store).
  if exists (select 1 from public.subscriptions s where s.user_id = v_sub.user_id and s.id <> p_sub
             and s.status in ('active', 'grace', 'billing_retry', 'paused')) then
    v_plan := 0; v_roll := 0;
  else
    v_plan := public._bucket(v_sub.user_id, 'plan');
    v_roll := public._bucket(v_sub.user_id, 'rollover');
    perform public._ledger_add(v_sub.user_id, -v_plan, 'expiry', 'plan', v_txn,
      'expire:' || p_sub || ':' || v_sub.period_end || ':plan', null, 'subscription', p_sub::text, 'Plan ended');
    perform public._ledger_add(v_sub.user_id, -v_roll, 'expiry', 'rollover', v_txn,
      'expire:' || p_sub || ':' || v_sub.period_end || ':rollover', null, 'subscription', p_sub::text, 'Plan ended');
  end if;
  update public.subscriptions set status = p_status, ended_at = coalesce(ended_at, now()), auto_renew = false
  where id = p_sub;
  return v_plan + v_roll;
end $$;

-- Refund, web refund or chargeback: remove up to p_credits (default: all granted) from the buckets
-- the purchase filled, never below zero. Plan purchases may have rolled over, so plan then rollover.
-- Ends the subscription when p_end_sub. Returns {removed, unrecoverable}.
create function public.clawback_purchase(p_transaction uuid, p_reason text, p_end_sub boolean default true,
                                         p_credits integer default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.transactions;
  v_target int;
  v_left int;
  v_take int;
  v_removed int := 0;
  v_txn uuid := gen_random_uuid();
  v_bucket public.ledger_bucket;
  v_buckets public.ledger_bucket[];
  v_short int;
begin
  select * into t from public.transactions where id = p_transaction for update;
  if not found then
    perform public._raise('unknown_transaction');
  end if;
  perform pg_advisory_xact_lock(hashtext(t.user_id::text));
  -- What earlier clawbacks of this purchase already removed.
  v_target := least(coalesce(p_credits, t.credits_granted), t.credits_granted)
    + coalesce((select sum(delta) from public.credit_ledger
                where reason = 'refund' and ref_type = 'transaction' and ref_id = t.id::text), 0)::int;
  v_left := greatest(v_target, 0);
  v_buckets := case when t.kind = 'plan' then array['plan', 'rollover']::public.ledger_bucket[]
                    else array['topup']::public.ledger_bucket[] end;
  -- What cannot be recovered (already spent) is shown on the clawback rows and alerted to Finance.
  v_short := greatest(v_left - (select coalesce(sum(greatest(public._bucket(t.user_id, x), 0)), 0)::int
                                from unnest(v_buckets) x), 0);
  foreach v_bucket in array v_buckets loop
    v_take := least(v_left, greatest(public._bucket(t.user_id, v_bucket), 0));
    perform public._ledger_add(t.user_id, -v_take, 'refund', v_bucket, v_txn,
      'clawback:' || t.id || ':' || v_txn || ':' || v_bucket, null, 'transaction', t.id::text, p_reason,
      jsonb_build_object('not_recoverable', v_short));
    v_left := v_left - v_take;
    v_removed := v_removed + v_take;
  end loop;
  if v_left > 0 then
    insert into public.credit_alerts (user_id, kind, detail)
    values (t.user_id, 'clawback_short', jsonb_build_object('transaction_id', t.id, 'removed', v_removed,
      'not_recoverable', v_left, 'reason', p_reason));
  end if;
  if p_end_sub and t.subscription_id is not null then
    perform public._expire_subscription(t.subscription_id, 'refunded');
  end if;
  return jsonb_build_object('removed', v_removed, 'not_recoverable', v_left);
end $$;

-- ─── Payment events ─────────────────────────────────────────────────────────
create function public._event_plan_code(n jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(n ->> 'plan_code', (select code from public.plans where play_product_id = n ->> 'product_id'))
$$;

create function public._event_topup_code(n jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(n ->> 'topup_code', (select code from public.topup_products where play_product_id = n ->> 'product_id'))
$$;

-- Apply one stored event. Returns the outcome text stored on the event.
create function public.apply_payment_event(p_event bigint) returns text
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
  v_granted int;
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

  if v_type = 'topup' then
    v_topup := public._event_topup_code(n);
    insert into public.transactions (user_id, kind, topup_code, store, store_txn_id, gross_kobo, fee_kobo)
    values (v_user, 'topup', v_topup, v_store, n ->> 'txn_id', coalesce((n ->> 'gross_kobo')::bigint, 0),
            coalesce((n ->> 'fee_kobo')::bigint, 0))
    on conflict (store, store_txn_id) do nothing;
    select * into v_tx from public.transactions where store = v_store and store_txn_id = n ->> 'txn_id';
    v_granted := public.grant_topup(v_user, v_topup, v_store || ':' || (n ->> 'txn_id'), true);
    update public.transactions set credits_granted = credits_granted + v_granted,
      flag = case when exists (select 1 from public.credit_alerts a where a.kind = 'lapsed_topup'
                               and a.detail ->> 'store_txn_id' = v_store || ':' || (n ->> 'txn_id'))
                  then 'lapsed_subscriber' else flag end
    where id = v_tx.id;
    v_outcome := format('topup +%s', v_granted);

  elsif v_type in ('refund', 'chargeback') then
    select * into v_tx from public.transactions where store = v_store and store_txn_id = n ->> 'txn_id' for update;
    if not found then
      perform public._raise('unknown_transaction');
    end if;
    update public.transactions set status = case v_type when 'chargeback' then 'disputed' else 'refunded' end,
      refunded_kobo = least(gross_kobo, refunded_kobo + coalesce((n ->> 'refund_kobo')::bigint, gross_kobo))
    where id = v_tx.id;
    v_outcome := (public.clawback_purchase(v_tx.id, v_type, v_tx.kind = 'plan',
      case when n ? 'refund_kobo' and v_tx.gross_kobo > 0
           then ceil(v_tx.credits_granted * least((n ->> 'refund_kobo')::numeric / v_tx.gross_kobo, 1))::int end))::text;
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
    v_stale := found and e.occurred_at < v_sub.last_event_at;

    if v_type in ('initial_purchase', 'renewal') then
      v_plan := public._event_plan_code(n);
      if v_plan is null then
        perform public._raise('unknown_plan');
      end if;
      v_fresh := not found or v_sub.status in ('expired', 'refunded');
      if not found then
        -- Also covers a RENEWAL that arrives before its INITIAL_PURCHASE.
        insert into public.subscriptions (user_id, plan_code, status, store, store_original_txn_id, period_start,
                                          period_end, last_event_at, flutterwave_plan_id)
        values (v_user, v_plan, 'active', v_store, n ->> 'original_txn_id', (n ->> 'period_start')::timestamptz,
                (n ->> 'period_end')::timestamptz, e.occurred_at, n ->> 'flutterwave_plan_id')
        returning * into v_sub;
      elsif not v_stale then
        update public.subscriptions set plan_code = v_plan, status = 'active', auto_renew = true,
          pending_plan_code = null, pause_until = null, ended_at = null, last_event_at = e.occurred_at,
          flutterwave_plan_id = coalesce(n ->> 'flutterwave_plan_id', flutterwave_plan_id)
        where id = v_sub.id returning * into v_sub;
      end if;
      insert into public.transactions (user_id, kind, plan_code, subscription_id, store, store_txn_id,
                                       gross_kobo, fee_kobo, period_start)
      values (v_user, 'plan', v_plan, v_sub.id, v_store, n ->> 'txn_id', coalesce((n ->> 'gross_kobo')::bigint, 0),
              coalesce((n ->> 'fee_kobo')::bigint, 0), (n ->> 'period_start')::timestamptz)
      on conflict (store, store_txn_id) do nothing;
      if v_stale then
        -- An older renewal still grants once, but the period stays as the newer event set it.
        v_granted := public.grant_plan_credits(v_user, v_sub.id, v_store || ':' || (n ->> 'txn_id'),
          v_sub.period_start, v_sub.period_end, true);
      else
        v_granted := public.grant_plan_credits(v_user, v_sub.id, v_store || ':' || (n ->> 'txn_id'),
          (n ->> 'period_start')::timestamptz, (n ->> 'period_end')::timestamptz, not v_fresh);
      end if;
      update public.transactions set credits_granted = credits_granted + v_granted
      where store = v_store and store_txn_id = n ->> 'txn_id';
      v_outcome := format('%s +%s', v_type, v_granted);

    elsif not found then
      perform public._raise('unknown_subscription');

    elsif v_stale then
      v_outcome := 'stale: recorded, not applied';

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

-- Workers call this with the service key: store, then apply. A known duplicate returns
-- {duplicate: true} and changes nothing. A failure is stored on the event and returned as
-- {error}, and the Worker answers 5xx so the provider retries.
create function public.ingest_payment_event(p_provider text, p_event_id text, p_event_type text,
                                            p_occurred_at timestamptz, p_payload jsonb, p_normalized jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
  v_outcome text;
begin
  insert into public.payment_events (provider, event_id, event_type, occurred_at, payload, normalized)
  values (p_provider, p_event_id, p_event_type, p_occurred_at, p_payload, p_normalized)
  on conflict (provider, event_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id, outcome into v_id, v_outcome from public.payment_events
    where provider = p_provider and event_id = p_event_id;
    if v_outcome is not null then
      return jsonb_build_object('id', v_id, 'duplicate', true, 'outcome', v_outcome);
    end if;
    -- A retry of an event that failed before: apply it again below.
  end if;
  begin
    v_outcome := public.apply_payment_event(v_id);
  exception when others then
    update public.payment_events set error = sqlerrm where id = v_id;
    return jsonb_build_object('id', v_id, 'error', sqlerrm);
  end;
  return jsonb_build_object('id', v_id, 'duplicate', false, 'outcome', v_outcome);
end $$;

-- ─── Reader RPCs ────────────────────────────────────────────────────────────
-- Balance with its split (rule 13). Polled after a purchase (rule 6).
create function public.my_credit_balance() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  b public.credit_balances;
  v_total int;
begin
  select * into b from public.credit_balances where user_id = v_user;
  v_total := coalesce(b.plan + b.rollover + b.topup + b.promo, 0);
  return jsonb_build_object(
    'total', v_total, 'plan', coalesce(b.plan, 0), 'rollover', coalesce(b.rollover, 0),
    'topup', coalesce(b.topup, 0), 'promo', coalesce(b.promo, 0),
    'books', v_total / (public._config('avg_book_price_credits'))::int,
    'plan_expires_at', (select max(expires_at) from public.credit_ledger
                        where user_id = v_user and bucket = 'plan' and reason = 'plan_grant'),
    'rollover_expires_at', (select max(expires_at) from public.credit_ledger
                            where user_id = v_user and bucket = 'rollover' and reason = 'rollover'),
    'updated_at', coalesce(b.updated_at, now()));
end $$;

-- Plans and top-ups for the paywall, checkout and Credits screen.
create function public.get_plans() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plans', (select coalesce(jsonb_agg(public._plan(code) order by sort), '[]') from public.plans where active),
    'topups', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'credits', credits,
                 'price_kobo', price_kobo, 'play_product_id', play_product_id) order by credits), '[]')
               from public.topup_products where active),
    'avg_book_price_credits', public._config('avg_book_price_credits'),
    'credit_value_kobo', public._rules() -> 'credit_value_kobo')
$$;

create function public._my_subscription(p_user uuid) returns public.subscriptions
language sql stable security definer set search_path = '' as $$
  select * from public.subscriptions where user_id = p_user
  order by (status in ('active', 'grace', 'billing_retry', 'paused', 'cancelled')) desc, period_end desc limit 1
$$;

-- s-plans: the reader's plan, status, renewal and price.
create function public.get_plan_screen() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  s public.subscriptions;
begin
  s := public._my_subscription(v_user);
  return jsonb_build_object(
    'subscription', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'plan', public._plan(s.plan_code), 'status', s.status, 'store', s.store,
      'auto_renew', s.auto_renew, 'period_start', s.period_start, 'period_end', s.period_end,
      'pause_until', s.pause_until, 'pending_plan', public._plan(s.pending_plan_code),
      'price_kobo', case s.store when 'web' then (public._plan(s.plan_code) ->> 'price_web_kobo')::bigint
                                 else (public._plan(s.plan_code) ->> 'price_play_kobo')::bigint end) end,
    'balance', public.my_credit_balance(),
    'pause_max_months', public._rules() -> 'pause_max_months',
    'plans', public.get_plans() -> 'plans');
end $$;

-- s-credits: balance split, subscription and history. Pay-as-you-read chapter charges and their
-- undos group under their book (rule 14); everything else is one line per action (txn) and reason.
create function public.get_credits_screen(p_limit integer default 50, p_before timestamptz default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_lines jsonb;
begin
  with rows as (
    select l.*, b.title as book_title from public.credit_ledger l
    left join public.books b on b.id = l.book_id
    where l.user_id = v_user
  ), chapters as (
    select 'book_chapters' as kind, r.book_id::text as key, max(r.created_at) as at, sum(r.delta)::int as delta,
           max(r.book_title) as title,
           jsonb_build_object('book_id', r.book_id,
             'paid', -sum(r.delta)::int,
             'price', (select e.effective_price from public.book_effective e where e.book_id = r.book_id),
             'items', jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'delta', r.delta,
                        'at', r.created_at, 'chapter_uid', r.chapter_uid,
                        'chapter', (select c.title from public.chapters c
                                    join public.books bb on bb.current_revision_id = c.revision_id
                                    where bb.id = r.book_id and c.chapter_uid = r.chapter_uid))
                      order by r.created_at desc)) as detail
    from rows r where r.reason in ('chapter', 'undo') and r.book_id is not null and r.chapter_uid is not null
    group by r.book_id
  ), actions as (
    select r.reason::text as kind, r.txn_id::text || ':' || r.reason as key, max(r.created_at) as at,
           sum(r.delta)::int as delta, max(r.book_title) as title,
           jsonb_strip_nulls(jsonb_build_object('book_id', max(r.book_id::text), 'note', max(r.note),
             'ref_id', max(r.ref_id), 'counterparty', (select p.full_name from public.profiles p
                                                       where p.id = (array_agg(r.counterparty_user_id))[1]))) as detail
    from rows r where not (r.reason in ('chapter', 'undo') and r.book_id is not null and r.chapter_uid is not null)
    group by r.txn_id, r.reason
  ), lines as (
    select * from chapters union all select * from actions
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'at', at, 'delta', delta,
           'title', title, 'detail', detail) order by at desc), '[]')
  into v_lines
  from (select * from lines where delta <> 0 and (p_before is null or at < p_before)
        order by at desc limit least(greatest(p_limit, 1), 200)) x;

  return jsonb_build_object(
    'balance', public.my_credit_balance(),
    'plan', public._plan_state(v_user),
    'history', v_lines,
    'topups', public.get_plans() -> 'topups',
    'tip_presets', '[10, 25, 50, 100]'::jsonb,
    'message_cost', 5,
    'gift_min', 10);
end $$;

-- Pause a web subscription for 1–3 months from the end of this period (rule 17–18). In-app
-- subscribers pause in Google Play; the webhook reports it.
create function public.pause_subscription(p_months integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  s public.subscriptions;
begin
  s := public._my_subscription(v_user);
  if s.id is null or s.status <> 'active' then
    perform public._raise('no_active_plan');
  end if;
  if s.store <> 'web' then
    perform public._raise('pause_in_store');
  end if;
  if p_months is null or p_months < 1 or p_months > (public._rules() ->> 'pause_max_months')::int then
    perform public._raise('bad_months');
  end if;
  update public.subscriptions set status = 'paused', auto_renew = false,
    pause_until = s.period_end + make_interval(months => p_months)
  where id = s.id returning * into s;
  perform pgmq.send('payments_out', jsonb_build_object('kind', 'flutterwave_cancel_plan',
    'subscription_id', s.id, 'flutterwave_plan_id', s.flutterwave_plan_id));
  return jsonb_build_object('status', s.status, 'pause_until', s.pause_until);
end $$;

create function public.resume_subscription() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  s public.subscriptions;
begin
  s := public._my_subscription(v_user);
  if s.id is null or s.status <> 'paused' or s.store <> 'web' then
    perform public._raise('not_paused');
  end if;
  update public.subscriptions set status = 'active', auto_renew = true, pause_until = null where id = s.id;
  -- Inside the paid period nothing is charged; after it, the Worker charges and the webhook grants.
  if s.period_end <= now() then
    perform pgmq.send('payments_out', jsonb_build_object('kind', 'flutterwave_resume_charge',
      'subscription_id', s.id));
  end if;
  return jsonb_build_object('status', 'active');
end $$;

-- A reader asks for a web refund within 14 days. Recommendation per rule 32.
create function public.request_refund(p_transaction uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  t public.transactions;
  v_unspent int;
  v_used int;
  v_id uuid;
begin
  select * into t from public.transactions where id = p_transaction and user_id = v_user;
  if not found or t.store <> 'web' or t.status <> 'succeeded' then
    perform public._raise('not_refundable');
  end if;
  if t.created_at < now() - interval '14 days' then
    perform public._raise('refund_window_ended');
  end if;
  v_unspent := least(t.credits_granted, case when t.kind = 'plan'
    then public._bucket(v_user, 'plan') + public._bucket(v_user, 'rollover') else public._bucket(v_user, 'topup') end);
  v_used := t.credits_granted - greatest(v_unspent, 0);
  insert into public.refund_requests (transaction_id, user_id, reason, credits_granted, credits_used,
                                      recommendation, type, amount_kobo)
  values (t.id, v_user, coalesce(nullif(trim(p_reason), ''), 'No reason given'), t.credits_granted, v_used,
          case when t.flag = 'duplicate_charge' then 'duplicate'
               when t.created_at > now() - interval '7 days' and v_used * 4 < greatest(t.credits_granted, 1) then 'full'
               else 'partial' end,
          'full', t.gross_kobo)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  perform public._raise('refund_already_requested');
  return null;
end $$;

-- In-app redeem box (Default Q7: a field on s-credits). Bonus-credit codes only; discount and
-- trial codes work at web checkout.
create function public.redeem_promo(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_code text := lower(trim(coalesce(p_code, '')));
  p public.promo_codes;
  v_ledger bigint;
begin
  select * into p from public.promo_codes where code = v_code for update;
  if not found then
    perform public._raise('promo_unknown');
  end if;
  if p.status <> 'active' or p.starts_at > now() or (p.ends_at is not null and p.ends_at <= now()) then
    perform public._raise('promo_ended');
  end if;
  if p.max_uses is not null and p.uses >= p.max_uses then
    perform public._raise('promo_used_up');
  end if;
  if p.web_only or p.kind <> 'bonus_credits' then
    perform public._raise('promo_web_only');
  end if;
  if (select count(*) from public.promo_redemptions where code = v_code and user_id = v_user) >= p.uses_per_reader then
    perform public._raise('promo_already_used');
  end if;
  if p.new_readers_only and exists (select 1 from public.transactions where user_id = v_user) then
    perform public._raise('promo_new_readers_only');
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  v_ledger := public._ledger_add(v_user, p.amount, 'promo', 'promo', gen_random_uuid(),
    'promo:' || v_code || ':' || v_user || ':' ||
      (select count(*) from public.promo_redemptions where code = v_code and user_id = v_user),
    null, 'promo', v_code);
  insert into public.promo_redemptions (code, user_id, ledger_id) values (v_code, v_user, v_ledger);
  update public.promo_codes set uses = uses + 1, locked_at = coalesce(locked_at, now()) where code = v_code;
  return jsonb_build_object('credits', p.amount, 'balance', public._balance(v_user));
end $$;

-- ─── Staff RPCs ─────────────────────────────────────────────────────────────
create function public._require_money_staff() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_staff('finance') and public.staff_mfa_ok()) then
    raise exception 'Not allowed: money' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Rule 28: up to 500 applies at once (reason only); over 500 waits for a second approver.
create function public.staff_grant_credits(p_user uuid, p_credits integer, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_id bigint;
  v_req uuid;
begin
  perform public.require_permission('grant_credits');
  if p_credits is null or p_credits <= 0 or p_credits > 100000 then
    perform public._raise('bad_amount');
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    perform public._raise('reason_required');
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    perform public._raise('unknown_user');
  end if;
  if p_credits > 500 then
    insert into public.credit_grant_requests (user_id, credits, reason, requested_by)
    values (p_user, p_credits, trim(p_reason), v_actor) returning id into v_req;
    perform public.write_audit('money', 'request_credit_grant', 'user', p_user::text, null,
      format('Asked to grant %s credits', p_credits), null, jsonb_build_object('request_id', v_req), p_reason);
    return jsonb_build_object('status', 'pending', 'request_id', v_req);
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  v_id := public._ledger_add(p_user, p_credits, 'staff_adjust', 'promo', gen_random_uuid(), null, null,
    'staff', v_actor::text, trim(p_reason), '{}', v_actor);
  perform public.write_audit('money', 'grant_credits', 'user', p_user::text, null,
    format('Granted %s credits', p_credits), null, jsonb_build_object('ledger_id', v_id), p_reason);
  return jsonb_build_object('status', 'applied', 'ledger_id', v_id);
end $$;

create function public.decide_credit_grant(p_request uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  r public.credit_grant_requests;
  v_id bigint;
begin
  perform public._require_money_staff();
  select * into r from public.credit_grant_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    perform public._raise('not_pending');
  end if;
  if r.requested_by = v_actor then
    perform public._raise('same_person');
  end if;
  if not p_approve then
    update public.credit_grant_requests set status = 'rejected', approved_by = v_actor, decided_at = now()
    where id = r.id;
    perform public.write_audit('money', 'reject_credit_grant', 'user', r.user_id::text, null,
      format('Rejected a %s credit grant', r.credits), null, jsonb_build_object('request_id', r.id), r.reason);
    return jsonb_build_object('status', 'rejected');
  end if;
  perform pg_advisory_xact_lock(hashtext(r.user_id::text));
  v_id := public._ledger_add(r.user_id, r.credits, 'staff_adjust', 'promo', gen_random_uuid(),
    'grant_request:' || r.id, null, 'staff', r.requested_by::text, r.reason,
    jsonb_build_object('request_id', r.id, 'approved_by', v_actor), r.requested_by);
  update public.credit_grant_requests set status = 'applied', approved_by = v_actor, decided_at = now(),
    ledger_id = v_id where id = r.id;
  perform public.write_audit('money', 'approve_credit_grant', 'user', r.user_id::text, null,
    format('Approved a %s credit grant', r.credits), null, jsonb_build_object('request_id', r.id, 'ledger_id', v_id),
    r.reason);
  return jsonb_build_object('status', 'applied', 'ledger_id', v_id);
end $$;

-- Rule 30: return a pay-as-you-read chapter charge after the reader's own undo window ended.
-- Every row of the charge (one per bucket) is reversed into its own bucket; the author is not paid.
create function public.staff_return_chapter(p_charge bigint, p_reason_code text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  c public.credit_ledger;
  r public.credit_ledger;
  v_returned int := 0;
  v_txn uuid := gen_random_uuid();
begin
  if not (public.has_permission('answer_support') or public.has_permission('refund')) then
    raise exception 'Not allowed: return chapter' using errcode = 'insufficient_privilege';
  end if;
  if p_reason_code not in ('skipped_by_mistake', 'did_not_open', 'wrong_book') then
    perform public._raise('bad_reason');
  end if;
  select * into c from public.credit_ledger where id = p_charge;
  if not found or c.reason <> 'chapter' or c.delta >= 0 then
    perform public._raise('not_a_chapter_charge');
  end if;
  if exists (select 1 from public.credit_ledger u
             join public.credit_ledger x on x.id = u.ref_ledger_id
             where x.txn_id = c.txn_id and u.reason = 'undo') then
    perform public._raise('already_returned');
  end if;
  if c.created_at > now() - make_interval(mins => (public._rules() ->> 'undo_minutes')::int) then
    perform public._raise('undo_window_open');
  end if;
  perform pg_advisory_xact_lock(hashtext(c.user_id::text));
  for r in select * from public.credit_ledger where txn_id = c.txn_id and reason = 'chapter' and delta < 0 loop
    insert into public.credit_ledger (user_id, delta, reason, bucket, txn_id, ref_type, ref_id, book_id, chapter_uid,
      chapter_id, author_id, author_earning_kobo, ref_ledger_id, actor_id, note, meta, rate_version)
    values (r.user_id, -r.delta, 'undo', r.bucket, v_txn, 'ledger', r.id::text, r.book_id, r.chapter_uid, r.chapter_id, r.author_id, -r.author_earning_kobo, r.id,
      v_actor, coalesce(nullif(trim(p_note), ''), p_reason_code), jsonb_build_object('reason_code', p_reason_code),
      r.rate_version);
    v_returned := v_returned - r.delta;
  end loop;
  update public.entitlements set revoked_at = now(), revoked_reason = 'staff_return'
  where user_id = c.user_id and book_id = c.book_id and scope = 'chapter' and chapter_uid = c.chapter_uid
    and revoked_at is null;
  perform public.write_audit('money', 'return_chapter', 'ledger', c.id::text, null,
    format('Returned %s credits for a chapter', v_returned), null,
    jsonb_build_object('user_id', c.user_id, 'book_id', c.book_id, 'chapter_uid', c.chapter_uid), p_reason_code);
  return jsonb_build_object('returned', v_returned, 'balance', public._balance(c.user_id));
end $$;

-- Rule 32: Finance decides a web refund. Refund queues the Flutterwave call; the Worker then
-- calls complete_refund(). Decline emails the reader.
create function public.decide_refund(p_request uuid, p_refund boolean, p_type text default 'full',
                                     p_amount_kobo bigint default null, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  r public.refund_requests;
  t public.transactions;
begin
  perform public.require_permission('refund');
  perform public._require_money_staff();
  select * into r from public.refund_requests where id = p_request for update;
  if not found or r.status <> 'waiting' then
    perform public._raise('not_waiting');
  end if;
  select * into t from public.transactions where id = r.transaction_id;
  if not p_refund then
    update public.refund_requests set status = 'declined', decided_by = v_actor, decided_at = now(), note = p_note
    where id = r.id;
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'refund_declined', 'user_id', r.user_id,
      'refund_request_id', r.id, 'email', true));
  else
    if p_type not in ('full', 'partial')
       or (p_type = 'partial' and (p_amount_kobo is null or p_amount_kobo <= 0 or p_amount_kobo >= t.gross_kobo)) then
      perform public._raise('bad_amount');
    end if;
    update public.refund_requests set status = 'refunding', type = p_type,
      amount_kobo = case p_type when 'full' then t.gross_kobo else p_amount_kobo end,
      decided_by = v_actor, decided_at = now(), note = p_note
    where id = r.id returning * into r;
    perform pgmq.send('payments_out', jsonb_build_object('kind', 'flutterwave_refund', 'refund_request_id', r.id,
      'store_txn_id', t.store_txn_id, 'amount_kobo', r.amount_kobo));
  end if;
  perform public.write_audit('money', case when p_refund then 'refund' else 'decline_refund' end,
    'transaction', t.id::text, null,
    case when p_refund then format('Refund ₦%s', r.amount_kobo / 100) else 'Declined a refund' end,
    null, jsonb_build_object('refund_request_id', r.id, 'type', p_type), p_note);
  return jsonb_build_object('status', r.status);
end $$;

-- Worker: Flutterwave answered the refund. Claws back unspent credits in proportion to the amount.
create function public.complete_refund(p_request uuid, p_ok boolean, p_flutterwave_refund_id text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.refund_requests;
  t public.transactions;
  v_res jsonb := '{}';
begin
  select * into r from public.refund_requests where id = p_request for update;
  if not found or r.status <> 'refunding' then
    return jsonb_build_object('status', coalesce(r.status, 'unknown'));
  end if;
  if not p_ok then
    update public.refund_requests set status = 'failed' where id = r.id;
    return jsonb_build_object('status', 'failed');
  end if;
  select * into t from public.transactions where id = r.transaction_id for update;
  update public.transactions set refunded_kobo = least(gross_kobo, refunded_kobo + r.amount_kobo),
    status = case when r.type = 'full' then 'refunded' else status end
  where id = t.id;
  v_res := public.clawback_purchase(t.id, 'web refund', r.type = 'full' and t.kind = 'plan',
    case when r.type = 'full' then null
         else ceil(t.credits_granted * r.amount_kobo::numeric / greatest(t.gross_kobo, 1))::int end);
  update public.refund_requests set status = 'refunded', flutterwave_refund_id = p_flutterwave_refund_id
  where id = r.id;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'refund_done', 'user_id', r.user_id,
    'refund_request_id', r.id, 'email', true));
  return v_res || jsonb_build_object('status', 'refunded');
end $$;

-- Rule 33: extend a subscription by 7, 14 or 30 days (a RevenueCat promotional entitlement).
create function public.staff_extend_subscription(p_sub uuid, p_days integer, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.subscriptions;
begin
  perform public._require_money_staff();
  if p_days not in (7, 14, 30) then
    perform public._raise('bad_days');
  end if;
  select * into s from public.subscriptions where id = p_sub for update;
  if not found then
    perform public._raise('unknown_subscription');
  end if;
  update public.subscriptions set period_end = period_end + make_interval(days => p_days) where id = s.id;
  perform pgmq.send('payments_out', jsonb_build_object('kind', 'revenuecat_promo_grant', 'subscription_id', s.id,
    'user_id', s.user_id, 'days', p_days));
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'plan_extended', 'user_id', s.user_id, 'days', p_days));
  perform public.write_audit('money', 'extend_subscription', 'subscription', s.id::text, null,
    format('Extended by %s days', p_days), jsonb_build_object('period_end', s.period_end),
    jsonb_build_object('period_end', s.period_end + make_interval(days => p_days)), p_reason);
  return jsonb_build_object('period_end', s.period_end + make_interval(days => p_days));
end $$;

-- Rule 27: one-tap Freeze gifting (with Undo = call again with false).
create function public.set_gifting_frozen(p_frozen boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_money_staff();
  insert into public.app_config (key, value, updated_by) values ('gifting_frozen', to_jsonb(p_frozen), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
  perform public.write_audit('money', case when p_frozen then 'freeze_gifting' else 'unfreeze_gifting' end,
    'app_config', 'gifting_frozen', null, case when p_frozen then 'Froze gifting' else 'Unfroze gifting' end);
  return p_frozen;
end $$;

-- Rule 23: edit one plan's web price, credits, name and badge from an effective date.
create function public.save_plan(p_code text, p_name text, p_badge text, p_price_web_kobo bigint,
                                 p_credits integer, p_bonus integer, p_effective_from timestamptz,
                                 p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb := public._plan(p_code);
  v_check jsonb;
begin
  perform public._require_price_staff();
  if not public.is_staff('finance') then
    raise exception 'Not allowed: change_prices' using errcode = 'insufficient_privilege';
  end if;
  if v_before is null then
    perform public._raise('unknown_plan');
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 40 or p_price_web_kobo <= 0 or p_credits <= 0
     or coalesce(p_bonus, 0) < 0 then
    perform public._raise('bad_plan');
  end if;
  v_check := public._plan_check(public._rules(), jsonb_build_object(p_code, jsonb_build_object(
    'price_web_kobo', p_price_web_kobo, 'credits', p_credits, 'bonus_credits', coalesce(p_bonus, 0))));
  if exists (select 1 from jsonb_array_elements(v_check) x where not (x ->> 'ok')::boolean) then
    perform public._raise('plan_check_failed', jsonb_build_object('check', v_check));
  end if;
  insert into public.plan_price_versions (plan_code, name, badge, price_web_kobo, credits, bonus_credits,
                                          effective_from, changed_by, note)
  values (p_code, trim(p_name), nullif(trim(coalesce(p_badge, '')), ''), p_price_web_kobo, p_credits,
          coalesce(p_bonus, 0), greatest(coalesce(p_effective_from, now()), now()), auth.uid(), p_note);
  perform public.write_audit('money', 'save_plan', 'plan', p_code, trim(p_name), 'Changed plan', v_before,
    jsonb_build_object('name', p_name, 'badge', p_badge, 'price_web_kobo', p_price_web_kobo, 'credits', p_credits,
      'bonus_credits', p_bonus, 'effective_from', p_effective_from), p_note);
  return public._plan(p_code);
end $$;

create function public._validate_rules(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  r jsonb := public._rules() || coalesce(p, '{}');
begin
  if (r ->> 'words_per_page')::int not between 100 and 1000
     or (r ->> 'credits_per_page')::numeric not between 0.1 and 5
     or (r ->> 'credit_value_kobo')::int not between 50 and 10000
     or (r ->> 'preview_pct')::numeric not between 5 and 25
     or (r ->> 'split_pages')::int not between 5 and 100
     or (r ->> 'undo_minutes')::int not between 0 and 60
     or (r ->> 'author_rate_kobo')::int not between 1 and 10000
     or (r ->> 'rollover_cap_plans')::numeric not between 0 and 3
     or (r ->> 'pause_max_months')::int not between 1 and 3
     or (r ->> 'store_fee_pct')::numeric not between 0 and 50
     or jsonb_typeof(r -> 'auto_unlock_default') <> 'boolean' then
    perform public._raise('bad_rules');
  end if;
  return r;
end $$;

-- Rule 25: what saving these rules would change (s-pricing-rules-confirm).
create function public.preview_pricing_rules(p_rules jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_new jsonb;
  v_old jsonb := public._rules();
  v_res jsonb;
begin
  if not public.has_permission('change_prices') then
    raise exception 'Not allowed: change_prices' using errcode = 'insufficient_privilege';
  end if;
  v_new := public._validate_rules(p_rules);
  with prices as (
    select b.id, b.title, r.price_credits as before,
           greatest(ceil(r.words::numeric / (v_new ->> 'words_per_page')::numeric
                         * (v_new ->> 'credits_per_page')::numeric), 1)::int as after
    from public.books b join public.book_revisions r on r.id = b.current_revision_id
    where b.status = 'live' and b.price_override_credits is null and r.words is not null
  )
  select jsonb_build_object(
    'books_changed', count(*) filter (where before is distinct from after),
    'avg_before', round(avg(before), 1), 'avg_after', round(avg(after), 1),
    'biggest', (select jsonb_build_object('book_id', p2.id, 'title', p2.title, 'before', p2.before, 'after', p2.after)
                from prices p2 order by abs(p2.after - coalesce(p2.before, 0)) desc limit 1))
  into v_res from prices;
  return v_res || jsonb_build_object('rules', v_new, 'old_rules', v_old, 'effective_at', public._next_wat_midnight(),
    'plan_check', public._plan_check(v_new),
    'plan_check_ok', not exists (select 1 from jsonb_array_elements(public._plan_check(v_new)) x
                                 where not (x ->> 'ok')::boolean));
end $$;

-- Rule 24–25: Super admin with a fresh two-step code. Takes effect 00:00 WAT tomorrow; books are
-- repriced then by the pipeline Worker (queued); paid chapters and unlocked books keep their price.
create function public.save_pricing_rules(p_rules jsonb, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_preview jsonb;
  v_id uuid;
begin
  if not (public.is_staff('super_admin')
          and coalesce(public.staff_mfa_verified_at() > now() - interval '10 minutes', false)) then
    raise exception 'Not allowed: pricing rules' using errcode = 'insufficient_privilege';
  end if;
  v_preview := public.preview_pricing_rules(p_rules);
  if not (v_preview ->> 'plan_check_ok')::boolean then
    perform public._raise('plan_check_failed', jsonb_build_object('check', v_preview -> 'plan_check'));
  end if;
  insert into public.pricing_rule_versions (effective_at, rules, changed_by, approved_by, note)
  values ((v_preview ->> 'effective_at')::timestamptz, v_preview -> 'rules', auth.uid(), auth.uid(), p_note)
  returning id into v_id;
  perform pgmq.send('book_verify', jsonb_build_object('kind', 'reprice_all', 'rule_version', v_id,
    'effective_at', v_preview ->> 'effective_at'));
  perform public.write_audit('money', 'save_pricing_rules', 'pricing_rules', v_id::text, null,
    'Changed pricing rules', v_preview -> 'old_rules', v_preview -> 'rules', p_note);
  return jsonb_build_object('id', v_id, 'effective_at', v_preview ->> 'effective_at');
end $$;

-- Rule 34: promo codes. Codes cannot be edited after first use; pause and create a new one.
create function public.create_promo(p_code text, p_kind text, p_amount integer, p_max_uses integer,
                                    p_uses_per_reader integer, p_new_readers_only boolean, p_web_only boolean,
                                    p_starts_at timestamptz, p_ends_at timestamptz, p_campaign_tag text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
begin
  perform public._require_money_staff();
  if v_code !~ '^[a-z0-9]{4,16}$' then
    perform public._raise('bad_code');
  end if;
  if exists (select 1 from public.promo_codes where code = v_code) then
    perform public._raise('code_taken');
  end if;
  insert into public.promo_codes (code, kind, amount, max_uses, uses_per_reader, new_readers_only, web_only,
                                  starts_at, ends_at, campaign_tag, status, created_by)
  values (v_code, p_kind, p_amount, p_max_uses, coalesce(p_uses_per_reader, 1), coalesce(p_new_readers_only, false),
          coalesce(p_web_only, false), coalesce(p_starts_at, now()), p_ends_at, nullif(trim(p_campaign_tag), ''),
          case when coalesce(p_starts_at, now()) > now() then 'scheduled' else 'active' end, auth.uid());
  perform public.write_audit('money', 'create_promo', 'promo', v_code, upper(v_code), 'Created a promo code', null,
    jsonb_build_object('kind', p_kind, 'amount', p_amount, 'max_uses', p_max_uses));
  return v_code;
end $$;

create function public.set_promo_status(p_code text, p_status text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  p public.promo_codes;
begin
  perform public._require_money_staff();
  select * into p from public.promo_codes where code = lower(p_code) for update;
  if not found then
    perform public._raise('promo_unknown');
  end if;
  if p_status not in ('active', 'paused', 'ended') or p.status = 'ended' then
    perform public._raise('bad_status');
  end if;
  update public.promo_codes set status = p_status where code = p.code;
  perform public.write_audit('money', 'promo_status', 'promo', p.code, upper(p.code),
    format('Promo %s', p_status), jsonb_build_object('status', p.status), jsonb_build_object('status', p_status));
  return p_status;
end $$;

-- ─── Jobs ───────────────────────────────────────────────────────────────────
-- Rule 22: three days before renewal, 09:00 WAT (the job runs at 08:00 UTC). One per period.
create function public.job_renewal_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  with due as (
    update public.subscriptions s set reminder_sent_for = s.period_end
    where s.status = 'active' and s.auto_renew
      and s.period_end > now() + interval '2 days' and s.period_end <= now() + interval '3 days'
      and s.reminder_sent_for is distinct from s.period_end
      and not (s.plan_code = 'monthly' and s.period_start > now() - interval '3 days')
    returning s.id, s.user_id, s.plan_code, s.period_end, s.store
  )
  select count(*) into v_n from (
    select pgmq.send('user_notify', jsonb_build_object('kind', 'renewal_reminder', 'user_id', d.user_id,
      'subscription_id', d.id, 'plan', d.plan_code, 'period_end', d.period_end,
      'price_kobo', case d.store when 'web' then (public._plan(d.plan_code) ->> 'price_web_kobo')::bigint
                                 else (public._plan(d.plan_code) ->> 'price_play_kobo')::bigint end))
    from due d) x;
  return v_n;
end $$;

-- Every 15 minutes: grace, billing retry or cancelled past period end → expired with expiry rows.
create function public.job_expire_ended_subscriptions() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int := 0;
  s record;
begin
  for s in select id from public.subscriptions
           where status in ('grace', 'billing_retry', 'cancelled') and period_end < now() loop
    perform public._expire_subscription(s.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Hourly: web pauses that end now queue a resume charge (the webhook then grants).
create function public.job_resume_paused_web() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  -- reminder_sent_for = pause_until marks a pause end as queued, so each is queued once.
  with due as (
    update public.subscriptions s set reminder_sent_for = s.pause_until
    where s.store = 'web' and s.status = 'paused' and s.pause_until <= now()
      and s.reminder_sent_for is distinct from s.pause_until
    returning s.id
  )
  select count(*) into v_n from (
    select pgmq.send('payments_out', jsonb_build_object('kind', 'flutterwave_resume_charge', 'subscription_id', d.id))
    from due d
  ) q;
  return v_n;
end $$;

-- 00:10 WAT: yesterday's issued, spent and expired, and what is unspent (deferred revenue).
create function public.job_credit_daily_snapshot() returns void
language sql security definer set search_path = '' as $$
  insert into public.credit_daily_snapshot (day, issued, spent, expired, unspent_total, unspent_by_bucket)
  select d,
    coalesce((select sum(delta) from public.credit_ledger where delta > 0
              and reason in ('plan_grant', 'top_up', 'promo', 'staff_adjust')
              and (created_at at time zone 'Africa/Lagos')::date = d), 0),
    coalesce((select -sum(delta) from public.credit_ledger
              where reason in ('unlock_all', 'chapter', 'undo', 'tip', 'message', 'gift_out')
              and (created_at at time zone 'Africa/Lagos')::date = d), 0),
    coalesce((select -sum(delta) from public.credit_ledger where reason = 'expiry'
              and (created_at at time zone 'Africa/Lagos')::date = d), 0),
    (select coalesce(sum(plan + rollover + topup + promo), 0) from public.credit_balances),
    (select jsonb_build_object('plan', coalesce(sum(plan), 0), 'rollover', coalesce(sum(rollover), 0),
                               'topup', coalesce(sum(topup), 0), 'promo', coalesce(sum(promo), 0))
     from public.credit_balances)
  from (select ((now() at time zone 'Africa/Lagos')::date - 1) as d) x
  on conflict (day) do nothing
$$;

-- Nightly: recompute balances from the ledger; any difference is an alert.
create function public.job_ledger_reconcile() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  with truth as (
    select user_id,
           coalesce(sum(delta) filter (where bucket = 'plan'), 0) as plan,
           coalesce(sum(delta) filter (where bucket = 'rollover'), 0) as rollover,
           coalesce(sum(delta) filter (where bucket = 'topup'), 0) as topup,
           coalesce(sum(delta) filter (where bucket = 'promo'), 0) as promo
    from public.credit_ledger group by user_id
  ), diff as (
    insert into public.credit_alerts (user_id, kind, detail)
    select t.user_id, 'reconcile', jsonb_build_object('ledger', to_jsonb(t) - 'user_id',
             'cache', jsonb_build_object('plan', b.plan, 'rollover', b.rollover, 'topup', b.topup, 'promo', b.promo))
    from truth t left join public.credit_balances b on b.user_id = t.user_id
    where b.user_id is null or (t.plan, t.rollover, t.topup, t.promo) <> (b.plan, b.rollover, b.topup, b.promo)
    returning 1
  )
  select count(*) into v_n from diff;
  return v_n;
end $$;

select pgmq.create('payments_out');
select cron.schedule('renewal_reminders', '0 8 * * *', 'select public.job_renewal_reminders()');
select cron.schedule('expire_ended_subscriptions', '*/15 * * * *', 'select public.job_expire_ended_subscriptions()');
select cron.schedule('resume_paused_web', '5 * * * *', 'select public.job_resume_paused_web()');
select cron.schedule('credit_daily_snapshot', '10 23 * * *', 'select public.job_credit_daily_snapshot()');
select cron.schedule('ledger_reconcile', '40 1 * * *', 'select public.job_ledger_reconcile()');

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.plans enable row level security;
alter table public.plan_price_versions enable row level security;
alter table public.topup_products enable row level security;
alter table public.pricing_rule_versions enable row level security;
alter table public.payment_events enable row level security;
alter table public.transactions enable row level security;
alter table public.refund_requests enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_daily_snapshot enable row level security;
alter table public.credit_grant_requests enable row level security;
alter table public.credit_alerts enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

create policy plans_select on public.plans for select to authenticated using (true);
create policy topup_products_select on public.topup_products for select to authenticated using (true);
create policy plan_price_versions_select on public.plan_price_versions for select to authenticated
  using ((select public.is_staff_any(array['finance', 'analyst']::public.staff_role[])));
-- Rules in effect are public; future and past versions are staff only.
create policy pricing_rule_versions_select on public.pricing_rule_versions for select to authenticated
  using (id = (select public._rules_version())
         or (select public.is_staff_any(array['finance', 'analyst', 'publisher']::public.staff_role[])));
create policy payment_events_select on public.payment_events for select to authenticated
  using ((select public.is_staff('finance')));
create policy transactions_select on public.transactions for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.is_staff_any(array['finance', 'support']::public.staff_role[])));
create policy refund_requests_select on public.refund_requests for select to authenticated
  using ((select public.is_staff_any(array['finance', 'support']::public.staff_role[])));
create policy credit_balances_select on public.credit_balances for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.is_staff_any(array['finance', 'support']::public.staff_role[])));
create policy credit_daily_snapshot_select on public.credit_daily_snapshot for select to authenticated
  using ((select public.is_staff_any(array['finance', 'analyst']::public.staff_role[])));
create policy credit_grant_requests_select on public.credit_grant_requests for select to authenticated
  using ((select public.is_staff_any(array['finance', 'support', 'operations_admin']::public.staff_role[])));
create policy credit_alerts_select on public.credit_alerts for select to authenticated
  using ((select public.is_staff('finance')));
create policy promo_codes_select on public.promo_codes for select to authenticated
  using ((select public.is_staff_any(array['finance', 'support']::public.staff_role[])));
create policy promo_redemptions_select on public.promo_redemptions for select to authenticated
  using (user_id = (select auth.uid())
         or (select public.is_staff_any(array['finance', 'support']::public.staff_role[])));

-- ─── Grants ─────────────────────────────────────────────────────────────────
revoke all on public.plans, public.plan_price_versions, public.topup_products, public.pricing_rule_versions,
  public.payment_events, public.transactions, public.refund_requests, public.credit_balances,
  public.credit_daily_snapshot, public.credit_grant_requests, public.credit_alerts, public.promo_codes,
  public.promo_redemptions
  from anon, authenticated;
grant select on public.plans, public.plan_price_versions, public.topup_products, public.pricing_rule_versions,
  public.payment_events, public.transactions, public.refund_requests, public.credit_balances,
  public.credit_daily_snapshot, public.credit_grant_requests, public.credit_alerts, public.promo_codes,
  public.promo_redemptions
  to authenticated;
-- Money rows: written only by the definer functions above, never directly by the service role.
revoke insert, update, delete, truncate on public.transactions, public.refund_requests, public.credit_balances,
  public.credit_grant_requests, public.promo_redemptions, public.payment_events, public.pricing_rule_versions,
  public.plan_price_versions
  from service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        '_rules', '_rules_version', '_plan', '_bucket', '_next_wat_midnight', '_plan_check', '_ledger_add',
        '_ledger_balance_trigger', 'spend_credits', 'roll_over', 'grant_plan_credits', 'grant_topup',
        '_expire_subscription', 'clawback_purchase', '_event_plan_code', '_event_topup_code', 'apply_payment_event',
        'ingest_payment_event', 'my_credit_balance', 'get_plans', '_my_subscription', 'get_plan_screen',
        'get_credits_screen', 'pause_subscription', 'resume_subscription', 'request_refund', 'redeem_promo',
        '_require_money_staff', 'staff_grant_credits', 'decide_credit_grant', 'staff_return_chapter',
        'decide_refund', 'complete_refund', 'staff_extend_subscription', 'set_gifting_frozen', 'save_plan',
        '_validate_rules', 'preview_pricing_rules', 'save_pricing_rules', 'create_promo', 'set_promo_status',
        'job_renewal_reminders', 'job_expire_ended_subscriptions', 'job_resume_paused_web',
        'job_credit_daily_snapshot', 'job_ledger_reconcile')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

-- RLS helper used in the pricing_rule_versions policy.
grant execute on function public._rules_version(timestamptz) to authenticated;

-- Readers (own JWT).
grant execute on function
  public.my_credit_balance(),
  public.get_plans(),
  public.get_plan_screen(),
  public.get_credits_screen(integer, timestamptz),
  public.pause_subscription(integer),
  public.resume_subscription(),
  public.request_refund(uuid, text),
  public.redeem_promo(text)
  to authenticated;

-- Staff (own JWT; each checks its own permission).
grant execute on function
  public.staff_grant_credits(uuid, integer, text),
  public.decide_credit_grant(uuid, boolean),
  public.staff_return_chapter(bigint, text, text),
  public.decide_refund(uuid, boolean, text, bigint, text),
  public.staff_extend_subscription(uuid, integer, text),
  public.set_gifting_frozen(boolean),
  public.save_plan(text, text, text, bigint, integer, integer, timestamptz, text),
  public.preview_pricing_rules(jsonb),
  public.save_pricing_rules(jsonb, text),
  public.create_promo(text, text, integer, integer, integer, boolean, boolean, timestamptz, timestamptz, text),
  public.set_promo_status(text, text)
  to authenticated;

-- Workers (service key).
grant execute on function
  public.ingest_payment_event(text, text, text, timestamptz, jsonb, jsonb),
  public.complete_refund(uuid, boolean, text),
  public.get_plans()
  to service_role;

-- Flow 03's config packs/plans now mirror these tables.
insert into public.app_config (key, value) values ('gifting_frozen', 'false') on conflict (key) do nothing;
