-- Flow 11 · spec check 11-3 (rule 31, server half). Studio's Post an update had nothing to call:
-- flow 08 only reads posts. publish_author_post lets an approved, active author publish a text
-- post (title up to 120, body up to 5,000) with an optional link to one of their live books.
--   * Followers get the author_new_post push from the existing author_posts trigger (flow 15).
--   * The author's community (groups.kind 'author') gets a system line "<pen name> posted:
--     <title>", read from Postgres like the rest of its history (chat_pushes skips system lines,
--     so followers are not told twice).
--   * Flow 08 and flow 14 rules: a sanction (mute, suspend, ban) or suspended author rights refuse
--     the post; a Hide or Hide-and-report muted word refuses it with rejected_by_rules (nothing
--     goes out); the same title and body again within 10 minutes returns the first post (a retry
--     after a dropped connection), and more than 10 posts in a day is refused.
alter table public.author_posts add column book_id uuid references public.books (id) on delete set null;

create function public.publish_author_post(p_title text, p_body text, p_book uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_state text := public._author_state(v_user);
  s record;
  v_hits uuid[];
  v_refuse boolean;
  v_post public.author_posts;
  v_group uuid;
begin
  if v_state = 'suspended' then
    perform public._raise('author_suspended');
  elsif v_state <> 'active' then
    perform public._raise('not_author');
  end if;
  select * into s from public.active_sanction(v_user);
  if s.kind is not null then
    perform public._raise(case s.kind when 'mute' then 'sanction_muted' when 'suspend' then 'suspended'
                                      else 'account_banned' end, jsonb_build_object('until', s.ends_at));
  end if;
  if char_length(v_title) not between 1 and 120 then
    perform public._raise('invalid_title');
  end if;
  if char_length(v_body) not between 2 and 5000 then
    perform public._raise('invalid_body');
  end if;
  if p_book is not null and not exists (select 1 from public.books b
                                         where b.id = p_book and b.author_id = v_user and b.status = 'live') then
    perform public._raise('book_not_found');
  end if;

  -- A retry of the same post returns it instead of posting twice.
  select * into v_post from public.author_posts a
  where a.author_id = v_user and a.state = 'published' and a.title = v_title and a.body = v_body
    and a.published_at > now() - interval '10 minutes'
  order by a.published_at desc limit 1;
  if v_post.id is not null then
    return jsonb_build_object('post_id', v_post.id, 'published_at', v_post.published_at, 'repeat', true);
  end if;
  if (select count(*) from public.author_posts a
      where a.author_id = v_user and a.published_at > now() - interval '1 day') >= 10 then
    perform public._raise('rate_limited', '{"limit": 10, "per": "day"}');
  end if;

  select array_agg(h.id), coalesce(bool_or(h.action in ('hide', 'hide_and_report')), false)
    into v_hits, v_refuse
  from public._automod_hits(v_title || ' ' || v_body, 'comment') h;
  if v_refuse then
    -- Raising rolls back, so nothing is stored or sent.
    perform public._raise('rejected_by_rules', '{"rule": "muted_word"}');
  end if;
  if v_hits is not null then
    perform public.record_automod_hits(v_hits);
  end if;

  insert into public.author_posts (author_id, title, body, state, published_at, book_id)
  values (v_user, v_title, v_body, 'published', now(), p_book)
  returning * into v_post;

  select g.id into v_group from public.groups g
  where g.kind = 'author' and g.owner_id = v_user and g.archived_at is null
  order by g.created_at limit 1;
  if v_group is not null then
    insert into public.messages (group_id, sender_id, client_id, kind, body)
    values (v_group, v_user, v_post.id, 'system',
            left(public._author_pen_name(v_user) || ' posted: ' || v_title, 2000));
  end if;

  return jsonb_build_object('post_id', v_post.id, 'published_at', v_post.published_at, 'repeat', false);
end $$;

revoke all on function public.publish_author_post(text, text, uuid) from public, anon;
grant execute on function public.publish_author_post(text, text, uuid) to authenticated;

-- s-post shows the linked book (title and cover route) while it is live.
create or replace function public.get_post(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := public._uid();
  a public.author_posts;
begin
  select * into a from public.author_posts where id = p_post;
  if a.id is null or (a.state <> 'published' and a.author_id <> v_user)
     or public.has_blocked(v_user, a.author_id) then
    perform public._raise('not_found');
  end if;
  return jsonb_build_object(
    'id', a.id, 'author_id', a.author_id, 'author_name', public._author_pen_name(a.author_id),
    'author_avatar', (select p.avatar_url from public.profiles p where p.id = a.author_id),
    'title', a.title, 'body', a.body, 'state', a.state, 'published_at', a.published_at,
    'like_count', a.like_count, 'comment_count', a.comment_count,
    'liked', exists (select 1 from public.post_likes l where l.post_id = a.id and l.user_id = v_user),
    'is_author', a.author_id = v_user,
    'can_comment', a.state = 'published' and not public.has_blocked(a.author_id, v_user),
    'book', (select jsonb_build_object('id', b.id, 'title', b.title) from public.books b
             where b.id = a.book_id and b.status = 'live'));
end $$;
