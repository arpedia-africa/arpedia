-- 11-5 and 13-13 (server half): Studio read hard-coded payout values. `studio_home` returned
-- `payout_account_status 'not_set'` and `min_payout_kobo 100000` as literals and no next payout;
-- `studio_earnings` hard-coded the minimum and `kobo_per_credit 160`. Both now read the flow 13
-- settings (hold, payout day, minimum), the author rate (flow 16 rules), the author's real bank
-- account state and their payout lines, so Studio and admin show the same dates and amounts.

-- One month's payout for an author: the cycle's payout date (or, before the month closes, the date
-- the current settings give it, as admin shows), and the line's status, amount and settled time.
create function public._studio_payout(p_author uuid, p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'payout_date', coalesce(c.payout_date,
                            public._payout_date(public._cycle_end(p_month), st.hold_days, st.payout_day)),
    'closed', c.id is not null and c.status <> 'open',
    'status', e.status,
    'payable_kobo', e.payable_kobo,
    'carried', e.carried_to is not null,
    'paid_at', p.settled_at)
  from (select 1) one
  cross join lateral public._earning_settings() st
  left join public.earning_cycles c on c.month = p_month
  left join public.author_earnings e on e.cycle_id = c.id and e.author_id = p_author
  left join lateral (
    select x.settled_at from public.payouts x
    where x.author_earning_id = e.id and x.status = 'successful'
    order by x.attempt desc limit 1
  ) p on true
$$;

-- s-studio-home payout row: not_set (no account), pending (in review), verified, failed (rejected).
create function public._studio_account_status(p_author uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case b.status when 'verified' then 'verified' when 'needs_review' then 'pending'
                         when 'rejected' then 'failed' else 'not_set' end
    from public.author_bank_accounts b where b.author_id = p_author
    order by b.created_at desc limit 1), 'not_set')
$$;

-- The next payout already worked out by a closed month: the earliest line waiting to be sent.
create function public._studio_next_payout(p_author uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('month', to_char(c.month, 'YYYY-MM'), 'payout_date', c.payout_date,
                            'kobo', e.payable_kobo, 'status', e.status)
  from public.author_earnings e join public.earning_cycles c on c.id = e.cycle_id
  where e.author_id = p_author and e.status in ('payable', 'queued') and e.payable_kobo > 0
  order by c.month limit 1
$$;

revoke all on function public._studio_payout(uuid, date), public._studio_account_status(uuid),
  public._studio_next_payout(uuid) from public, anon, authenticated, service_role;

create or replace function public.studio_home() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  a public.author_profiles;
  v_from timestamptz := public._month_start(null);
  v_month jsonb;
  v_books jsonb;
  v_counts jsonb;
  v_followers int := 0;
  v_minutes int := 0;
  v_banner boolean;
  st public.earning_settings := public._earning_settings();
begin
  select * into a from public.author_profiles where user_id = v_uid;
  if a.user_id is null then
    raise exception 'not_author' using errcode = 'P0001';
  end if;
  v_month := public._author_month(v_uid, null);
  select coalesce(jsonb_agg(jsonb_build_object(
           'book_id', b.id, 'title', b.title, 'credits', coalesce(e.credits, 0),
           'earned_kobo', coalesce(e.kobo, 0)) order by coalesce(e.kobo, 0) desc, b.title), '[]')
  into v_books
  from public.books b
  left join (
    select book_id, sum(credits)::int as credits, sum(earned_kobo)::bigint as kobo
    from public._author_earning_rows(v_uid, v_from, v_from + interval '1 month')
    where book_id is not null group by book_id
  ) e on e.book_id = b.id
  where b.author_id = v_uid and b.status = 'live';
  select jsonb_build_object(
    'live', count(*) filter (where b.status = 'live'),
    'all', count(*),
    'in_review', count(*) filter (where exists (
      select 1 from public.book_revisions r where r.book_id = b.id
        and r.status in ('processing', 'with_desk', 'needs_fixes', 'ready_for_review'))),
    'changes_requested', count(*) filter (where exists (
      select 1 from public.book_revisions r where r.book_id = b.id and r.status = 'sent_back'
        and r.revision_no = (select max(revision_no) from public.book_revisions x where x.book_id = b.id))),
    -- Never-published books whose latest revision is still a draft (not in review or sent back).
    'drafts', count(*) filter (where b.status = 'draft' and coalesce((
      select r.status from public.book_revisions r where r.book_id = b.id
      order by r.revision_no desc limit 1), 'draft') = 'draft'))
  into v_counts
  from public.books b where b.author_id = v_uid;
  -- Follows (flows 03/08) and reading minutes (flow 04) are read when those tables exist.
  if to_regclass('public.follows') is not null then
    execute 'select count(*)::int from public.follows where followee_id = $1' into v_followers using v_uid;
  end if;
  if to_regclass('public.reading_days') is not null then
    execute 'select coalesce(sum(d.minutes), 0)::int from public.reading_days d
             join public.books b on b.id = d.book_id
             where b.author_id = $1 and d.day >= $2::date and d.user_id <> $1'
      into v_minutes using v_uid, v_from;
  end if;
  v_banner := a.approved_at > now() - interval '14 days'
              and not exists (select 1 from public.books b where b.author_id = v_uid);
  return jsonb_build_object(
    'pen_name', a.pen_name, 'status', a.status, 'suspended_reason', a.suspended_reason,
    'approved_at', a.approved_at, 'show_approval_banner', v_banner,
    'month', v_month, 'books', v_books, 'book_counts', v_counts,
    'followers', v_followers, 'minutes_read', v_minutes,
    'club_group_id', a.club_group_id, 'payouts_paused', a.payouts_paused,
    'payout_account_status', public._studio_account_status(v_uid),
    'min_payout_kobo', st.min_payout_kobo,
    'hold_days', st.hold_days,
    'payout_day', st.payout_day,
    'next_payout', public._studio_next_payout(v_uid)
  );
end $$;

create or replace function public.studio_earnings(p_month date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_history jsonb;
  st public.earning_settings := public._earning_settings();
begin
  if not exists (select 1 from public.author_profiles where user_id = v_uid) then
    raise exception 'not_author' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(public._author_month(v_uid, m::date)
                            || jsonb_build_object('payout', public._studio_payout(v_uid, m::date))
                            order by m desc), '[]')
  into v_history
  from generate_series(
    date_trunc('month', (select approved_at from public.author_profiles where user_id = v_uid)
                        at time zone 'Africa/Lagos'),
    date_trunc('month', now() at time zone 'Africa/Lagos'),
    interval '1 month') m;
  return jsonb_build_object('month', public._author_month(v_uid, p_month), 'history', v_history,
                            'min_payout_kobo', st.min_payout_kobo,
                            'kobo_per_credit', coalesce((public._rules() ->> 'author_rate_kobo')::int, 160),
                            'hold_days', st.hold_days, 'payout_day', st.payout_day);
end $$;
