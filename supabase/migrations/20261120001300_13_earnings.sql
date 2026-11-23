-- Flow 13 · Author earnings and payouts (docs/prd/13-earnings-payouts.md).
-- Authors earn author_earning_kobo stamped on each ledger spend row (flow 09 writes it at the rate
-- in force, with rate_version). Reversal rows (undo, Support return) carry the negative amount, so a
-- month nets by summing its rows; nothing here edits the ledger. Rows that must not be paid
-- (self-reads, gift loops) get an append-only earning_exclusions row instead.
--
-- Cycle: open → closed (close_cycle, 1st 00:05 WAT) → prepared (Finance) → releasing (a different
-- Super admin, 2-step in the last 10 minutes) → paid / paid_with_failures (Flutterwave webhooks).
-- Unpaid lines (carried below the minimum, held) carry into the next close; failed transfers stay
-- on their line and are retried through retry_payout only, so no amount is ever paid twice.

create type public.earning_cycle_status as enum (
  'open', 'closed', 'prepared', 'approved', 'releasing', 'paid', 'paid_with_failures'
);
create type public.author_earning_status as enum (
  'payable', 'carried', 'held_unverified', 'held_paused', 'held_dispute', 'queued', 'paid', 'partly_failed'
);
create type public.earning_exclusion_reason as enum (
  'undone', 'staff_return', 'refund_clawback', 'gift_loop', 'self_read', 'takedown'
);
create type public.payout_run_status as enum ('queued', 'sending', 'done', 'done_with_failures');
create type public.payout_status as enum ('queued', 'pending', 'successful', 'failed', 'reversed');
create type public.bank_account_status as enum ('needs_review', 'verified', 'rejected', 'replaced');
create type public.statement_kind as enum ('cycle', 'year_to_date');

-- ─── Settings (versioned; the newest row applies to the open cycle) ─────────
create table public.earning_settings (
  id bigint generated always as identity primary key,
  hold_days integer not null check (hold_days between 0 and 120),
  min_payout_kobo bigint not null check (min_payout_kobo between 0 and 100000000),
  payout_day integer not null check (payout_day between 1 and 28),
  gift_loop_detection boolean not null default true,
  effective_from timestamptz not null default now(),
  changed_by uuid references public.profiles (id),
  note text
);
insert into public.earning_settings (hold_days, min_payout_kobo, payout_day, gift_loop_detection, note)
values (30, 100000, 15, true, 'Launch defaults');

create function public._earning_settings() returns public.earning_settings
language sql stable security definer set search_path = '' as $$
  select * from public.earning_settings order by id desc limit 1
$$;

-- ─── Cycles and lines ───────────────────────────────────────────────────────
create table public.earning_cycles (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  status public.earning_cycle_status not null default 'open',
  closed_at timestamptz,
  credits_books integer not null default 0,
  credits_tips_messages integer not null default 0,
  earnings_kobo bigint not null default 0,
  net_revenue_kobo bigint,
  prepared_by uuid references public.profiles (id),
  prepared_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  hold_days integer,
  payout_date date,
  min_payout_kobo bigint,
  ledger_check jsonb,
  checks jsonb,
  legacy boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.author_earnings (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.earning_cycles (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  book_credits integer not null default 0,
  tip_message_credits integer not null default 0,
  excluded_credits integer not null default 0,
  amount_kobo bigint not null default 0,
  carry_in_kobo bigint not null default 0,
  adjustment_kobo bigint not null default 0,
  payable_kobo bigint not null default 0,
  status public.author_earning_status not null,
  held_reason text,
  -- Set when the next close carries this unpaid line in, so it is never paid twice.
  carried_to uuid references public.author_earnings (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (cycle_id, author_id)
);
create index author_earnings_author_idx on public.author_earnings (author_id, created_at desc);

create table public.earning_exclusions (
  id bigint generated always as identity primary key,
  ledger_id bigint not null references public.credit_ledger (id),
  -- The cycle that accounted for it (null until a close picks it up).
  cycle_id uuid references public.earning_cycles (id) on delete set null,
  reason public.earning_exclusion_reason not null,
  credits integer not null,
  kobo bigint not null,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (ledger_id, reason)
);

-- ─── Bank accounts, holds, runs, payouts, statements ───────────────────────
create table public.author_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  bank_code text not null check (bank_code ~ '^[0-9A-Za-z]{2,10}$'),
  bank_name text not null check (char_length(bank_name) between 1 and 80),
  account_last4 text not null check (account_last4 ~ '^\d{4}$'),
  -- Encrypted by the bank Worker; the key never reaches the database. Never granted to clients.
  account_number_enc bytea not null,
  bank_account_name text not null,
  legal_name text not null default '',
  match_score numeric(5, 2) not null check (match_score between 0 and 100),
  status public.bank_account_status not null,
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  rejected_reason text,
  document_requested_at timestamptz,
  payouts_resume_at timestamptz not null,
  id_document_key text,
  created_at timestamptz not null default now()
);
-- One live account per author (older ones are `replaced`).
create unique index author_bank_accounts_live_idx on public.author_bank_accounts (author_id)
  where status in ('needs_review', 'verified');
create index author_bank_accounts_review_idx on public.author_bank_accounts (created_at)
  where status = 'needs_review';

create table public.payout_holds (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  reason text not null check (reason in ('account_dispute', 'suspected_fraud', 'author_request', 'other')),
  note text,
  set_by uuid references public.profiles (id),
  set_at timestamptz not null default now(),
  lifted_by uuid references public.profiles (id),
  lifted_at timestamptz
);
create unique index payout_holds_active_idx on public.payout_holds (author_id) where lifted_at is null;

create table public.payout_runs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.earning_cycles (id),
  started_by uuid references public.profiles (id),
  approved_by uuid references public.profiles (id),
  total_kobo bigint not null default 0,
  authors integer not null default 0,
  status public.payout_run_status not null default 'queued',
  created_at timestamptz not null default now()
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payout_runs (id),
  author_earning_id uuid not null references public.author_earnings (id),
  author_id uuid not null references public.profiles (id),
  bank_account_id uuid references public.author_bank_accounts (id),
  amount_kobo bigint not null check (amount_kobo > 0),
  attempt integer not null check (attempt between 1 and 20),
  reference text not null unique,
  flutterwave_transfer_id text unique,
  status public.payout_status not null default 'queued',
  failure_reason text,
  -- Waiting for a new account to be verified (retry mode new_account_when_verified).
  waiting_for_account boolean not null default false,
  -- Not sent before this time (48-hour bank change pause, automatic retry delay).
  not_before timestamptz not null default now(),
  api_errors integer not null default 0,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  settled_at timestamptz,
  raised_at timestamptz,
  retry_of uuid references public.payouts (id),
  unique (author_earning_id, attempt)
);
create index payouts_send_idx on public.payouts (not_before) where status = 'queued' and not waiting_for_account;
create index payouts_pending_idx on public.payouts (sent_at) where status = 'pending';

-- Flutterwave transfer events already applied (webhook replays change nothing).
create table public.payout_events (
  event_id text primary key,
  payout_id uuid references public.payouts (id),
  status public.payout_status not null,
  applied boolean not null,
  received_at timestamptz not null default now()
);

create table public.author_statements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id),
  cycle_id uuid references public.earning_cycles (id),
  kind public.statement_kind not null,
  file_key text not null,
  created_at timestamptz not null default now()
);
create unique index author_statements_cycle_idx on public.author_statements (author_id, cycle_id)
  where kind = 'cycle';

select pgmq.create('payout_transfer');

-- ─── Append-only guards ─────────────────────────────────────────────────────
-- Exclusions never change, except which cycle accounted for them (a re-run of close_cycle).
create function public._exclusions_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'earning_exclusions is append-only' using errcode = 'insufficient_privilege';
  end if;
  if (new.ledger_id, new.reason, new.credits, new.kobo, new.actor_id, new.created_at)
     is distinct from (old.ledger_id, old.reason, old.credits, old.kobo, old.actor_id, old.created_at) then
    raise exception 'earning_exclusions is append-only' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger earning_exclusions_guard before update or delete on public.earning_exclusions
  for each row execute function public._exclusions_guard();

create function public._payout_events_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'payout_events is append-only' using errcode = 'insufficient_privilege';
end $$;
create trigger payout_events_guard before update or delete on public.payout_events
  for each row execute function public._payout_events_guard();

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- WAT month [start, end) for a month's first day.
create function public._cycle_start(p_month date) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_month::timestamp) at time zone 'Africa/Lagos'
$$;
create function public._cycle_end(p_month date) returns timestamptz
language sql immutable set search_path = '' as $$
  select ((p_month + interval '1 month')::timestamp) at time zone 'Africa/Lagos'
$$;

