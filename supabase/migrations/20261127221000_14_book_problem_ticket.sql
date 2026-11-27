-- 14-17: "Report a problem with this book" (reader menu: missing pages, wrong chapter, broken text)
-- is not a conduct report (flow 14 rule 2). It now opens a support ticket in category Book access
-- with the book, revision, chapter and place attached, through create_support_ticket (its daily
-- limit applies), instead of a `book_content` report in the moderation queue. Same signature, so
-- the reader keeps calling it; it returns the ticket id.
create or replace function public.report_book_problem(p_book uuid, p_revision uuid, p_chapter_uid uuid, p_cfi text,
  p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_title text;
  v_ref text;
begin
  perform public._readable_revision(v_user, p_book);
  if char_length(p_note) > 500 then
    perform public._raise('bad_note');
  end if;
  select title into v_title from public.books where id = p_book;
  v_ref := public.create_support_ticket(
    'book_access',
    left('Problem in ' || coalesce(v_title, 'a book'), 200),
    coalesce(nullif(btrim(p_note), ''), 'Something is wrong in this book. The reader added no details.'),
    p_book,
    jsonb_build_object('source', 'reader_menu', 'revision_id', p_revision, 'chapter_uid', p_chapter_uid,
                       'cfi', left(p_cfi, 2000)));
  return (select id from public.support_tickets where ref = v_ref);
end $$;
