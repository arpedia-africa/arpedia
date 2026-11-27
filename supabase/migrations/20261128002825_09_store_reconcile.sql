-- Spec check 09-5 (flow 09 Server: store_reconcile, Done when 9): once a week the api Worker lists
-- the last 8 days of RevenueCat (Play) and Flutterwave (web) purchases and compares them with
-- `transactions`. Each run is a row in `store_reconcile_runs` (Finance reads it on Credits); every
-- purchase one side has and the other doesn't is an open `credit_alerts` row of kind
-- `store_unmatched`, raised once per provider and store transaction id. Nothing here moves money:
-- Finance decides (a missing purchase is usually a webhook that never arrived; RevenueCat can resend it).

alter table public.credit_alerts drop constraint credit_alerts_kind_check;
alter table public.credit_alerts add constraint credit_alerts_kind_check
  check (kind in ('chargeback', 'lapsed_topup', 'reconcile', 'gift_loop', 'transfers', 'duplicate_charge',
                  'clawback_short', 'store_unmatched'));

create table public.store_reconcile_runs (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('revenuecat', 'flutterwave')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  status text not null check (status in ('ok', 'failed', 'skipped')),
  provider_count int not null default 0 check (provider_count >= 0),
  ours_count int not null default 0 check (ours_count >= 0),
  matched int not null default 0 check (matched >= 0),
  unmatched int not null default 0 check (unmatched >= 0),
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  check (window_end > window_start)
);
create index store_reconcile_runs_idx on public.store_reconcile_runs (provider, created_at desc);

alter table public.store_reconcile_runs enable row level security;
create policy store_reconcile_runs_select on public.store_reconcile_runs for select to authenticated
  using ((select public.is_staff('finance')));
revoke all on public.store_reconcile_runs from public, anon, authenticated, service_role;
grant select on public.store_reconcile_runs to authenticated, service_role;

-- The Worker records one provider's run. p_items: [{side: 'provider_only' | 'ours_only', store_txn_id,
-- user_id?, amount_kobo?, at?, product?}]; at most 200 per run are kept as alerts.
create function public.record_store_reconcile(
  p_provider text, p_window_start timestamptz, p_window_end timestamptz, p_status text,
  p_provider_count int, p_ours_count int, p_matched int, p_items jsonb, p_error text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run bigint;
  v_new int := 0;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  i jsonb;
  v_user uuid;
begin
  if jsonb_typeof(v_items) <> 'array' then raise exception 'bad_items'; end if;
  insert into public.store_reconcile_runs (provider, window_start, window_end, status, provider_count, ours_count,
                                           matched, unmatched, error)
  values (p_provider, p_window_start, p_window_end, p_status, greatest(coalesce(p_provider_count, 0), 0),
          greatest(coalesce(p_ours_count, 0), 0), greatest(coalesce(p_matched, 0), 0),
          case when p_status = 'ok' then jsonb_array_length(v_items) else 0 end, left(p_error, 500))
  returning id into v_run;

  if p_status = 'ok' then
    for i in select value from jsonb_array_elements(v_items) with ordinality t(value, n) where n <= 200 loop
      if i->>'side' not in ('provider_only', 'ours_only') or coalesce(i->>'store_txn_id', '') = '' then
        raise exception 'bad_item';
      end if;
      -- Raised once: a purchase still unmatched next week keeps its first, open alert.
      continue when exists (
        select 1 from public.credit_alerts a
        where a.kind = 'store_unmatched' and a.detail->>'provider' = p_provider
          and a.detail->>'store_txn_id' = i->>'store_txn_id');
      v_user := case when i->>'user_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     then (i->>'user_id')::uuid end;
      if v_user is not null and not exists (select 1 from public.profiles p where p.id = v_user) then
        v_user := null;
      end if;
      insert into public.credit_alerts (user_id, kind, detail)
      values (v_user, 'store_unmatched', jsonb_build_object(
        'provider', p_provider, 'side', i->>'side', 'store_txn_id', i->>'store_txn_id',
        'amount_kobo', i->'amount_kobo', 'at', i->>'at', 'product', i->>'product', 'run_id', v_run,
        'summary', case i->>'side'
          when 'provider_only' then
            case p_provider when 'revenuecat' then 'Google Play' else 'Flutterwave' end
            || ' has a payment we never recorded'
          else 'We recorded a payment ' || case p_provider when 'revenuecat' then 'Google Play' else 'Flutterwave' end
            || ' does not list' end));
      v_new := v_new + 1;
    end loop;
  end if;
  return jsonb_build_object('run_id', v_run, 'new_alerts', v_new);
end $$;

revoke all on function public.record_store_reconcile(text, timestamptz, timestamptz, text, int, int, int, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_store_reconcile(text, timestamptz, timestamptz, text, int, int, int, jsonb, text)
  to service_role;
