-- Fix 12 (spec check 12-9, 12-13).

-- 12-9 (rules 42, 43): good standing also means no upheld report and no upheld copyright claim
-- in the last 90 days, so such an author's updates never take the fast lane. Suspended authors
-- stay out as before. A report whose action was undone on appeal does not count.
create or replace function public.author_in_good_standing(p_author uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_author is not null
    and not exists (
      select 1 from public.author_profiles a where a.user_id = p_author and a.status = 'suspended')
    and not exists (
      select 1 from public.reports r
      where r.reported_user_id = p_author and r.status = 'resolved'
        and r.outcome in ('removed', 'actioned') and r.resolved_at > now() - interval '90 days'
        and not exists (
          select 1 from public.moderation_actions m where m.report_id = r.id and m.undone_at is not null))
    and not exists (
      select 1 from public.copyright_claims c join public.books b on b.id = c.book_id
      where b.author_id = p_author and c.status = 'upheld' and c.decided_at > now() - interval '90 days')
$$;

-- 12-13 (rule 52): republish clears the Remove access mark. Readers who were refunded keep their
-- refund and buy again; their entitlements are not handed back (that would give the book free).
create or replace function public.republish_book(p_book uuid, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'republish_book');
  v_book public.books;
begin
  select * into v_book from public.books where id = p_book for update;
  if not found or v_book.status <> 'unpublished' or v_book.current_revision_id is null then
    raise exception 'republish_book: book is not unpublished' using errcode = 'check_violation';
  end if;
  update public.book_revisions set status = 'live' where id = v_book.current_revision_id;
  update public.books set status = 'live', unpublish_reason = null, unpublished_at = null, access_removed_at = null
   where id = p_book;
  perform public._audit(v_actor, 'books', 'book.republish', 'book', p_book::text, v_book.title, 'Republished',
    jsonb_build_object('status', 'unpublished', 'access_removed', v_book.access_removed_at is not null),
    jsonb_build_object('status', 'live'));
  return jsonb_build_object('status', 'live');
end $$;
