-- 13-7 and 13-8: statements (rules 26–27). Nothing generated statement PDFs, `record_statement` had
-- no caller and there was no download. The api Worker now renders a PDF per author per released
-- cycle (cron `statements_after_release`, after the run is done) and a year-to-date one on request,
-- from the data these functions return; staff and the author download through the Worker, which
-- asks `statement_download_key` who may read which file.

-- Credits and kobo by book and tips for one author over [from, to): the ledger rows the close
-- counted (no self-reads, gift loops, takedowns or clawbacks).
create function public._statement_rows(p_author uuid, p_from timestamptz, p_to timestamptz)
returns table (book_id uuid, title text, is_tip boolean, credits bigint, kobo bigint)
language sql stable security definer set search_path = '' as $$
  select l.book_id, b.title, l.reason in ('tip', 'message'), -sum(l.delta), sum(l.author_earning_kobo)::bigint
  from public.credit_ledger l
  left join public.books b on b.id = l.book_id
  where l.author_id = p_author and l.author_earning_kobo <> 0
    and l.created_at >= p_from and l.created_at < p_to
    and not exists (select 1 from public.earning_exclusions x where x.ledger_id = l.id
                    and x.reason in ('self_read', 'gift_loop', 'takedown', 'refund_clawback'))
  group by l.book_id, b.title, l.reason in ('tip', 'message')
$$;

-- What one cycle statement shows (Worker, service key). Null when the author has no line.
create function public.statement_source(p_author uuid, p_cycle uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.earning_cycles;
  e public.author_earnings;
  a public.author_profiles;
begin
  perform public._require_service('statement_source');
  select * into c from public.earning_cycles where id = p_cycle;
  select * into e from public.author_earnings where cycle_id = p_cycle and author_id = p_author;
  if c.id is null or e.id is null then
    return null;
  end if;
  select * into a from public.author_profiles where user_id = p_author;
  return jsonb_build_object(
    'kind', 'cycle', 'author_id', p_author, 'cycle_id', c.id,
    'month', to_char(c.month, 'YYYY-MM'), 'payout_date', c.payout_date,
    'pen_name', a.pen_name, 'legal_name', a.legal_name,
    'rate_kobo', coalesce((public._rules(public._cycle_end(c.month) - interval '1 second')
                           ->> 'author_rate_kobo')::int, 160),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('title', coalesce(r.title, 'Book'),
                'credits', r.credits, 'kobo', r.kobo) order by r.kobo desc, r.title), '[]')
              from public._statement_rows(p_author, public._cycle_start(c.month), public._cycle_end(c.month)) r
              where not r.is_tip),
    'tips_credits', (select coalesce(sum(r.credits), 0) from public._statement_rows(p_author,
                       public._cycle_start(c.month), public._cycle_end(c.month)) r where r.is_tip),
    'tips_kobo', (select coalesce(sum(r.kobo), 0) from public._statement_rows(p_author,
                    public._cycle_start(c.month), public._cycle_end(c.month)) r where r.is_tip),
    'excluded_credits', e.excluded_credits,
    'amount_kobo', e.amount_kobo, 'carry_in_kobo', e.carry_in_kobo, 'adjustment_kobo', e.adjustment_kobo,
    'payable_kobo', e.payable_kobo, 'status', e.status, 'held_reason', e.held_reason,
    'carried', e.carried_to is not null,
    'payout', (select jsonb_build_object('reference', p.reference, 'status', p.status, 'settled_at', p.settled_at)
               from public.payouts p where p.author_earning_id = e.id order by p.attempt desc limit 1));
end $$;

