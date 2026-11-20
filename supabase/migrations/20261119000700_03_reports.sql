-- Flow 03 · Report a review or a book (rules 11 and 45). Rows go into flow 06's `reports` table, the
-- moderation model flow 14 builds its queue on. Runs after 20261119000600_06_community.sql.
--
-- The app's reasons map onto `report_reason`:
--   review "Spoilers, abuse or spam" (spoilers_abuse_or_spam) → other
--   book   wrong_content → other, copyright → copyright, abuse → harassment
-- Reporting the same item twice is a no-op (returns null), as before.

create function public._report(p_type public.report_content_type, p_target uuid, p_user uuid, p_book uuid,
                               p_reason public.report_reason, p_details text, p_snapshot jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_sev public.report_severity := public.report_severity_for(p_reason);
  v_id uuid;
begin
  if char_length(p_details) > 500 then
    perform public._raise('details_too_long');
  end if;
  insert into public.reports (reporter_id, content_type, content_id, reported_user_id, book_id, reason, details,
                              severity, due_at, snapshot)
  values (public._uid(), p_type, p_target, p_user, p_book, p_reason, nullif(btrim(p_details), ''), v_sev,
          now() + case when v_sev = 'high' then interval '24 hours' else interval '3 days' end, p_snapshot)
  on conflict (reporter_id, content_type, content_id) where reporter_id is not null do nothing
  returning id into v_id;
  return v_id;
end $$;

create function public.report_review(p_review uuid, p_reason text, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  r public.reviews;
begin
  if p_reason not in ('spoilers_abuse_or_spam') then
    perform public._raise('bad_reason');
  end if;
  select * into r from public.reviews where id = p_review and user_id <> auth.uid();
  if r.id is null then
    perform public._raise('not_found');
  end if;
  return public._report('review', r.id, r.user_id, r.book_id, 'other', coalesce(p_note, 'Spoilers, abuse or spam'),
                        jsonb_build_object('body', r.body, 'stars', r.stars, 'spoiler', r.spoiler,
                                           'sender_name', public.sender_name(r.user_id), 'created_at', r.created_at));
end $$;

create function public.report_book(p_book uuid, p_reason text, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  b public.books;
begin
  if p_reason not in ('wrong_content', 'copyright', 'abuse') then
    perform public._raise('bad_reason');
  end if;
  select * into b from public.books where id = p_book;
  if b.id is null then
    perform public._raise('not_found');
  end if;
  return public._report('book', b.id, b.author_id, b.id,
                        case p_reason when 'copyright' then 'copyright' when 'abuse' then 'harassment'
                                      else 'other' end::public.report_reason,
                        coalesce(p_note, case p_reason when 'wrong_content' then 'Wrong content' end),
                        jsonb_build_object('title', b.title, 'reason', p_reason));
end $$;

revoke all on function
  public._report(public.report_content_type, uuid, uuid, uuid, public.report_reason, text, jsonb),
  public.report_review(uuid, text, text),
  public.report_book(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.report_review(uuid, text, text),
  public.report_book(uuid, text, text)
  to authenticated;
