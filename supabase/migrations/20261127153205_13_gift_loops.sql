-- Flow 13 · spec check 13-5 (rule 4: credits in a frozen gift loop are not paid; rule 32: gift-loop
-- detection setting). Nothing created gift-loop alerts and `exclude_gift_loop` had no caller.
--
-- Detection (default, no rule in the spec): two accounts that each gifted the other's books in the
-- last 30 days. It only raises a `credit_alerts` row; Finance decides. Freeze gifting on that row
-- (s-credits) keeps the loop's gift credits out of author earnings through `exclude_gift_loop`.

-- Nightly, when `earning_settings.gift_loop_detection` is on.
create function public.job_gift_loop_detect() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n int := 0;
  r record;
  v_pair text;
  v_detail jsonb;
begin
  if not coalesce((select s.gift_loop_detection from public.earning_settings s
                   where s.effective_from <= now() order by s.effective_from desc, s.id desc limit 1), true) then
    return 0;
  end if;
  for r in
    with g as (
      select l.id, l.user_id as sender, l.author_id as author, -l.delta as credits
      from public.credit_ledger l
      where l.reason = 'gift_out' and l.author_id is not null and l.author_earning_kobo <> 0
        and l.created_at > now() - interval '30 days'
        and not exists (select 1 from public.earning_exclusions x where x.ledger_id = l.id and x.reason = 'gift_loop')
    ), pairs as (
      select distinct least(a.sender, a.author) as x, greatest(a.sender, a.author) as y
      from g a
      where a.sender <> a.author
        and exists (select 1 from g b where b.sender = a.author and b.author = a.sender)
    )
    select p.x, p.y, array_agg(g.id order by g.id) as ids, sum(g.credits)::int as credits,
           count(distinct g.id)::int as gifts
    from pairs p
    join g on (g.sender = p.x and g.author = p.y) or (g.sender = p.y and g.author = p.x)
    group by p.x, p.y
  loop
    v_pair := r.x::text || ':' || r.y::text;
    v_detail := jsonb_build_object('pair', v_pair, 'peer_id', r.y, 'ledger_ids', to_jsonb(r.ids),
      'credits', r.credits,
      'summary', format('%s gifts back and forth with %s · %s credits', r.gifts, public.sender_name(r.y),
                        to_char(r.credits, 'FM999,999,990')));
    update public.credit_alerts set detail = v_detail
    where kind = 'gift_loop' and resolved_at is null and detail ->> 'pair' = v_pair;
    if not found then
      insert into public.credit_alerts (user_id, kind, detail) values (r.x, 'gift_loop', v_detail);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- Freeze gifting on a gift-loop row: keep its credits out of earnings and close the alert.
create function public.exclude_gift_loop_alert(p_alert bigint, p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  a public.credit_alerts;
  v int;
begin
  perform public._require_payout_staff();
  select * into a from public.credit_alerts where id = p_alert and kind = 'gift_loop' for update;
  if a.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if a.resolved_at is not null then
    return 0;
  end if;
  v := public.exclude_gift_loop(
    array(select jsonb_array_elements_text(coalesce(a.detail -> 'ledger_ids', '[]'))::bigint), p_note);
  update public.credit_alerts set resolved_at = now(), resolved_by = auth.uid() where id = a.id;
  return v;
end $$;

revoke all on function public.job_gift_loop_detect() from public, anon, authenticated;
revoke all on function public.exclude_gift_loop_alert(bigint, text) from public, anon;
grant execute on function public.job_gift_loop_detect() to service_role;
grant execute on function public.exclude_gift_loop_alert(bigint, text) to authenticated;

select cron.schedule('gift_loop_detect', '40 1 * * *', 'select public.job_gift_loop_detect()');
