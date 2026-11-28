-- Spec check 11-14 (flow 11 Analytics: author_post_created), server half. Studio's Post an update
-- now publishes through publish_author_post (11-3), so the event starts on the server and reaches
-- PostHog through the analytics outbox (20261127223500_15_server_analytics.sql), the same way as the
-- other server events. It fires once, when a post first goes live (published_at newly set), like the
-- author_new_post push: a post restored after moderation is not counted again.
--   author_post_created {has_book}   distinct_id is the author; no title or body is sent.
-- The app does not send this event as well (it would count every post twice).
-- A failing event never blocks the post.

create function public._author_post_created_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state <> 'published' or new.published_at is null
     or (tg_op = 'UPDATE' and old.published_at is not null) then
    return null;
  end if;
  perform public._track('author_post_created', new.author_id::text,
    jsonb_build_object('has_book', new.book_id is not null));
  return null;
exception when others then
  return null;
end $$;
create trigger author_posts_created_analytics after insert or update of state, published_at on public.author_posts
  for each row execute function public._author_post_created_event();

revoke execute on function public._author_post_created_event() from public, anon, authenticated;
