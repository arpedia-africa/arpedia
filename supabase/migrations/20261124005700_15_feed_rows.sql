-- Flow 15 · in-app feed rows (spec check 15-7, 15-8, 15-9, server half of 15-10).
-- 15-7: Account pushes (rule 12) write a feed row too; they show only under All.
-- 15-8: a campaign push writes its feed row when the reader opens it, not at send.
-- 15-9: the feed keeps 60 days and at most 200 items per reader (rule 13).
-- 15-10: the Messages setting is All, Mentions and replies only, or Off (rule 3).

-- ─── 15-7: account category ─────────────────────────────────────────────────
alter table public.notifications drop constraint notifications_category_check;
alter table public.notifications add constraint notifications_category_check
  check (category in ('books', 'authors', 'community', 'account'));

create or replace function public.log_pushes(p_rows jsonb) returns bigint[]
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_ids bigint[] := '{}';
  v_id bigint;
  v_status public.push_status;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_status := (r ->> 'status')::public.push_status;
    insert into public.push_log (user_id, type, category, campaign_id, variant, status, skip_reason, collapse_key,
                                 data, ticket_ids, sent_at)
    select (r ->> 'user_id')::uuid, t.key, t.category, (r ->> 'campaign_id')::uuid, r ->> 'variant', v_status,
           r ->> 'skip_reason', r ->> 'collapse_key', coalesce(r -> 'data', '{}'),
           coalesce(array(select jsonb_array_elements_text(r -> 'ticket_ids')), '{}'),
           case when v_status = 'sent' then now() end
    from public.push_types t where t.key = r ->> 'type'
    returning id into v_id;
    v_ids := v_ids || v_id;
    if v_status in ('queued', 'sent') and (r ->> 'author_id') is not null then
      insert into public.push_author_daily (user_id, author_id, day)
      values ((r ->> 'user_id')::uuid, (r ->> 'author_id')::uuid, (now() at time zone 'Africa/Lagos')::date)
      on conflict do nothing;
    end if;
    -- The dispatcher adds `feed` only when the reader should see the item (not muted, blocked,
    -- batched or a campaign they haven't opened), also when push is off on the phone (edge cases).
    if r ? 'feed' and v_status not in ('failed', 'skipped_cap')
       and r -> 'feed' ->> 'category' in ('books', 'authors', 'community', 'account') then
      perform public._create_notification((r ->> 'user_id')::uuid, r -> 'feed' ->> 'kind',
        r -> 'feed' ->> 'category', r -> 'feed' ->> 'title', coalesce(r -> 'feed' ->> 'body', ''),
        r -> 'feed' ->> 'target_type', r -> 'feed' ->> 'target_id',
        (r -> 'feed' ->> 'actor_id')::uuid, (r -> 'feed' ->> 'book_id')::uuid);
    end if;
  end loop;
  return v_ids;
end $$;

-- ─── 15-8: campaign feed row on open ────────────────────────────────────────
-- The first open of a campaign push writes the feed row (variant B uses its own title).
-- A service campaign (is_service) is an Account notice that offers being off doesn't stop;
-- marketing ones sit under Books and follow the offers switch.
create or replace function public.push_opened(p_push_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_log public.push_log;
  v_c public.campaigns;
begin
  update public.push_log set status = 'opened', opened_at = coalesce(opened_at, now()),
    delivered_at = coalesce(delivered_at, now())
  where id = p_push_id and user_id = v_uid and public.push_status_rank(status) < 3
  returning * into v_log;
  if not found or v_log.campaign_id is null then return; end if;
  select * into v_c from public.campaigns where id = v_log.campaign_id;
  if not found then return; end if;
  perform public._create_notification(v_uid, case when v_c.is_service then 'service_campaign' else 'campaign' end,
    case when v_c.is_service then 'account' else 'books' end,
    case when v_log.variant = 'b' and coalesce(v_c.ab_test ->> 'title_b', '') <> '' then v_c.ab_test ->> 'title_b'
         else v_c.title end,
    v_c.body, v_c.open_target ->> 'kind', coalesce(v_c.open_target ->> 'id', v_c.open_target ->> 'screen'));
end $$;

-- ─── 15-9: 60 days, 200 per reader ──────────────────────────────────────────
create or replace function public.purge_discovery() returns void
language sql security definer set search_path = '' as $$
  delete from public.notifications where created_at < now() - interval '60 days';
  delete from public.search_events where created_at < now() - interval '90 days';
  delete from public.recommendation_cache where computed_at < now() - interval '1 day';
$$;

-- Each new item drops the reader's items past the newest 200 (notifications_user_at_idx).
create function public._notifications_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications n
  where n.user_id = new.user_id
    and n.id in (select id from public.notifications where user_id = new.user_id
                 order by created_at desc, id desc offset 200);
  return null;
end $$;
create trigger notifications_cap after insert on public.notifications
  for each row execute function public._notifications_cap();
revoke all on function public._notifications_cap() from public, anon, authenticated;

-- ─── 15-10: messages level ──────────────────────────────────────────────────
-- push_prefs already reads messages_level when the column exists. `clubs` follows it
-- (Off = false), so club feed items and flow 10's single switch keep working.
alter table public.notification_preferences add column messages_level text not null default 'mentions'
  check (messages_level in ('all', 'mentions', 'off'));
update public.notification_preferences set messages_level = 'off' where not clubs;

create or replace function public.get_notification_preferences() returns public.notification_preferences
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  res public.notification_preferences;
begin
  select * into res from public.notification_preferences where user_id = uid;
  if not found then
    res := row(uid, true, true, true, true, false, false, '22:00'::time, '06:00'::time, 'Africa/Lagos', now(),
      'mentions');
  end if;
  return res;
end $$;

create or replace function public.set_notification_preferences(p_patch jsonb) returns public.notification_preferences
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public._me();
  cur public.notification_preferences := public.get_notification_preferences();
  k text;
  v_level text;
begin
  for k in select jsonb_object_keys(coalesce(p_patch, '{}')) loop
    if k not in ('clubs', 'authors', 'note_replies', 'reminders', 'offers', 'quiet_enabled',
                 'quiet_start', 'quiet_end', 'timezone', 'messages_level') then
      raise exception 'unknown preference %', k using errcode = '22023';
    end if;
    if k in ('clubs', 'authors', 'note_replies', 'reminders', 'offers', 'quiet_enabled')
       and jsonb_typeof(p_patch -> k) <> 'boolean' then
      raise exception 'preference % must be true or false', k using errcode = '22023';
    end if;
  end loop;
  if p_patch ? 'messages_level' and coalesce(p_patch ->> 'messages_level', '') not in ('all', 'mentions', 'off') then
    raise exception 'messages_level must be all, mentions or off' using errcode = '22023';
  end if;
  if p_patch ? 'timezone' and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_patch ->> 'timezone') then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  if p_patch ? 'offers' and (p_patch ->> 'offers')::boolean is distinct from cur.offers then
    insert into public.consent_log (user_id, kind, granted) values (uid, 'marketing', (p_patch ->> 'offers')::boolean);
  end if;

  -- The level wins; the old switch alone maps on to Mentions or Off.
  v_level := coalesce(p_patch ->> 'messages_level',
    case when p_patch ? 'clubs' then case when (p_patch ->> 'clubs')::boolean
      then case when cur.messages_level = 'off' then 'mentions' else cur.messages_level end else 'off' end end,
    cur.messages_level);

  insert into public.notification_preferences as np (user_id, clubs, authors, note_replies, reminders, offers,
    quiet_enabled, quiet_start, quiet_end, timezone, messages_level)
  values (uid,
    v_level <> 'off',
    coalesce((p_patch ->> 'authors')::boolean, cur.authors),
    coalesce((p_patch ->> 'note_replies')::boolean, cur.note_replies),
    coalesce((p_patch ->> 'reminders')::boolean, cur.reminders),
    coalesce((p_patch ->> 'offers')::boolean, cur.offers),
    coalesce((p_patch ->> 'quiet_enabled')::boolean, cur.quiet_enabled),
    coalesce((p_patch ->> 'quiet_start')::time, cur.quiet_start),
    coalesce((p_patch ->> 'quiet_end')::time, cur.quiet_end),
    coalesce(p_patch ->> 'timezone', cur.timezone),
    v_level)
  on conflict (user_id) do update set clubs = excluded.clubs, authors = excluded.authors,
    note_replies = excluded.note_replies, reminders = excluded.reminders, offers = excluded.offers,
    quiet_enabled = excluded.quiet_enabled, quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end,
    timezone = excluded.timezone, messages_level = excluded.messages_level
  returning * into cur;
  return cur;
end $$;