-- The year so far for one author (rule 27): each closed month's line, and the totals.
create function public.statement_ytd_source(p_author uuid, p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_year int := coalesce(p_year, extract(year from now() at time zone 'Africa/Lagos')::int);
  a public.author_profiles;
begin
  perform public._require_service('statement_ytd_source');
  select * into a from public.author_profiles where user_id = p_author;
  if a.user_id is null then
    return null;
  end if;
  return jsonb_build_object(
    'kind', 'year_to_date', 'author_id', p_author, 'year', v_year,
    'pen_name', a.pen_name, 'legal_name', a.legal_name,
    'months', (select coalesce(jsonb_agg(jsonb_build_object(
                 'month', to_char(c.month, 'YYYY-MM'), 'payout_date', c.payout_date,
                 'amount_kobo', e.amount_kobo, 'payable_kobo', e.payable_kobo, 'status', e.status,
                 'paid_kobo', (select coalesce(sum(p.amount_kobo), 0) from public.payouts p
                               where p.author_earning_id = e.id and p.status = 'successful'))
                 order by c.month), '[]')
               from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
               where e.author_id = p_author and extract(year from c.month) = v_year));
end $$;

-- statements_after_release (cron): lines of cycles whose run is done and that have no statement.
create function public.statements_due(p_limit int default 20)
returns table (author_id uuid, cycle_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_service('statements_due');
  return query
    select e.author_id, e.cycle_id
    from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
    where c.status in ('paid', 'paid_with_failures') and not c.legacy
      and not exists (select 1 from public.author_statements s
                      where s.author_id = e.author_id and s.cycle_id = e.cycle_id and s.kind = 'cycle')
    order by c.month, e.author_id
    limit greatest(1, least(p_limit, 100));
end $$;

-- Who may download a statement: Finance and Support (and Super admin) always; the author their own
-- cycle statement once that line is paid (open question 8), and their own year-to-date ones.
create function public.statement_download_key(p_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.author_statements;
begin
  select * into s from public.author_statements where id = p_id;
  if s.id is null then
    perform public._raise('not_found');
  end if;
  if public.is_staff_any(array['finance', 'support']::public.staff_role[]) then
    return s.file_key;
  end if;
  if s.author_id = auth.uid() and (s.kind = 'year_to_date' or exists (
      select 1 from public.author_earnings e
      where e.cycle_id = s.cycle_id and e.author_id = s.author_id and e.status = 'paid')) then
    return s.file_key;
  end if;
  raise exception 'Not allowed: statement' using errcode = 'insufficient_privilege';
end $$;

-- Who may ask for a year-to-date statement of an author: the author, or Finance and Support.
create function public.can_request_statement(p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_author = auth.uid() and exists (select 1 from public.author_profiles where user_id = p_author)
      or public.is_staff_any(array['finance', 'support']::public.staff_role[])
$$;

-- A cycle statement is written once; a re-run of the cron after a crash returns the same row.
create or replace function public.record_statement(p_author uuid, p_cycle uuid, p_kind public.statement_kind,
                                                   p_file_key text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v uuid;
begin
  perform public._require_service('record_statement');
  if p_kind = 'cycle' then
    select id into v from public.author_statements
    where author_id = p_author and cycle_id = p_cycle and kind = 'cycle';
    if v is not null then
      return v;
    end if;
  end if;
  insert into public.author_statements (author_id, cycle_id, kind, file_key)
  values (p_author, p_cycle, p_kind, p_file_key)
  returning id into v;
  return v;
end $$;

-- The author's own statements (s-studio-royalties): cycle ones once paid, and year-to-date ones.
create function public.my_statements()
returns table (id uuid, kind public.statement_kind, month date, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.kind, c.month, s.created_at
  from public.author_statements s left join public.earning_cycles c on c.id = s.cycle_id
  where s.author_id = (select auth.uid())
    and (s.kind = 'year_to_date' or exists (select 1 from public.author_earnings e
         where e.cycle_id = s.cycle_id and e.author_id = s.author_id and e.status = 'paid'))
  order by s.created_at desc
  limit 50;
$$;

revoke all on function public._statement_rows(uuid, timestamptz, timestamptz),
  public.statement_source(uuid, uuid), public.statement_ytd_source(uuid, int), public.statements_due(int),
  public.statement_download_key(uuid), public.can_request_statement(uuid), public.my_statements()
  from public, anon, authenticated, service_role;
grant execute on function public.statement_source(uuid, uuid), public.statement_ytd_source(uuid, int),
  public.statements_due(int) to service_role;
grant execute on function public.statement_download_key(uuid), public.can_request_statement(uuid),
  public.my_statements() to authenticated;
