-- Flow 02/05 spec-check fixes: 02-15 (Notify me fills coming_soon_notify, bumps notify_count and
-- tells the reader on release) and 05-3 (books the reader asked to hear about appear in Saved with
-- their date). The book page button itself is 03-4 (builder B).

-- One push type for the release notice. Account category: the reader asked for it.
insert into public.push_types (key, label, category, can_reader_disable, automatic, can_switch_off, quiet_action,
                               capped, collapse_key, ttl_seconds, title_template, body_template, enabled) values
  ('book_released', 'A book you asked about is out', 'account', false, true, true, 'hold', false, 'book', 86400,
   '{{book_title}} is out now', 'You asked us to tell you. Start with the free preview.', true)
on conflict (key) do nothing;

-- Notify me on (default) or off for a coming-soon book. Turning it on also saves the book, so it
-- shows in Library → Saved with its release date. Returns whether the reader is now waiting.
create function public.notify_me(p_book uuid, p_on boolean default true) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_entry uuid;
  v_n int;
begin
  if v_user is null then perform public._raise('signed_out'); end if;
  if not exists (select 1 from public.books where id = p_book and status = 'scheduled') then
    perform public._raise('not_available');
  end if;
  insert into public.coming_soon_entries (book_id) values (p_book) on conflict (book_id) do nothing;
  select id into v_entry from public.coming_soon_entries where book_id = p_book;
  if p_on then
    insert into public.coming_soon_notify (entry_id, user_id) values (v_entry, v_user) on conflict do nothing;
    get diagnostics v_n = row_count;
    update public.coming_soon_entries set notify_count = notify_count + v_n where id = v_entry and v_n > 0;
    insert into public.saved_books (user_id, book_id) values (v_user, p_book) on conflict do nothing;
    delete from public.library_hidden where user_id = v_user and book_id = p_book;
  else
    delete from public.coming_soon_notify where entry_id = v_entry and user_id = v_user;
    get diagnostics v_n = row_count;
    update public.coming_soon_entries set notify_count = greatest(notify_count - v_n, 0)
    where id = v_entry and v_n > 0;
  end if;
  return p_on;
end $$;

-- Whether the reader tapped Notify me on this book (the book page reads it).
create function public.notify_me_on(p_book uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coming_soon_notify n
                 join public.coming_soon_entries e on e.id = n.entry_id
                 where e.book_id = p_book and n.user_id = public._uid())
$$;

-- On release, one push (and feed item) to everyone waiting, whatever the publisher chose for
-- followers (a follower may also get author_new_book; both open the book). The wait is then over:
-- the rows go, so a later unpublish and re-release does not tell them twice.
create function public._books_live_notify_waiters() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_users uuid[];
begin
  with gone as (
    delete from public.coming_soon_notify n using public.coming_soon_entries e
    where e.id = n.entry_id and e.book_id = new.id
    returning n.user_id)
  select array_agg(user_id) into v_users from gone where user_id <> new.author_id;
  update public.coming_soon_entries set notify_count = 0 where book_id = new.id;
  if v_users is not null then
    perform public.enqueue_push('book_released', v_users, jsonb_build_object(
      'vars', jsonb_build_object('book_title', new.title),
      'target', jsonb_build_object('kind', 'book', 'id', new.id),
      'book_id', new.id));
  end if;
  return new;
end $$;
create trigger books_live_notify_waiters after update of status on public.books
  for each row when (new.status = 'live' and old.status = 'scheduled')
  execute function public._books_live_notify_waiters();

revoke all on function public.notify_me(uuid, boolean), public.notify_me_on(uuid),
  public._books_live_notify_waiters() from public, anon, authenticated, service_role;
grant execute on function public.notify_me(uuid, boolean), public.notify_me_on(uuid) to authenticated;
