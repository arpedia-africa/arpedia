-- Flow 03 · spec check 03-9 (discussion counts and club row), 03-13 (gift people from groups),
-- 03-14 (books.comments_count), 03-17 (revision price history), 03-18 (gift_book checks).

-- ─── 03-13 / 03-18: who the reader can gift ─────────────────────────────────
-- Rule 32: people who follow the reader and members of groups the reader is in. DMs are not groups
-- here, and a member banned from a group no longer counts. One row per person: "Follows you" wins,
-- otherwise the biggest shared group names the row.
create or replace function public._gift_people(p_user uuid) returns table (id uuid, why text)
language sql stable security definer set search_path = '' as $$
  select distinct on (x.id) x.id, x.why
  from (
    select f.follower_id as id, 'Follows you' as why, 0 as rank, 0 as size
    from public.follows f where f.followee_id = p_user
    union all
    select o.user_id, 'In ' || g.name, 1, g.member_count
    from public.group_members me
    join public.groups g on g.id = me.group_id and g.kind <> 'dm' and g.archived_at is null
    join public.group_members o on o.group_id = g.id and o.user_id <> p_user and o.banned_at is null
    where me.user_id = p_user and me.banned_at is null
  ) x
  join public.profiles p on p.id = x.id and p.deleted_at is null
  where x.id <> p_user
    and not exists (select 1 from public.blocks k where (k.blocker_id = p_user and k.blocked_id = x.id)
                                                   or (k.blocker_id = x.id and k.blocked_id = p_user))
  order by x.id, x.rank, x.size desc
$$;
revoke all on function public._gift_people(uuid) from public, anon, authenticated;

create or replace function public.get_gift_people(p_book uuid, p_query text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'avatar_url', p.avatar_url,
      'why', g.why,
      'has_it', exists (select 1 from public.entitlements e where e.user_id = p.id and e.book_id = p_book
                          and e.revoked_at is null))
      order by p.full_name), '[]')
  from public._gift_people(auth.uid()) g
  join public.profiles p on p.id = g.id
  where auth.uid() is not null
    and (p_query is null or p.full_name ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%')
$$;

-- The Gifts switch (flow 16) and the gift list are enforced here, not only in the app.
create or replace function public._check_gift(p_user uuid, p_recipient uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select enabled from public.feature_flags where key = 'gifts'), true) then
    perform public._raise('gifts_off');
  end if;
  if p_recipient is null or not exists (select 1 from public._gift_people(p_user) g where g.id = p_recipient) then
    perform public._raise('bad_recipient');
  end if;
end $$;
revoke all on function public._check_gift(uuid, uuid) from public, anon, authenticated;