-- Rule 9: first payout day on or after close + hold days (WAT dates). Same as core payoutDate().
create function public._payout_date(p_closed_at timestamptz, p_hold_days int, p_payout_day int) returns date
language sql immutable set search_path = '' as $$
  select case when extract(day from d) <= p_payout_day
              then (date_trunc('month', d) + make_interval(days => p_payout_day - 1))::date
              else (date_trunc('month', d) + interval '1 month' + make_interval(days => p_payout_day - 1))::date
         end
  from (select ((p_closed_at at time zone 'Africa/Lagos')::date + p_hold_days)::timestamp as d) x
$$;

-- Rule 15: ARP-PO-{YYYYMM}-{author without dashes}-{attempt}. Same as core payoutReference().
create function public._payout_reference(p_month date, p_author uuid, p_attempt int) returns text
language sql immutable set search_path = '' as $$
  select 'ARP-PO-' || to_char(p_month, 'YYYYMM') || '-' || replace(p_author::text, '-', '') || '-' || p_attempt
$$;

-- Transfer status order ("Double webhook"). Same as core transferStatusApplies().
create function public._transfer_status_applies(p_current public.payout_status, p_next public.payout_status)
returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_current = p_next then false
    when p_current in ('failed', 'reversed') then false
    when p_current = 'successful' then p_next = 'reversed'
    else (case p_next when 'queued' then 0 when 'pending' then 1 else 2 end)
       > (case p_current when 'queued' then 0 when 'pending' then 1 else 2 end)
  end
$$;

-- Finance prepares and retries; Super admin also approves, releases and saves settings.
create function public._require_payout_staff() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('release_payouts') then
    raise exception 'Not allowed: release_payouts' using errcode = 'insufficient_privilege';
  end if;
end $$;

create function public._require_payout_super(p_fresh boolean default false) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_staff('super_admin') and public.has_permission('release_payouts')) then
    raise exception 'Not allowed: Super admin only' using errcode = 'insufficient_privilege';
  end if;
  if p_fresh and not coalesce(public.staff_mfa_verified_at() > now() - interval '10 minutes', false) then
    raise exception 'two_step_required' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- The author's live, verified account that may receive money now (rule 23: 48-hour pause).
