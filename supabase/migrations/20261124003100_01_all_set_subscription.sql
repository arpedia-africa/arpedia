-- Spec check 01-6: s-all-set (rule 30) reads the reader's subscription row for the plan and the
-- renewal date, so a Play-side date or plan change shows correctly. Credits still come from the
-- latest plan_grant ledger row. Without a live subscription (webhook not in yet) the plan falls
-- back to that ledger row and `renews_at` stays null (the app then derives it as before). A
-- cancelled or paused plan still in its period reports `renewing: false` and no renewal date.
create or replace function public.get_all_set() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  g_credits int;
  g_plan text;
  g_at timestamptz;
  s_plan text;
  s_end timestamptz;
  s_renews boolean;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select l.delta, l.ref_id, l.created_at into g_credits, g_plan, g_at
    from public.credit_ledger l
    where l.user_id = uid and l.reason = 'plan_grant' and l.delta > 0
    order by l.created_at desc limit 1;
  -- A plan cancelled or paused inside its paid period is still the plan, but it does not renew.
  select s.plan_code, s.period_end, s.status in ('active', 'grace', 'billing_retry')
    into s_plan, s_end, s_renews
    from public.subscriptions s
    where s.user_id = uid
      and (s.status in ('active', 'grace', 'billing_retry')
           or (s.status in ('cancelled', 'paused') and s.period_end > now()))
    order by s.period_end desc limit 1;
  return jsonb_build_object(
    'credits', g_credits,
    'plan', coalesce(s_plan, g_plan),
    'granted_at', g_at,
    'renews_at', case when s_renews then s_end end,
    -- Null without a subscription row; false when it will not renew.
    'renewing', s_renews,
    'book', (
      select jsonb_build_object('id', b.id, 'title', b.title, 'price', r.price_credits)
      from public.books b
      left join public.book_revisions r on r.id = b.current_revision_id
      where b.status = 'live'
      order by (select count(*) from public.entitlements e
                where e.book_id = b.id and e.created_at > now() - interval '7 days') desc,
               (select count(*) from public.entitlements e where e.book_id = b.id) desc,
               b.title
      limit 1),
    'author', (
      select jsonb_build_object('id', p.id, 'name', p.full_name, 'genre', a.genre, 'books', a.books)
      from (
        select b.author_id, count(*) as books, min(b.genres[1]) as genre,
          sum((select count(*) from public.entitlements e where e.book_id = b.id)) as reads
        from public.books b where b.status = 'live'
        group by b.author_id
      ) a join public.profiles p on p.id = a.author_id
      where p.id <> uid and p.deleted_at is null
      order by a.reads desc, a.books desc, p.full_name
      limit 1)
  );
end $$;