create or replace function public.gift_book(p_book uuid, p_recipient uuid, p_message text, p_expected_price integer,
                                            p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_book public.books;
  v_price int;
  v_spend jsonb;
  v_gift uuid;
  v_prior public.credit_ledger;
begin
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_prior from public.credit_ledger where idempotency_key = 'u:' || v_user || ':' || p_key;
  if found then
    select id into v_gift from public.gifts where ledger_id = v_prior.id;
    return jsonb_build_object('ledger_id', v_prior.id, 'gift_id', v_gift,
      'spent', -(select sum(delta) from public.credit_ledger where txn_id = v_prior.txn_id),
      'balance', public._balance(v_user), 'status', 'sent');
  end if;

  v_book := public._buyable_book(p_book);
  if v_book.author_id = v_user then
    perform public._raise('own_book');
  end if;
  -- Gifts on, and the recipient is a follower or shares a group (not self, deleted or blocked).
  perform public._check_gift(v_user, p_recipient);
  if exists (select 1 from public.entitlements where user_id = p_recipient and book_id = p_book
                                                 and revoked_at is null) then
    perform public._raise('already_has_it');
  end if;
  if char_length(p_message) > 140 then
    perform public._raise('message_too_long');
  end if;

  select effective_price into v_price from public.book_effective where book_id = p_book;
  if p_expected_price is distinct from v_price then
    perform public._raise('price_changed', jsonb_build_object('price', v_price));
  end if;
  perform public._check_spend_rate(v_user);

  v_spend := public.spend_credits(v_user, v_price, 'gift_out', p_book, null, v_book.author_id, p_key,
    jsonb_build_object('price', v_price), p_recipient);
  insert into public.entitlements (user_id, book_id, scope, source, ledger_id)
  values (p_recipient, p_book, 'book', 'gift', (v_spend ->> 'ledger_id')::bigint);
  insert into public.gifts (sender_id, recipient_id, book_id, message, ledger_id)
  values (v_user, p_recipient, p_book, nullif(btrim(p_message), ''), (v_spend ->> 'ledger_id')::bigint)
  returning id into v_gift;
  perform pgmq.send('user_notify', jsonb_build_object('kind', 'gift_received', 'user_id', p_recipient,
    'from_user_id', v_user, 'book_id', p_book, 'gift_id', v_gift));

  return jsonb_build_object('ledger_id', (v_spend ->> 'ledger_id')::bigint, 'gift_id', v_gift,
    'spent', v_price, 'balance', (v_spend ->> 'balance')::int, 'status', 'sent');
end $$;

-- ─── 03-14: books.comments_count ────────────────────────────────────────────
-- The book page Comments stat counts visible passage comments (the book's discussion).
create or replace function public.passage_comments_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old int := case when tg_op <> 'INSERT' and old.status = 'visible' then 1 else 0 end;
  v_new int := case when tg_op <> 'DELETE' and new.status = 'visible' then 1 else 0 end;
begin
  if v_new <> v_old then
    update public.books set comments_count = greatest(comments_count + v_new - v_old, 0)
    where id = coalesce(new.book_id, old.book_id);
  end if;
  return null;
end $$;
revoke all on function public.passage_comments_count() from public, anon, authenticated;

create trigger passage_comments_count after insert or delete or update of status on public.passage_comments
  for each row execute function public.passage_comments_count();

update public.books b set comments_count = c.n
from (select book_id, count(*)::int as n from public.passage_comments where status = 'visible' group by book_id) c
where c.book_id = b.id and b.comments_count is distinct from c.n;

-- ─── 03-17: a published revision with a new price is logged ─────────────────
-- Support explains a reader's price from book_price_history (admin 2). Override and preview
-- changes already log; this adds the revision kind when the live revision changes.
create or replace function public.books_revision_price_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old int;
  v_new int;
  v_pages numeric;
begin
  select price_credits into v_old from public.book_revisions where id = old.current_revision_id;
  select price_credits, pages into v_new, v_pages from public.book_revisions where id = new.current_revision_id;
  -- The console shows "New revision: {reason}", so the reason is the length behind the price.
  if old.current_revision_id is not null and v_old is distinct from v_new then
    insert into public.book_price_history (book_id, revision_id, kind, old_credits, new_credits, reason)
    values (new.id, new.current_revision_id, 'revision', v_old, v_new,
            coalesce(round(v_pages)::text || ' pages', 'New length'));
  end if;
  return null;
end $$;
revoke all on function public.books_revision_price_history() from public, anon, authenticated;

create trigger books_revision_price_history after update of current_revision_id on public.books
  for each row when (old.current_revision_id is distinct from new.current_revision_id)
  execute function public.books_revision_price_history();

-- ─── 03-9: discussion lock screen counts ────────────────────────────────────
-- Rule 47: "Passage talk is open" = visible comments on the reader's current chapter, only up to
-- their position; plus the club reading the book (public, or one the reader is in).
create or replace function public.get_book_discussion(p_book uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', b.title,
    'percent', coalesce(p.percent, 0), 'max_percent', coalesce(p.max_percent, 0),
    'unlocked', coalesce(p.max_percent, 0) >= 95,
    'chapter_ord', coalesce(p.chapter_ord, 0),
    'chapters', (select count(*) from public.chapters c where c.revision_id = b.current_revision_id and c.kind = 'chapter'),
    'chapter_title', (select c.title from public.chapters c where c.revision_id = b.current_revision_id
                        and c.ord = coalesce(p.chapter_ord, 0)),
    'chapter_comments', (
      select count(*)::int
      from public.passage_comments pc
      join public.paragraph_anchors a on a.revision_id = b.current_revision_id and a.para_id = pc.para_id
      join public.chapters c on c.revision_id = b.current_revision_id and c.chapter_uid = a.chapter_uid
      where pc.book_id = b.id and pc.status = 'visible' and c.ord = coalesce(p.chapter_ord, 0)
        and public._passage_reached(auth.uid(), b.id, pc.para_id)
        and not exists (select 1 from public.blocks k where (k.blocker_id = auth.uid() and k.blocked_id = pc.user_id)
                                                       or (k.blocker_id = pc.user_id and k.blocked_id = auth.uid()))),
    'club', (
      select jsonb_build_object('id', g.id, 'name', g.name, 'members', g.member_count)
      from public.groups g
      where g.kind in ('club', 'readalong') and g.archived_at is null
        and (g.book_id = b.id or g.weekly_book_id = b.id)
        and (g.visibility = 'public'
             or exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()
                          and m.banned_at is null))
      order by coalesce(g.weekly_book_id = b.id, false) desc, g.member_count desc
      limit 1))
  from public.books b
  left join public.reading_progress p on p.book_id = b.id and p.user_id = auth.uid()
  where b.id = p_book and auth.uid() is not null
    -- Same visibility as get_book_about.
    and (b.status in ('live', 'scheduled')
         or (public._owns_book(auth.uid(), p_book) and b.access_removed_at is null))
$$;