create function public._payable_account(p_author uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.author_bank_accounts
  where author_id = p_author and status = 'verified' and payouts_resume_at <= now()
$$;

-- Hold state for a line: dispute (suspended author), paused, unverified, or none.
create function public._line_status(p_author uuid, p_payable bigint, p_min bigint)
returns table (status public.author_earning_status, held_reason text)
language sql stable security definer set search_path = '' as $$
  select
    case
      when p_payable < p_min then 'carried'::public.author_earning_status
      when a.status::text = 'suspended' then 'held_dispute'
      when coalesce(a.payouts_paused, false) or h.id is not null then 'held_paused'
      when not exists (select 1 from public.author_bank_accounts b
                       where b.author_id = p_author and b.status = 'verified') then 'held_unverified'
      else 'payable'
    end,
    case
      when p_payable < p_min then null
      when a.status::text = 'suspended' then coalesce(a.suspended_reason, 'Author suspended')
      when coalesce(a.payouts_paused, false) or h.id is not null
        then coalesce(h.reason, a.payouts_paused_reason, 'Payouts paused')
      when not exists (select 1 from public.author_bank_accounts b
                       where b.author_id = p_author and b.status = 'verified') then 'Bank account not verified'
    end
  from (select 1) one
  left join public.author_profiles a on a.user_id = p_author
  left join public.payout_holds h on h.author_id = p_author and h.lifted_at is null
$$;

-- Ledger totals for a month: what the lines must add up to (rule 13, recheck_cycle).
create function public._cycle_ledger(p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'ledger_kobo', coalesce(sum(l.author_earning_kobo), 0),
    'rows', count(*))
  from public.credit_ledger l
  where l.author_id is not null and l.author_earning_kobo <> 0
    and l.created_at >= public._cycle_start(p_month) and l.created_at < public._cycle_end(p_month)
$$;

-- ─── close_cycle (rule 7–12; cron 1st 00:05 WAT; Super admin may re-run before preparing) ──
create function public._close_cycle(p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := public._cycle_start(p_month);
  v_end timestamptz := public._cycle_end(p_month);
  st public.earning_settings := public._earning_settings();
  c public.earning_cycles;
  v_lines int;
  v_check jsonb;
  v_lines_kobo bigint;
  v_excl_kobo bigint;
  v_adj_in_window bigint;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    perform public._raise('bad_month');
  end if;
  if now() < v_end then
    perform public._raise('month_not_ended');
  end if;
  insert into public.earning_cycles (month) values (p_month) on conflict (month) do nothing;
  select * into c from public.earning_cycles where month = p_month for update;
  if c.legacy or c.status not in ('open', 'closed') then
    perform public._raise('cycle_locked', jsonb_build_object('status', c.status));
  end if;

  -- Re-run: undo this cycle's own work first (nothing has been paid from it yet).
  update public.author_earnings set carried_to = null
  where carried_to in (select id from public.author_earnings where cycle_id = c.id);
  update public.earning_exclusions set cycle_id = null where cycle_id = c.id;
  delete from public.author_earnings where cycle_id = c.id;

  -- Self-reads never earn (rule 4): record them so the month excludes them.
  insert into public.earning_exclusions (ledger_id, reason, credits, kobo)
  select l.id, 'self_read', -l.delta, l.author_earning_kobo
  from public.credit_ledger l
  where l.author_id is not null and l.user_id = l.author_id and l.author_earning_kobo <> 0
    and l.created_at >= v_start and l.created_at < v_end
  on conflict (ledger_id, reason) do nothing;
  -- Undone and returned chapters: counted for "what was not paid" (their reversal rows net).
  insert into public.earning_exclusions (ledger_id, reason, credits, kobo)
  select l.ref_ledger_id, case when l.idempotency_key like 'return:%' then 'staff_return' else 'undone' end
           ::public.earning_exclusion_reason,
         l.delta, -l.author_earning_kobo
  from public.credit_ledger l
  where l.reason = 'undo' and l.author_id is not null and l.ref_ledger_id is not null
    and l.created_at >= v_start and l.created_at < v_end
  on conflict (ledger_id, reason) do nothing;
  -- This cycle accounts for every exclusion not yet picked up whose row is this month or earlier.
  update public.earning_exclusions x set cycle_id = c.id
  from public.credit_ledger l
  where l.id = x.ledger_id and x.cycle_id is null and l.created_at < v_end;

  with lr as (
    select l.*,
      -- Excluded rows are left out (self-read, gift loop, takedown, refund clawback).
      exists (select 1 from public.earning_exclusions x
              where x.ledger_id = l.id and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback'))
        as excluded,
      -- A reversal of a charge from an earlier month is a late event: an adjustment (rule 8).
      (l.ref_ledger_id is not null and exists (select 1 from public.credit_ledger o
                                               where o.id = l.ref_ledger_id and o.created_at < v_start)) as late
    from public.credit_ledger l
    where l.author_id is not null and l.author_earning_kobo <> 0
      and l.created_at >= v_start and l.created_at < v_end
  ),
  -- Late exclusions (gift loop found after its month closed) come off this cycle as an adjustment.
  late_excl as (
    select l.author_id, -sum(x.kobo) as kobo
    from public.earning_exclusions x join public.credit_ledger l on l.id = x.ledger_id
    where x.cycle_id = c.id and l.created_at < v_start
      and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback')
    group by l.author_id
  ),
  carry as (
    select e.author_id, sum(e.payable_kobo) as kobo
    from public.author_earnings e join public.earning_cycles pc on pc.id = e.cycle_id
    -- Only from released months: an unreleased month still pays its own lines.
    where pc.month < p_month and e.carried_to is null
      and pc.status in ('releasing', 'paid', 'paid_with_failures')
      and e.status in ('carried', 'held_unverified', 'held_paused', 'held_dispute')
    group by e.author_id
  ),
  per_author as (
    select a.author_id,
      coalesce(sum(-r.delta) filter (where not r.excluded and not r.late
                                     and r.reason in ('unlock_all', 'chapter', 'undo')), 0)::int as book_credits,
      coalesce(sum(-r.delta) filter (where not r.excluded and not r.late
                                     and r.reason in ('tip', 'message')), 0)::int as tm_credits,
      coalesce(sum(-r.delta) filter (where r.excluded), 0)::int as excl_credits,
      coalesce(sum(r.author_earning_kobo) filter (where not r.excluded and not r.late), 0)::bigint as amount,
      coalesce(sum(r.author_earning_kobo) filter (where not r.excluded and r.late), 0)::bigint as late_kobo
    from (select author_id from lr union select author_id from late_excl union select author_id from carry) a
    left join lr r on r.author_id = a.author_id
    group by a.author_id
  ),
  lines as (
    select p.*, coalesce(cr.kobo, 0)::bigint as carry_in,
      (p.late_kobo + coalesce(le.kobo, 0))::bigint as adjustment
    from per_author p
    left join carry cr on cr.author_id = p.author_id
    left join late_excl le on le.author_id = p.author_id
  )
  insert into public.author_earnings (cycle_id, author_id, book_credits, tip_message_credits, excluded_credits,
                                      amount_kobo, carry_in_kobo, adjustment_kobo, payable_kobo, status, held_reason)
  select c.id, l.author_id, l.book_credits, l.tm_credits, l.excl_credits, l.amount, l.carry_in, l.adjustment,
         l.amount + l.carry_in + l.adjustment, s.status, s.held_reason
  from lines l
  cross join lateral public._line_status(l.author_id, l.amount + l.carry_in + l.adjustment, st.min_payout_kobo) s
  where l.amount <> 0 or l.carry_in <> 0 or l.adjustment <> 0 or l.excl_credits <> 0;
  get diagnostics v_lines = row_count;

  -- Carried-in lines now live in this cycle.
  update public.author_earnings e set carried_to = n.id
  from public.author_earnings n, public.earning_cycles pc
  where n.cycle_id = c.id and n.author_id = e.author_id and pc.id = e.cycle_id and pc.month < p_month
    and pc.status in ('releasing', 'paid', 'paid_with_failures')
    and e.carried_to is null and e.status in ('carried', 'held_unverified', 'held_paused', 'held_dispute');

  -- ledger_check: every earning row of the month is in a line, an exclusion or an adjustment.
  v_check := public._cycle_ledger(p_month);
  select coalesce(sum(amount_kobo), 0) into v_lines_kobo from public.author_earnings where cycle_id = c.id;
  select coalesce(sum(l.author_earning_kobo), 0) into v_excl_kobo
  from public.credit_ledger l
  where l.created_at >= v_start and l.created_at < v_end and l.author_id is not null
    and exists (select 1 from public.earning_exclusions x where x.ledger_id = l.id
                and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback'));
  select coalesce(sum(l.author_earning_kobo), 0) into v_adj_in_window
  from public.credit_ledger l
  where l.created_at >= v_start and l.created_at < v_end and l.author_id is not null and l.ref_ledger_id is not null
    and exists (select 1 from public.credit_ledger o where o.id = l.ref_ledger_id and o.created_at < v_start)
    and not exists (select 1 from public.earning_exclusions x where x.ledger_id = l.id
                    and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback'));
  v_check := v_check || jsonb_build_object('lines_kobo', v_lines_kobo, 'excluded_kobo', v_excl_kobo,
    'late_kobo', v_adj_in_window,
    'diff_kobo', (v_check ->> 'ledger_kobo')::bigint - v_lines_kobo - v_excl_kobo - v_adj_in_window,
    'checked_at', now());

  update public.earning_cycles set
    status = 'closed',
    closed_at = coalesce(closed_at, now()),
    hold_days = st.hold_days,
    min_payout_kobo = st.min_payout_kobo,
    payout_date = public._payout_date(coalesce(closed_at, now()), st.hold_days, st.payout_day),
    credits_books = (select coalesce(sum(book_credits), 0) from public.author_earnings where cycle_id = c.id),
    credits_tips_messages = (select coalesce(sum(tip_message_credits), 0) from public.author_earnings
                             where cycle_id = c.id),
    earnings_kobo = v_lines_kobo,
    ledger_check = v_check
  where id = c.id
  returning * into c;

  if auth.uid() is not null then
    perform public.write_audit('money', 'cycle.close', 'earning_cycle', c.id::text, to_char(p_month, 'Mon YYYY'),
      format('Closed %s: %s authors, %s kobo', to_char(p_month, 'Mon YYYY'), v_lines, v_lines_kobo));
  end if;
  return jsonb_build_object('cycle_id', c.id, 'authors', v_lines, 'earnings_kobo', c.earnings_kobo,
    'payout_date', c.payout_date, 'ledger_check', c.ledger_check);
end $$;

create function public.close_cycle(p_month date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public._is_service() then
    perform public._require_payout_super();
  end if;
  return public._close_cycle(p_month);
end $$;

-- Cron (every day 23:05 UTC = 00:05 WAT): on the 1st in Lagos, close last month.
create function public.close_cycle_due() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  if extract(day from v_today) = 1
     and not exists (select 1 from public.earning_cycles
                     where month = (v_today - interval '1 month')::date and status <> 'open') then
    perform public._close_cycle((v_today - interval '1 month')::date);
  end if;
end $$;

-- ─── recheck_cycle (rule 13; release blocked unless the difference is zero) ──
create function public.recheck_cycle(p_cycle uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  v_now jsonb;
  v_diff bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    perform public._require_payout_staff();
  end if;
  select * into c from public.earning_cycles where id = p_cycle;
  if c.id is null or c.ledger_check is null then
    perform public._raise('not_found');
  end if;
  v_now := public._cycle_ledger(c.month);
  -- Rows written into the month after close (or lines edited) show up as a difference.
  v_diff := (v_now ->> 'ledger_kobo')::bigint - (c.ledger_check ->> 'ledger_kobo')::bigint
            + coalesce((c.ledger_check ->> 'diff_kobo')::bigint, 0)
            + (c.ledger_check ->> 'lines_kobo')::bigint
            - (select coalesce(sum(amount_kobo), 0) from public.author_earnings where cycle_id = c.id);
  return jsonb_build_object('diff_kobo', v_diff, 'ledger_kobo', (v_now ->> 'ledger_kobo')::bigint,
    'closed_ledger_kobo', (c.ledger_check ->> 'ledger_kobo')::bigint,
    'lines_kobo', (select coalesce(sum(amount_kobo), 0) from public.author_earnings where cycle_id = c.id),
    'checked_at', now());
end $$;

-- ─── prepare_cycle (rule 13) ────────────────────────────────────────────────
-- p_flutterwave_balance_kobo comes from the bank Worker (the console fetches it); null = unknown.
create function public.prepare_cycle(p_cycle uuid, p_flutterwave_balance_kobo bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  v_recheck jsonb;
  v_sendable bigint;
  v_unverified jsonb;
  v_failed int;
  v_checks jsonb;
begin
  perform public._require_payout_staff();
  select * into c from public.earning_cycles where id = p_cycle for update;
  if c.id is null then
    perform public._raise('not_found');
  end if;
  if c.status <> 'closed' then
    perform public._raise('bad_status', jsonb_build_object('status', c.status));
  end if;
  -- Re-read hold states (an account may have been verified or a pause lifted since close).
  update public.author_earnings e set (status, held_reason) =
    (select s.status, s.held_reason from public._line_status(e.author_id, e.payable_kobo, c.min_payout_kobo) s)
  where e.cycle_id = c.id;

  v_recheck := public.recheck_cycle(c.id);
  select coalesce(sum(payable_kobo), 0) into v_sendable from public.author_earnings
  where cycle_id = c.id and status = 'payable';
  select coalesce(jsonb_agg(jsonb_build_object('author_id', author_id, 'payable_kobo', payable_kobo)), '[]')
  into v_unverified from public.author_earnings where cycle_id = c.id and status = 'held_unverified';
  select count(*)::int into v_failed from public.payouts p
  join public.author_earnings e on e.id = p.author_earning_id
  join public.earning_cycles pc on pc.id = e.cycle_id
  where pc.month < c.month and p.status in ('failed', 'reversed')
    and not exists (select 1 from public.payouts n where n.author_earning_id = p.author_earning_id
                    and n.attempt > p.attempt);
  v_checks := jsonb_build_object(
    'ledger_match', (v_recheck ->> 'diff_kobo')::bigint = 0,
    'diff_kobo', (v_recheck ->> 'diff_kobo')::bigint,
    'hold_ended', now() >= c.closed_at + make_interval(days => c.hold_days),
    'hold_ends_at', c.closed_at + make_interval(days => c.hold_days),
    'sendable_kobo', v_sendable,
    'flutterwave_balance_kobo', p_flutterwave_balance_kobo,
    'balance_ok', p_flutterwave_balance_kobo is null or p_flutterwave_balance_kobo >= v_sendable,
    'unverified', v_unverified,
    'previous_failed', v_failed);
  if not (v_checks ->> 'ledger_match')::boolean then
    perform public._raise('ledger_mismatch', v_checks);
  end if;
  if not (v_checks ->> 'hold_ended')::boolean then
    perform public._raise('hold_not_ended', v_checks);
  end if;
  update public.earning_cycles set status = 'prepared', prepared_by = auth.uid(), prepared_at = now(),
    checks = v_checks
  where id = c.id;
  perform public.write_audit('money', 'cycle.prepare', 'earning_cycle', c.id::text, to_char(c.month, 'Mon YYYY'),
    format('Prepared %s: %s kobo to send', to_char(c.month, 'Mon YYYY'), v_sendable), null, v_checks);
  return v_checks;
end $$;

-- ─── release_cycle (rule 14–15) ─────────────────────────────────────────────
-- Super admin, not the preparer, 2-step in the last 10 minutes. Sends every payable line with a
-- payable account now; lines whose account is inside its 48-hour pause wait in the queue
-- (not_before). Calling it twice returns the same run and creates nothing new.
create function public.release_cycle(p_cycle uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  r public.payout_runs;
  v_recheck jsonb;
  e record;
  v_pid uuid;
begin
  perform public._require_payout_super(true);
  select * into c from public.earning_cycles where id = p_cycle for update;
  if c.id is null then
    perform public._raise('not_found');
  end if;
  if c.status in ('releasing', 'paid', 'paid_with_failures') then
    select * into r from public.payout_runs where cycle_id = c.id order by created_at limit 1;
    return jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo, 'replayed', true);
  end if;
  if c.status <> 'prepared' then
    perform public._raise('bad_status', jsonb_build_object('status', c.status));
  end if;
  if c.prepared_by = auth.uid() then
    perform public._raise('same_person');
  end if;
  if now() < c.closed_at + make_interval(days => c.hold_days) then
    perform public._raise('hold_not_ended');
  end if;
  v_recheck := public.recheck_cycle(c.id);
  if (v_recheck ->> 'diff_kobo')::bigint <> 0 then
    perform public._raise('ledger_mismatch', v_recheck);
  end if;

  insert into public.payout_runs (cycle_id, started_by, approved_by)
  values (c.id, c.prepared_by, auth.uid()) returning * into r;
  for e in
    select ae.*, b.id as account_id, b.payouts_resume_at
    from public.author_earnings ae
    join public.author_bank_accounts b on b.author_id = ae.author_id and b.status = 'verified'
    where ae.cycle_id = c.id and ae.status = 'payable' and ae.payable_kobo > 0
  loop
    v_pid := null;
    insert into public.payouts (run_id, author_earning_id, author_id, bank_account_id, amount_kobo, attempt,
                                reference, not_before)
    values (r.id, e.id, e.author_id, e.account_id, e.payable_kobo, 1,
            public._payout_reference(c.month, e.author_id, 1), greatest(now(), e.payouts_resume_at))
    on conflict (reference) do nothing
    returning id into v_pid;
    if v_pid is not null then
      perform pgmq.send('payout_transfer', jsonb_build_object('payout_id', v_pid));
      update public.author_earnings set status = 'queued' where id = e.id;
    end if;
  end loop;
  update public.payout_runs set
    authors = (select count(*) from public.payouts where run_id = r.id),
    total_kobo = (select coalesce(sum(amount_kobo), 0) from public.payouts where run_id = r.id),
    status = 'sending'
  where id = r.id returning * into r;
  update public.earning_cycles set status = 'releasing', approved_by = auth.uid(), approved_at = now()
  where id = c.id;
  perform public.write_audit('money', 'cycle.release', 'earning_cycle', c.id::text, to_char(c.month, 'Mon YYYY'),
    format('Released %s: %s authors, %s kobo', to_char(c.month, 'Mon YYYY'), r.authors, r.total_kobo), null,
    jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo));
  return jsonb_build_object('run_id', r.id, 'authors', r.authors, 'total_kobo', r.total_kobo, 'replayed', false);
end $$;

-- ─── Worker: payout-transfer (service key) ──────────────────────────────────
create function public.payout_queue_read(p_vt int default 120, p_qty int default 10)
returns setof pgmq.message_record
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('payout_queue_read');
  return query select * from pgmq.read('payout_transfer', p_vt, p_qty);
end $$;

create function public.payout_queue_ack(p_msg_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('payout_queue_ack');
  return pgmq.archive('payout_transfer', p_msg_id);
end $$;

-- What the Worker needs to send one transfer. `send` is false when it must not go yet (already
-- sent, settled, waiting for an account, or before not_before: then `retry_in_s`).
create function public.payout_for_transfer(p_payout uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payouts;
  b public.author_bank_accounts;
begin
  perform public._require_service('payout_for_transfer');
  select * into p from public.payouts where id = p_payout;
  if p.id is null then
    return jsonb_build_object('send', false, 'reason', 'not_found');
  end if;
  if p.status <> 'queued' or p.waiting_for_account or p.flutterwave_transfer_id is not null then
    return jsonb_build_object('send', false, 'reason', p.status);
  end if;
  if p.not_before > now() then
    return jsonb_build_object('send', false, 'reason', 'not_yet',
      'retry_in_s', ceil(extract(epoch from p.not_before - now()))::int);
  end if;
  select * into b from public.author_bank_accounts where id = p.bank_account_id;
  if b.status <> 'verified' then
    update public.payouts set waiting_for_account = true where id = p.id;
    return jsonb_build_object('send', false, 'reason', 'account_not_verified');
  end if;
  return jsonb_build_object('send', true, 'payout_id', p.id, 'author_id', p.author_id, 'reference', p.reference,
    'amount_kobo', p.amount_kobo, 'bank_code', b.bank_code,
    'account_number_enc', encode(b.account_number_enc, 'base64'), 'account_name', b.bank_account_name);
end $$;

-- The transfer was created at Flutterwave (or the API call failed before that).
create function public.payout_transfer_created(p_payout uuid, p_transfer_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('payout_transfer_created');
  update public.payouts set flutterwave_transfer_id = p_transfer_id, status = 'pending', sent_at = now()
  where id = p_payout and status = 'queued';
end $$;

-- API error before a transfer exists (rule 20): the same reference is tried again after 1 h, then
-- 6 h; after the third error the payout fails and waits for staff. Returns seconds to wait, or null.
create function public.payout_transfer_error(p_payout uuid, p_message text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  p public.payouts;
  v_delay int;
begin
  perform public._require_service('payout_transfer_error');
  update public.payouts set api_errors = api_errors + 1 where id = p_payout and status = 'queued'
  returning * into p;
  if p.id is null then
    return null;
  end if;
  v_delay := case p.api_errors when 1 then 3600 when 2 then 21600 end;
  if v_delay is null then
    perform public._settle_payout(p.id, 'failed', left(coalesce(p_message, 'Transfer could not be created'), 300));
    return null;
  end if;
  update public.payouts set not_before = now() + make_interval(secs => v_delay) where id = p.id;
  return v_delay;
end $$;

-- Apply a final or pending status to a payout and roll it up to the line, run and cycle.
create function public._settle_payout(p_payout uuid, p_status public.payout_status, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  p public.payouts;
  e public.author_earnings;
  v_run uuid;
  v_cycle uuid;
begin
  select * into p from public.payouts where id = p_payout for update;
  if p.id is null or not public._transfer_status_applies(p.status, p_status) then
    return false;
  end if;
  update public.payouts set status = p_status,
    failure_reason = case when p_status in ('failed', 'reversed') then p_reason end,
    settled_at = case when p_status in ('successful', 'failed', 'reversed') then now() end
  where id = p.id;
  select * into e from public.author_earnings where id = p.author_earning_id;
  if p_status = 'successful' then
    update public.author_earnings set status = 'paid' where id = e.id;
  elsif p_status in ('failed', 'reversed') then
    -- The amount goes back to the author's payable balance on this line (rule 17).
    update public.author_earnings set status = 'partly_failed', held_reason = p_reason where id = e.id;
  end if;
  if p_status in ('successful', 'failed', 'reversed') then
    perform pgmq.send('user_notify', jsonb_build_object(
      'kind', case p_status when 'successful' then 'payout_paid' else 'payout_failed' end,
      'user_id', p.author_id, 'amount_kobo', p.amount_kobo, 'reference', p.reference));
  end if;
  -- Run and cycle finish when nothing is queued or pending.
  v_run := p.run_id;
  if not exists (select 1 from public.payouts where run_id = v_run and status in ('queued', 'pending')) then
    update public.payout_runs set status = case
        when exists (select 1 from public.payouts where run_id = v_run and status in ('failed', 'reversed'))
        then 'done_with_failures' else 'done' end::public.payout_run_status
    where id = v_run returning cycle_id into v_cycle;
    update public.earning_cycles c set status = case
        when exists (select 1 from public.author_earnings x where x.cycle_id = c.id and x.status = 'partly_failed')
        then 'paid_with_failures' else 'paid' end::public.earning_cycle_status
    where c.id = v_cycle and c.status in ('releasing', 'paid', 'paid_with_failures')
      and not exists (select 1 from public.payouts q join public.payout_runs pr on pr.id = q.run_id
                      where pr.cycle_id = c.id and q.status in ('queued', 'pending'));
  end if;
  return true;
end $$;

-- flutterwave-transfer-webhook (after the Worker verified the hash and re-queried the transfer).
-- Idempotent by provider event id; ordered by status rank; transient failures retry once more with
-- a new attempt (1 h, then 6 h; at most 3 attempts).
create function public.payout_apply_event(p_event_id text, p_reference text, p_status public.payout_status,
                                          p_reason text default null, p_transient boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payouts;
  v_applied boolean;
  v_retry uuid;
  c public.earning_cycles;
begin
  perform public._require_service('payout_apply_event');
  if exists (select 1 from public.payout_events where event_id = p_event_id) then
    return jsonb_build_object('applied', false, 'replayed', true);
  end if;
  select * into p from public.payouts where reference = p_reference;
  if p.id is null then
    insert into public.payout_events (event_id, status, applied) values (p_event_id, p_status, false);
    return jsonb_build_object('applied', false, 'reason', 'unknown_reference');
  end if;
  v_applied := public._settle_payout(p.id, p_status, p_reason);
  insert into public.payout_events (event_id, payout_id, status, applied) values (p_event_id, p.id, p_status, v_applied);
  if v_applied and p_status = 'failed' and p_transient and p.attempt < 3
     and not exists (select 1 from public.payouts where author_earning_id = p.author_earning_id and attempt > p.attempt)
  then
    select ec.* into c from public.earning_cycles ec join public.author_earnings ae on ae.cycle_id = ec.id
    where ae.id = p.author_earning_id;
    insert into public.payouts (run_id, author_earning_id, author_id, bank_account_id, amount_kobo, attempt,
                                reference, retry_of, not_before)
    values (p.run_id, p.author_earning_id, p.author_id, p.bank_account_id, p.amount_kobo, p.attempt + 1,
            public._payout_reference(c.month, p.author_id, p.attempt + 1), p.id,
            now() + case p.attempt when 1 then interval '1 hour' else interval '6 hours' end)
    returning id into v_retry;
    update public.author_earnings set status = 'queued' where id = p.author_earning_id;
    update public.payout_runs set status = 'sending' where id = p.run_id;
    update public.earning_cycles set status = 'releasing' where id = c.id;
    perform pgmq.send('payout_transfer', jsonb_build_object('payout_id', v_retry),
                      extract(epoch from case p.attempt when 1 then interval '1 hour' else interval '6 hours' end)::int);
  end if;
  return jsonb_build_object('applied', v_applied, 'payout_id', p.id, 'retry_id', v_retry);
end $$;

-- poll_pending_payouts (Worker, hourly): transfers pending over 48 hours to re-query; once raised,
-- Finance sees them. Never retried until Flutterwave says failed (rule 19).
create function public.payouts_pending_over(p_hours int default 48) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform public._require_service('payouts_pending_over');
  update public.payouts set raised_at = coalesce(raised_at, now())
  where status = 'pending' and sent_at < now() - make_interval(hours => p_hours);
  select coalesce(jsonb_agg(jsonb_build_object('payout_id', id, 'reference', reference,
                                               'transfer_id', flutterwave_transfer_id) order by sent_at), '[]')
  into v from public.payouts where status = 'pending' and sent_at < now() - make_interval(hours => p_hours);
  return v;
end $$;

-- ─── retry_payout (rule 18; Finance or Super admin) ─────────────────────────
-- same_account_confirmed: staff confirm the author fixed it; sent now to the current account.
-- new_account_when_verified: waits; goes once a newer account is verified and its pause ended.
create function public.retry_payout(p_payout uuid, p_mode text, p_confirmed boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payouts;
  c public.earning_cycles;
  b public.author_bank_accounts;
  v_new uuid;
  v_wait boolean;
begin
  perform public._require_payout_staff();
  if p_mode not in ('same_account_confirmed', 'new_account_when_verified') then
    perform public._raise('bad_mode');
  end if;
  select * into p from public.payouts where id = p_payout;
  if p.id is null then
    perform public._raise('not_found');
  end if;
  perform pg_advisory_xact_lock(hashtext('payout:' || p.author_earning_id::text));
  if p.status not in ('failed', 'reversed') then
    perform public._raise('not_failed');
  end if;
  if exists (select 1 from public.payouts where author_earning_id = p.author_earning_id and attempt > p.attempt) then
    perform public._raise('already_retried');
  end if;
  if exists (select 1 from public.payouts where author_earning_id = p.author_earning_id and status = 'successful') then
    perform public._raise('already_paid');
  end if;
  select * into b from public.author_bank_accounts
  where author_id = p.author_id and status in ('verified', 'needs_review') order by created_at desc limit 1;
  if p_mode = 'same_account_confirmed' then
    if not p_confirmed then
      perform public._raise('confirm_required');
    end if;
    if b.id is null or b.status <> 'verified' then
      perform public._raise('no_verified_account');
    end if;
    v_wait := false;
  else
    -- Blind retries are blocked: the money waits for a newer, verified account.
    v_wait := b.id is null or b.status <> 'verified' or b.id = p.bank_account_id;
  end if;
  select ec.* into c from public.earning_cycles ec join public.author_earnings ae on ae.cycle_id = ec.id
  where ae.id = p.author_earning_id;
  insert into public.payouts (run_id, author_earning_id, author_id, bank_account_id, amount_kobo, attempt, reference,
                              retry_of, waiting_for_account, not_before)
  values (p.run_id, p.author_earning_id, p.author_id, case when v_wait then null else b.id end, p.amount_kobo,
          p.attempt + 1, public._payout_reference(c.month, p.author_id, p.attempt + 1), p.id, v_wait,
          greatest(now(), coalesce(b.payouts_resume_at, now())))
  returning id into v_new;
  update public.author_earnings set status = 'queued' where id = p.author_earning_id;
  update public.payout_runs set status = 'sending' where id = p.run_id;
  update public.earning_cycles set status = 'releasing' where id = c.id;
  if not v_wait then
    perform pgmq.send('payout_transfer', jsonb_build_object('payout_id', v_new));
  end if;
  perform public.write_audit('money', 'payout.retry', 'payout', p.id::text, p.reference,
    format('Retry %s (%s)', p.reference, p_mode), null, jsonb_build_object('new_payout', v_new, 'waiting', v_wait));
  return jsonb_build_object('payout_id', v_new, 'waiting_for_account', v_wait);
end $$;

-- Retries waiting for an account move to the author's newly verified account.
create function public._attach_waiting_payouts(p_account uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  b public.author_bank_accounts;
  v int;
  q record;
begin
  select * into b from public.author_bank_accounts where id = p_account and status = 'verified';
  if b.id is null then
    return 0;
  end if;
  update public.payouts set bank_account_id = b.id, waiting_for_account = false,
    not_before = greatest(now(), b.payouts_resume_at)
  where author_id = b.author_id and status = 'queued' and waiting_for_account;
  get diagnostics v = row_count;
  for q in select id, not_before from public.payouts
           where author_id = b.author_id and status = 'queued' and bank_account_id = b.id loop
    perform pgmq.send('payout_transfer', jsonb_build_object('payout_id', q.id),
                      greatest(0, ceil(extract(epoch from q.not_before - now())))::int);
  end loop;
  return v;
end $$;

-- ─── Bank accounts (rules 21–24) ────────────────────────────────────────────
-- Called by the bank Worker only (service key), after Flutterwave resolved the account name. The
-- Worker encrypts the number and computes the name score with core nameMatchScore().
create function public.submit_bank_account(p_author uuid, p_bank_code text, p_bank_name text, p_last4 text,
                                           p_number_enc bytea, p_resolved_name text, p_match_score numeric)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.author_profiles;
  v_id uuid;
  v_status public.bank_account_status;
begin
  perform public._require_service('submit_bank_account');
  select * into a from public.author_profiles where user_id = p_author;
  if a.user_id is null then
    perform public._raise('not_an_author');
  end if;
  if p_match_score is null or p_match_score < 0 or p_match_score > 100 then
    perform public._raise('bad_score');
  end if;
  v_status := case when p_match_score >= 90 then 'verified' else 'needs_review' end;
  update public.author_bank_accounts set status = 'replaced'
  where author_id = p_author and status in ('needs_review', 'verified');
  insert into public.author_bank_accounts (author_id, bank_code, bank_name, account_last4, account_number_enc,
    bank_account_name, legal_name, match_score, status, verified_at, payouts_resume_at)
  values (p_author, p_bank_code, p_bank_name, p_last4, p_number_enc, p_resolved_name, a.legal_name, p_match_score,
    v_status, case when v_status = 'verified' then now() end, now() + interval '48 hours')
  returning id into v_id;
  -- Queued transfers to the old account wait for this one (they never go to a replaced account).
  update public.payouts set waiting_for_account = true, bank_account_id = null
  where author_id = p_author and status = 'queued' and bank_account_id is distinct from v_id;
  if v_status = 'verified' then
    perform public._attach_waiting_payouts(v_id);
  end if;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'bank_account_changed', 'user_id', p_author,
    'email', true, 'bank_name', p_bank_name, 'last4', p_last4, 'resume_at', now() + interval '48 hours'));
  return jsonb_build_object('id', v_id, 'status', v_status, 'auto_verified', v_status = 'verified',
    'payouts_resume_at', now() + interval '48 hours');
end $$;

create function public.review_bank_account(p_account uuid, p_decision text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  b public.author_bank_accounts;
  v_attached int := 0;
begin
  perform public._require_payout_staff();
  if p_decision not in ('verify', 'ask_document', 'reject') then
    perform public._raise('bad_decision');
  end if;
  if p_decision <> 'verify' and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    perform public._raise('reason_required');
  end if;
  select * into b from public.author_bank_accounts where id = p_account for update;
  if b.id is null then
    perform public._raise('not_found');
  end if;
  if b.status <> 'needs_review' then
    perform public._raise('already_decided', jsonb_build_object('status', b.status));
  end if;
  if p_decision = 'verify' then
    update public.author_bank_accounts set status = 'verified', verified_by = auth.uid(), verified_at = now()
    where id = b.id;
    v_attached := public._attach_waiting_payouts(b.id);
  elsif p_decision = 'ask_document' then
    update public.author_bank_accounts set document_requested_at = now() where id = b.id;
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'bank_document_requested', 'user_id', b.author_id,
      'email', true, 'reason', p_reason));
  else
    update public.author_bank_accounts set status = 'rejected', rejected_reason = btrim(p_reason) where id = b.id;
    perform pgmq.send('user_notify', jsonb_build_object('kind', 'bank_account_rejected', 'user_id', b.author_id,
      'email', true, 'reason', btrim(p_reason)));
  end if;
  perform public.write_audit('money', 'bank_account.' || p_decision, 'author_bank_account', b.id::text,
    b.bank_name || ' ••••' || b.account_last4, format('Bank account %s', replace(p_decision, '_', ' ')), null,
    jsonb_build_object('author_id', b.author_id, 'match_score', b.match_score), p_reason);
  return jsonb_build_object('id', b.id, 'decision', p_decision, 'retries_queued', v_attached);
end $$;

-- ─── Pauses (rule 12) ───────────────────────────────────────────────────────
create function public.pause_author_payouts(p_author uuid, p_reason text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_payout_staff();
  if p_reason not in ('account_dispute', 'suspected_fraud', 'author_request', 'other') then
    perform public._raise('bad_reason');
  end if;
  if p_reason = 'other' and char_length(btrim(coalesce(p_note, ''))) < 3 then
    perform public._raise('reason_required');
  end if;
  if not exists (select 1 from public.author_profiles where user_id = p_author) then
    perform public._raise('not_found');
  end if;
  insert into public.payout_holds (author_id, reason, note, set_by) values (p_author, p_reason, p_note, auth.uid())
  on conflict (author_id) where lifted_at is null do nothing;
  update public.author_profiles set payouts_paused = true, payouts_paused_reason = p_reason where user_id = p_author;
  perform public.write_audit('money', 'payouts.pause', 'author', p_author::text, null, 'Paused payouts', null,
    jsonb_build_object('reason', p_reason), p_note);
end $$;

create function public.lift_pause(p_author uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_payout_staff();
  update public.payout_holds set lifted_by = auth.uid(), lifted_at = now()
  where author_id = p_author and lifted_at is null;
  if not found then
    perform public._raise('not_paused');
  end if;
  update public.author_profiles set payouts_paused = false, payouts_paused_reason = null where user_id = p_author;
  perform public.write_audit('money', 'payouts.lift_pause', 'author', p_author::text, null, 'Lifted payout pause',
    null, null, p_note);
end $$;

-- ─── Gift loops (from flow 09's credit anomalies) ──────────────────────────
create function public.exclude_gift_loop(p_ledger_ids bigint[], p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v int;
begin
  perform public._require_payout_staff();
  insert into public.earning_exclusions (ledger_id, reason, credits, kobo, actor_id)
  select l.id, 'gift_loop', -l.delta, l.author_earning_kobo, auth.uid()
  from public.credit_ledger l
  where l.id = any (p_ledger_ids) and l.author_id is not null and l.author_earning_kobo <> 0
  on conflict (ledger_id, reason) do nothing;
  get diagnostics v = row_count;
  perform public.write_audit('money', 'earnings.exclude_gift_loop', 'credit_ledger', null, null,
    format('Excluded %s ledger rows as a gift loop', v), null, to_jsonb(p_ledger_ids), p_note);
  return v;
end $$;

-- ─── Settings (rule 32: Super admin saves, Finance views; open month only) ──
create function public.save_earning_settings(p_hold_days int, p_min_payout_kobo bigint, p_payout_day int,
                                             p_gift_loop_detection boolean, p_note text default null)
returns public.earning_settings
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.earning_settings := public._earning_settings();
  v_new public.earning_settings;
begin
  perform public._require_payout_super(true);
  insert into public.earning_settings (hold_days, min_payout_kobo, payout_day, gift_loop_detection, changed_by, note)
  values (p_hold_days, p_min_payout_kobo, p_payout_day, p_gift_loop_detection, auth.uid(), p_note)
  returning * into v_new;
  perform public.write_audit('money', 'earnings.settings', 'earning_settings', v_new.id::text, null,
    'Changed earnings settings', to_jsonb(v_old) - 'id' - 'changed_by' - 'effective_from',
    to_jsonb(v_new) - 'id' - 'changed_by' - 'effective_from', p_note);
  return v_new;
end $$;

-- ─── Statements (Worker renders the PDF to R2) ─────────────────────────────
create function public.record_statement(p_author uuid, p_cycle uuid, p_kind public.statement_kind, p_file_key text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  perform public._require_service('record_statement');
  insert into public.author_statements (author_id, cycle_id, kind, file_key)
  values (p_author, p_cycle, p_kind, p_file_key)
  returning id into v;
  return v;
end $$;

-- ─── Row level security ─────────────────────────────────────────────────────
alter table public.earning_settings enable row level security;
alter table public.earning_cycles enable row level security;
alter table public.author_earnings enable row level security;
alter table public.earning_exclusions enable row level security;
alter table public.author_bank_accounts enable row level security;
alter table public.payout_holds enable row level security;
alter table public.payout_runs enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_events enable row level security;
alter table public.author_statements enable row level security;

-- Finance and Super admin read everything; Publisher and Support read earnings totals only.
create policy earning_settings_select on public.earning_settings for select to authenticated
  using ((select public.is_staff('finance')));
create policy earning_cycles_select on public.earning_cycles for select to authenticated
  using ((select public.is_staff_any(array['finance', 'publisher', 'support']::public.staff_role[])));
create policy author_earnings_select on public.author_earnings for select to authenticated
  using (author_id = (select auth.uid())
         or (select public.is_staff_any(array['finance', 'publisher', 'support']::public.staff_role[])));
create policy earning_exclusions_select on public.earning_exclusions for select to authenticated
  using ((select public.is_staff('finance')));
create policy author_bank_accounts_select on public.author_bank_accounts for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff('finance')));
create policy payout_holds_select on public.payout_holds for select to authenticated
  using ((select public.is_staff_any(array['finance', 'support']::public.staff_role[])));
create policy payout_runs_select on public.payout_runs for select to authenticated
  using ((select public.is_staff('finance')));
create policy payouts_select on public.payouts for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff('finance')));
create policy author_statements_select on public.author_statements for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_staff('finance')));

revoke all on public.earning_settings, public.earning_cycles, public.author_earnings, public.earning_exclusions,
  public.author_bank_accounts, public.payout_holds, public.payout_runs, public.payouts, public.payout_events,
  public.author_statements
  from anon, authenticated;
grant select on public.earning_settings, public.earning_cycles, public.author_earnings, public.earning_exclusions,
  public.payout_holds, public.payout_runs, public.payouts, public.author_statements
  to authenticated;
-- Masked columns only: the encrypted number is never returned to a client.
grant select (id, author_id, bank_code, bank_name, account_last4, bank_account_name, legal_name, match_score,
              status, verified_by, verified_at, rejected_reason, document_requested_at, payouts_resume_at,
              created_at)
  on public.author_bank_accounts to authenticated;
-- Money rows: the service role writes them only through the functions above.
revoke insert, update, delete, truncate on public.author_earnings, public.earning_exclusions, public.payouts,
  public.payout_events, public.payout_runs, public.earning_cycles
  from service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        '_earning_settings', '_exclusions_guard', '_payout_events_guard', '_cycle_start', '_cycle_end',
        '_payout_date', '_payout_reference', '_transfer_status_applies', '_require_payout_staff',
        '_require_payout_super', '_payable_account', '_line_status', '_cycle_ledger', '_close_cycle', 'close_cycle',
        'close_cycle_due', 'recheck_cycle', 'prepare_cycle', 'release_cycle', 'payout_queue_read',
        'payout_queue_ack', 'payout_for_transfer', 'payout_transfer_created', 'payout_transfer_error',
        '_settle_payout', 'payout_apply_event', 'payouts_pending_over', 'retry_payout',
        '_attach_waiting_payouts', 'submit_bank_account', 'review_bank_account', 'pause_author_payouts',
        'lift_pause', 'exclude_gift_loop', 'save_earning_settings', 'record_statement')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
end $$;

-- Staff (own JWT; each checks its own permission).
grant execute on function
  public.close_cycle(date),
  public.recheck_cycle(uuid),
  public.prepare_cycle(uuid, bigint),
  public.release_cycle(uuid),
  public.retry_payout(uuid, text, boolean),
  public.review_bank_account(uuid, text, text),
  public.pause_author_payouts(uuid, text, text),
  public.lift_pause(uuid, text),
  public.exclude_gift_loop(bigint[], text),
  public.save_earning_settings(integer, bigint, integer, boolean, text)
  to authenticated;
-- Workers (service key).
grant execute on function
  public.close_cycle(date),
  public.recheck_cycle(uuid),
  public.payout_queue_read(integer, integer),
  public.payout_queue_ack(bigint),
  public.payout_for_transfer(uuid),
  public.payout_transfer_created(uuid, text),
  public.payout_transfer_error(uuid, text),
  public.payout_apply_event(text, text, public.payout_status, text, boolean),
  public.payouts_pending_over(integer),
  public.submit_bank_account(uuid, text, text, text, bytea, text, numeric),
  public.record_statement(uuid, uuid, public.statement_kind, text)
  to service_role;

select cron.schedule('earning_close', '5 23 * * *', 'select public.close_cycle_due()');

-- ─── Admin reads (Finance and Super admin; one call per screen) ─────────────
create function public._author_name(p_author uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(a.pen_name, ''), p.full_name, 'Author')
  from public.profiles p left join public.author_profiles a on a.user_id = p.id
  where p.id = p_author
$$;

-- The latest attempt of a line, when it failed or was reversed and nothing newer went out.
create function public._open_failures(p_cycle uuid) returns setof public.payouts
language sql stable security definer set search_path = '' as $$
  select p.* from public.payouts p join public.author_earnings e on e.id = p.author_earning_id
  where (p_cycle is null or e.cycle_id = p_cycle) and p.status in ('failed', 'reversed')
    and not exists (select 1 from public.payouts n where n.author_earning_id = p.author_earning_id
                    and n.attempt > p.attempt)
$$;

-- s-royalties: the open month adding up, then one row per closed month.
create function public.admin_earning_cycles() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  st public.earning_settings := public._earning_settings();
  v_month date := date_trunc('month', now() at time zone 'Africa/Lagos')::date;
  v_open jsonb;
  v_rows jsonb;
begin
  perform public._require_payout_staff();
  select jsonb_build_object('month', v_month,
    'credits', coalesce(-sum(l.delta), 0), 'earnings_kobo', coalesce(sum(l.author_earning_kobo), 0),
    'authors', count(distinct l.author_id),
    'payout_date', public._payout_date(public._cycle_end(v_month), st.hold_days, st.payout_day))
  into v_open from public.credit_ledger l
  where l.author_id is not null and l.author_earning_kobo <> 0 and l.created_at >= public._cycle_start(v_month);

  select coalesce(jsonb_agg(r order by r.month desc), '[]') into v_rows from (
    select c.id, c.month, c.status, c.closed_at, c.payout_date, c.hold_days, c.legacy,
      c.closed_at + make_interval(days => coalesce(c.hold_days, 0)) as hold_ends_at,
      c.credits_books + c.credits_tips_messages as credits, c.earnings_kobo,
      count(e.id) as authors,
      count(e.id) filter (where e.status = 'carried') as carried,
      count(e.id) filter (where e.status in ('payable', 'queued', 'paid', 'partly_failed')) as payable_authors,
      coalesce(sum(e.payable_kobo) filter (where e.status in ('payable', 'queued', 'paid', 'partly_failed')), 0)
        as payable_kobo,
      count(e.id) filter (where e.status = 'held_unverified') as unverified,
      (select count(*) from public._open_failures(c.id)) as failed,
      (select max(p.settled_at) from public.payouts p join public.author_earnings x on x.id = p.author_earning_id
       where x.cycle_id = c.id and p.status = 'successful') as paid_at
    from public.earning_cycles c left join public.author_earnings e on e.cycle_id = c.id
    where c.month < v_month
    group by c.id
  ) r;
  return jsonb_build_object('open', v_open, 'cycles', v_rows, 'settings', to_jsonb(st));
end $$;

-- s-royalty-cycle and s-royalty-release.
create function public.admin_earning_cycle(p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  v_lines jsonb;
  v_excl jsonb;
begin
  perform public._require_payout_staff();
  select * into c from public.earning_cycles where id = p_cycle;
  if c.id is null then
    perform public._raise('not_found');
  end if;
  select coalesce(jsonb_agg(l order by l.payable_kobo desc, l.name), '[]') into v_lines from (
    select e.id, e.author_id, public._author_name(e.author_id) as name, e.book_credits, e.tip_message_credits,
      e.excluded_credits, e.amount_kobo, e.carry_in_kobo, e.adjustment_kobo, e.payable_kobo, e.status,
      e.held_reason, b.id as bank_account_id, b.status as bank_status,
      b.status = 'verified' and b.payouts_resume_at > now() as bank_paused
    from public.author_earnings e
    left join public.author_bank_accounts b on b.author_id = e.author_id and b.status in ('needs_review', 'verified')
    where e.cycle_id = c.id
  ) l;
  select coalesce(jsonb_object_agg(x.reason, jsonb_build_object('credits', x.credits, 'readers', x.readers)), '{}')
  into v_excl from (
    select x.reason, sum(x.credits) as credits, count(distinct l.user_id) as readers
    from public.earning_exclusions x join public.credit_ledger l on l.id = x.ledger_id
    where x.cycle_id = c.id group by x.reason
  ) x;
  return to_jsonb(c) || jsonb_build_object(
    'hold_ends_at', c.closed_at + make_interval(days => coalesce(c.hold_days, 0)),
    'prepared_name', case when c.prepared_by is not null then public._author_name(c.prepared_by) end,
    'approved_name', case when c.approved_by is not null then public._author_name(c.approved_by) end,
    'lines', v_lines, 'exclusions', v_excl,
    'previous_failed', (select count(*) from public._open_failures(null) f
                        join public.author_earnings e on e.id = f.author_earning_id
                        join public.earning_cycles pc on pc.id = e.cycle_id where pc.month < c.month),
    'previous_failed_month', (select max(pc.month) from public._open_failures(null) f
                              join public.author_earnings e on e.id = f.author_earning_id
                              join public.earning_cycles pc on pc.id = e.cycle_id where pc.month < c.month),
    'author_rate_kobo', (select coalesce(max(l.author_earning_kobo / nullif(-l.delta, 0)), 160)
                         from public.credit_ledger l
                         where l.author_id is not null and l.delta < 0
                           and l.created_at >= public._cycle_start(c.month)
                           and l.created_at < public._cycle_end(c.month)));
end $$;

-- s-payouts: transfers with author, bank, month; filter by status, search author or reference.
create function public.admin_payouts(p_status text default null, p_q text default null,
                                     p_limit int default 25, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rows jsonb;
  v_total int;
  v_counts jsonb;
  v_kpis jsonb;
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform public._require_payout_staff();
  with base as (
    select p.*, public._author_name(p.author_id) as name, c.month, b.bank_name, b.account_last4,
      not exists (select 1 from public.payouts n where n.author_earning_id = p.author_earning_id
                  and n.attempt > p.attempt) and p.status in ('failed', 'reversed') as can_retry
    from public.payouts p
    join public.author_earnings e on e.id = p.author_earning_id
    join public.earning_cycles c on c.id = e.cycle_id
    left join public.author_bank_accounts b on b.id = p.bank_account_id
  ), f as (
    select * from base
    where (p_status is null or status::text = p_status or (p_status = 'pending' and status = 'queued'))
      and (v_q is null or name ilike '%' || v_q || '%' or reference ilike '%' || v_q || '%'
           or coalesce(flutterwave_transfer_id, '') ilike '%' || v_q || '%')
  )
  select (select count(*) from f),
    (select coalesce(jsonb_agg(to_jsonb(x) - 'run_id' - 'retry_of' order by coalesce(x.settled_at, x.sent_at, x.queued_at) desc, x.reference), '[]')
     from (select * from f order by coalesce(settled_at, sent_at, queued_at) desc, reference
           limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) x),
    (select jsonb_build_object('all', count(*),
       'successful', count(*) filter (where status = 'successful'),
       'pending', count(*) filter (where status in ('queued', 'pending')),
       'failed', count(*) filter (where status = 'failed' and can_retry),
       'reversed', count(*) filter (where status = 'reversed' and can_retry)) from base)
  into v_total, v_rows, v_counts;
  with last_day as (
    select max(settled_at::date) as d from public.payouts where status = 'successful'
  )
  select jsonb_build_object(
    'paid_on', (select d from last_day),
    'paid_kobo', (select coalesce(sum(amount_kobo), 0) from public.payouts, last_day
                  where status = 'successful' and settled_at::date = last_day.d),
    'paid_count', (select count(*) from public.payouts, last_day
                   where status = 'successful' and settled_at::date = last_day.d),
    'failed_kobo', (select coalesce(sum(amount_kobo), 0) from public._open_failures(null)),
    'failed_count', (select count(*) from public._open_failures(null)),
    'pending_count', (select count(*) from public.payouts where status in ('queued', 'pending')),
    'pending_kobo', (select coalesce(sum(amount_kobo), 0) from public.payouts where status in ('queued', 'pending')),
    'releasing_kobo', (select coalesce(sum(e.payable_kobo), 0) from public.author_earnings e
                       join public.earning_cycles c on c.id = e.cycle_id
                       where c.status in ('closed', 'prepared', 'approved') and e.status = 'payable'))
  into v_kpis;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'counts', v_counts, 'kpis', v_kpis);
end $$;

-- s-payout-retry: the failed transfer, the account it went to, and any newer account.
create function public.admin_payout(p_payout uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.payouts;
  v jsonb;
begin
  perform public._require_payout_staff();
  select * into p from public.payouts where id = p_payout;
  if p.id is null then
    perform public._raise('not_found');
  end if;
  select to_jsonb(p) || jsonb_build_object(
    'name', public._author_name(p.author_id),
    'month', (select c.month from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
              where e.id = p.author_earning_id),
    'can_retry', p.status in ('failed', 'reversed')
      and not exists (select 1 from public.payouts n where n.author_earning_id = p.author_earning_id
                      and n.attempt > p.attempt),
    'legal_name', (select legal_name from public.author_profiles where user_id = p.author_id),
    'account', (select jsonb_build_object('id', b.id, 'bank_name', b.bank_name, 'last4', b.account_last4,
                                          'bank_account_name', b.bank_account_name, 'status', b.status)
                from public.author_bank_accounts b where b.id = p.bank_account_id),
    'current', (select jsonb_build_object('id', b.id, 'bank_name', b.bank_name, 'last4', b.account_last4,
                                          'status', b.status, 'created_at', b.created_at,
                                          'payouts_resume_at', b.payouts_resume_at)
                from public.author_bank_accounts b
                where b.author_id = p.author_id and b.status in ('needs_review', 'verified')))
  into v;
  return v;
end $$;

-- s-bank-accounts and s-bank-account: the queue (oldest first) and one account with its history.
create function public.admin_bank_accounts(p_status text default 'needs_review') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_payout_staff();
  return jsonb_build_object(
    'rows', (select coalesce(jsonb_agg(r order by case when p_status = 'needs_review' then r.created_at end,
                                              r.created_at desc), '[]') from (
      select b.id, b.author_id, public._author_name(b.author_id) as name, b.bank_name, b.account_last4,
        b.bank_account_name, b.legal_name, b.match_score, b.status, b.created_at, b.document_requested_at
      from public.author_bank_accounts b where b.status::text = coalesce(p_status, 'needs_review')
      limit 200) r),
    'counts', (select jsonb_build_object(
      'needs_review', count(*) filter (where status = 'needs_review'),
      'verified', count(*) filter (where status = 'verified'),
      'rejected', count(*) filter (where status = 'rejected')) from public.author_bank_accounts));
end $$;

create function public.admin_bank_account(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b public.author_bank_accounts;
begin
  perform public._require_payout_staff();
  select * into b from public.author_bank_accounts where id = p_account;
  if b.id is null then
    perform public._raise('not_found');
  end if;
  return (to_jsonb(b) - 'account_number_enc') || jsonb_build_object(
    'name', public._author_name(b.author_id),
    'pen_name', (select pen_name from public.author_profiles where user_id = b.author_id),
    'verified_name', case when b.verified_by is not null then public._author_name(b.verified_by) end,
    'queue', (select jsonb_agg(q.id order by q.created_at) from public.author_bank_accounts q
              where q.status = 'needs_review'),
    'held', (select coalesce(jsonb_agg(jsonb_build_object('month', c.month, 'kobo', e.payable_kobo,
                                                          'status', e.status) order by c.month), '[]')
             from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
             where e.author_id = b.author_id and e.carried_to is null
               and e.status in ('held_unverified', 'held_paused', 'held_dispute', 'partly_failed')),
    'history', (select coalesce(jsonb_agg(h order by h.created_at desc), '[]') from (
      select o.id, o.bank_name, o.account_last4, o.status, o.created_at, o.verified_at,
        case when o.verified_by is not null then public._author_name(o.verified_by) end as verified_name,
        o.rejected_reason
      from public.author_bank_accounts o where o.author_id = b.author_id and o.id <> b.id) h),
    'failures', (select coalesce(jsonb_agg(jsonb_build_object('month', c.month, 'settled_at', p.settled_at,
                   'reason', p.failure_reason, 'bank_name', o.bank_name, 'last4', o.account_last4)
                   order by p.settled_at desc), '[]')
                 from public.payouts p join public.author_earnings e on e.id = p.author_earning_id
                 join public.earning_cycles c on c.id = e.cycle_id
                 left join public.author_bank_accounts o on o.id = p.bank_account_id
                 where p.author_id = b.author_id and p.status in ('failed', 'reversed')));
end $$;

-- s-author-payout: one author's account, payout lines and transfers, statements and hold.
create function public.admin_author_payout(p_author uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff_any(array['finance', 'support']::public.staff_role[]) then
    raise exception 'Not allowed: author payouts' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    -- Support sees the payout state, never bank details (Admin side).
    'account', case when public.has_permission('release_payouts') then (
      select to_jsonb(b) - 'account_number_enc' from public.author_bank_accounts b
      where b.author_id = p_author and b.status in ('needs_review', 'verified')) end,
    'has_account', exists (select 1 from public.author_bank_accounts b
                           where b.author_id = p_author and b.status in ('needs_review', 'verified')),
    'lines', (select coalesce(jsonb_agg(l order by l.month desc), '[]') from (
      select e.id, c.month, c.payout_date, e.payable_kobo, e.amount_kobo, e.status,
        (select jsonb_build_object('reference', p.reference, 'status', p.status, 'settled_at', p.settled_at,
                                   'failure_reason', p.failure_reason)
         from public.payouts p where p.author_earning_id = e.id order by p.attempt desc limit 1) as payout
      from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
      where e.author_id = p_author limit 24) l),
    'statements', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'month', c.month,
                                                                'created_at', s.created_at)
                                             order by s.created_at desc), '[]')
                   from public.author_statements s left join public.earning_cycles c on c.id = s.cycle_id
                   where s.author_id = p_author),
    'hold', (select jsonb_build_object('reason', h.reason, 'note', h.note, 'set_at', h.set_at,
                                       'set_name', public._author_name(h.set_by))
             from public.payout_holds h where h.author_id = p_author and h.lifted_at is null),
    'settings', to_jsonb(public._earning_settings()));
end $$;

-- s-royalty-settings: current values, last month's "not paid" counts, change log.
create function public.admin_earning_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.earning_cycles;
begin
  perform public._require_payout_staff();
  select * into c from public.earning_cycles where status <> 'open' order by month desc limit 1;
  return jsonb_build_object(
    'current', to_jsonb(public._earning_settings()),
    'can_save', public.is_staff('super_admin'),
    'author_rate_kobo', coalesce((public._rules() ->> 'author_rate_kobo')::int, 160),
    'last_month', c.month,
    'exclusions', (select coalesce(jsonb_object_agg(x.reason, jsonb_build_object('credits', x.credits,
                                                                                 'readers', x.readers)), '{}')
                   from (select x.reason, sum(x.credits) as credits, count(distinct l.user_id) as readers
                         from public.earning_exclusions x join public.credit_ledger l on l.id = x.ledger_id
                         where x.cycle_id = c.id group by x.reason) x),
    'log', (select coalesce(jsonb_agg(jsonb_build_object('hold_days', s.hold_days,
              'min_payout_kobo', s.min_payout_kobo, 'payout_day', s.payout_day,
              'gift_loop_detection', s.gift_loop_detection, 'effective_from', s.effective_from,
              'changed_name', case when s.changed_by is not null then public._author_name(s.changed_by) end,
              'note', s.note) order by s.effective_from desc), '[]')
            from (select * from public.earning_settings order by effective_from desc limit 20) s));
end $$;

revoke all on function public._author_name(uuid), public._open_failures(uuid), public.admin_earning_cycles(),
  public.admin_earning_cycle(uuid), public.admin_payouts(text, text, integer, integer), public.admin_payout(uuid),
  public.admin_bank_accounts(text), public.admin_bank_account(uuid), public.admin_author_payout(uuid),
  public.admin_earning_settings()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_earning_cycles(), public.admin_earning_cycle(uuid),
  public.admin_payouts(text, text, integer, integer), public.admin_payout(uuid), public.admin_bank_accounts(text),
  public.admin_bank_account(uuid), public.admin_author_payout(uuid), public.admin_earning_settings()
  to authenticated;

-- s-studio-royalties: the month, status and payout day of each cycle the author has a line in.
-- earning_cycles itself stays staff-only (it holds platform totals and checks).
create function public.my_earning_cycles()
returns table (id uuid, month date, status public.earning_cycle_status, payout_date date)
language sql stable security definer set search_path = '' as $$
  select c.id, c.month, c.status, c.payout_date
  from public.earning_cycles c
  where exists (select 1 from public.author_earnings e where e.cycle_id = c.id and e.author_id = (select auth.uid()))
  order by c.month desc;
$$;

revoke all on function public.my_earning_cycles() from public, anon, authenticated, service_role;
grant execute on function public.my_earning_cycles() to authenticated;
