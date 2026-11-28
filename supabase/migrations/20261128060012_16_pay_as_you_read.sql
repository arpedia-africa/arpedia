-- Flow 16 rule 31 (spec check 16-24): Pay as you read is a saved pricing rule, not a fixed switch.
-- `pay_as_you_read` lives in pricing_rule_versions.rules beside the other numbers, so it is saved,
-- confirmed with a 2-step code and applied at 00:00 WAT like them (rules 33 to 35). Versions saved
-- before this rule existed read as On (the launch behaviour).
-- When it is Off:
--   * unlock_chapter refuses `payg_off` for a reader who has not started paying by chapter for that
--     book; readers part-way through keep going at the price they started with (rule 35);
--   * get_book_page and get_reader_state say `pay_as_you_read` false (true again for a reader who
--     already started), so the app offers only Unlock all.
-- unlock_chapter, get_book_page and get_reader_state keep their bodies: each is renamed to a private
-- `_..._base` and a thin public wrapper adds the rule, so their logic is not copied here.

-- ─── The rule ───────────────────────────────────────────────────────────────
create or replace function public._rules(p_at timestamptz default now()) returns jsonb
language sql stable security definer set search_path = '' as $$
  select '{"pay_as_you_read": true}'::jsonb || rules from public.pricing_rule_versions
  where effective_at <= p_at and cancelled_at is null
  order by effective_at desc, created_at desc limit 1
$$;

create or replace function public._validate_rules(p jsonb) returns jsonb
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
     or jsonb_typeof(r -> 'auto_unlock_default') is distinct from 'boolean'
     or jsonb_typeof(r -> 'pay_as_you_read') is distinct from 'boolean' then
    perform public._raise('bad_rules');
  end if;
  return r;
end $$;

-- Pay as you read for this reader and book: the rule is On, or they already started paying by chapter.
create function public._pay_as_you_read(p_user uuid, p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((public._rules() ->> 'pay_as_you_read')::boolean, true)
    or exists (select 1 from public.paygo_accounts pa where pa.user_id = p_user and pa.book_id = p_book)
$$;

-- ─── unlock_chapter ─────────────────────────────────────────────────────────
alter function public.unlock_chapter(uuid, uuid, text, text) rename to _unlock_chapter_base;
revoke all on function public._unlock_chapter_base(uuid, uuid, text, text) from public, anon, authenticated;

create function public.unlock_chapter(p_book uuid, p_chapter_uid uuid, p_source text, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
begin
  -- A replay of an earlier charge and a book the reader already owns answer as before.
  if not public._pay_as_you_read(v_user, p_book)
     and not public._owns_book(v_user, p_book)
     and not exists (select 1 from public.credit_ledger l
                     where l.idempotency_key = 'u:' || v_user || ':' || coalesce(p_key, '')) then
    perform public._raise('payg_off');
  end if;
  return public._unlock_chapter_base(p_book, p_chapter_uid, p_source, p_key);
end $$;

-- ─── What the app reads ─────────────────────────────────────────────────────
alter function public.get_book_page(uuid) rename to _get_book_page_base;
revoke all on function public._get_book_page_base(uuid) from public, anon, authenticated;

create function public.get_book_page(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb := public._get_book_page_base(p_book);
begin
  return v || jsonb_build_object('pay_as_you_read', public._pay_as_you_read(public._uid(), p_book));
end $$;

alter function public.get_reader_state(uuid) rename to _get_reader_state_base;
revoke all on function public._get_reader_state_base(uuid) from public, anon, authenticated;

create function public.get_reader_state(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb := public._get_reader_state_base(p_book);
begin
  return v || jsonb_build_object('pay_as_you_read', public._pay_as_you_read(public._uid(), p_book));
end $$;

revoke all on function public._pay_as_you_read(uuid, uuid), public.unlock_chapter(uuid, uuid, text, text),
  public.get_book_page(uuid), public.get_reader_state(uuid) from public, anon, authenticated;
grant execute on function public.unlock_chapter(uuid, uuid, text, text), public.get_book_page(uuid),
  public.get_reader_state(uuid) to authenticated;
