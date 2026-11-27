-- Flow 14 · spec check 14-13 (rules 23, 25): reviews meet the safety rules, as comments do since
-- 08-6 (the chat half runs through the moderate-text Worker since 06-10).
--   * Muted words on the review surface (scope everywhere or reviews), same matcher as comments:
--     Hide / Hide and report store the review hidden from others (`hidden_by_mod`) with an automatic
--     report for moderators; Blur and flag stores it behind the spoiler blur with an open report;
--     Warn has no form on reviews, so it only counts the hit.
--   * Links and phone numbers from accounts under 7 days are refused (`rejected_by_rules`).
--   * Editing a review never makes a hidden one visible again (that stays a moderator decision).
-- Wraps flow 03's post_review again; the sanction check (20261124000100) stays first.

create or replace function public.post_review(p_book uuid, p_stars integer, p_body text, p_spoiler boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_hits uuid[];
  v_hide boolean;
  v_blur boolean;
  v_reason public.report_reason;
  v_prior text;
  r public.reviews;
begin
  perform public._require_no_sanction(v_user);
  if v_body <> '' and public._is_new_account(v_user) and public._has_link_or_phone(v_body) then
    perform public._raise('rejected_by_rules', '{"rule": "links_new_account"}');
  end if;

  select array_agg(h.id), coalesce(bool_or(h.action in ('hide', 'hide_and_report')), false),
         coalesce(bool_or(h.action = 'blur'), false),
         (array_agg(case when h.category = any (enum_range(null::public.report_reason)::text[])
                         then h.category::public.report_reason end)
            filter (where h.action in ('hide', 'hide_and_report', 'blur')))[1]
    into v_hits, v_hide, v_blur, v_reason
  from public._automod_hits(v_body, 'review') h
  where v_body <> '';

  select x.status into v_prior from public.reviews x where x.book_id = p_book and x.user_id = v_user;
  perform public._post_review_base(p_book, p_stars, p_body, p_spoiler);
  select * into r from public.reviews x where x.book_id = p_book and x.user_id = v_user;

  -- A review a moderator hid stays hidden through edits.
  if v_prior = 'hidden_by_mod' or v_hide then
    update public.reviews set status = 'hidden_by_mod' where id = r.id returning * into r;
  elsif v_blur then
    update public.reviews set spoiler = true where id = r.id returning * into r;
  end if;

  if v_hits is not null then
    perform public.record_automod_hits(v_hits);
    if (v_hide or v_blur) and not exists (
        select 1 from public.reports x where x.content_type = 'review' and x.content_id = r.id
          and x.reporter_id is null and x.status <> 'resolved') then
      insert into public.reports (reporter_id, content_type, content_id, reported_user_id, book_id, reason, details,
                                  severity, status, due_at, snapshot)
      values (null, 'review', r.id, v_user, p_book, coalesce(v_reason, 'other'),
              case when v_hide then 'Hidden automatically by a safety rule' else 'Blurred automatically by a safety rule' end,
              'low', case when v_hide then 'auto_hidden' else 'open' end::public.report_status,
              now() + interval '3 days',
              jsonb_build_object('body', v_body, 'stars', p_stars, 'sender_name', public.sender_name(v_user),
                                 'book_id', p_book));
    end if;
  end if;
  return public._review_json(r);
end $$;
