-- Flow 17 rule 12 · access sweep over every table, view, sequence and function in public.
-- Each check lists what anon or a signed-in reader can reach; anything outside the reviewed lists
-- below fails with its name. A new table or function that opens something must be added here on
-- purpose, after review. Runs on the seeded database, so "can read" means real rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email) values ('17000000-0000-4000-a000-000000000099', 'sweep@test.local');

-- ─── Catalogue ──────────────────────────────────────────────────────────────
select is(
  array(select c.relname::text from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
        order by 1),
  '{}'::text[], 'RLS is on for every table');

select is(
  array(select p.tablename || '.' || p.policyname from pg_policies p
        where p.schemaname = 'public' and p.cmd <> 'SELECT' and p.roles && array['anon', 'public']::name[]
        order by 1),
  '{}'::text[], 'no policy lets anon write');

select is(
  array(select p.tablename || ':' || p.cmd from pg_policies p
        where p.schemaname = 'public' and p.cmd <> 'SELECT' order by 1),
  array['author_profiles:UPDATE', 'group_members:UPDATE', 'hidden_reviewers:ALL', 'notifications:UPDATE',
        'profiles:UPDATE', 'review_likes:ALL', 'reviews:DELETE', 'reviews:INSERT', 'reviews:UPDATE'],
  'client write policies are exactly the reviewed ones');

-- Column grants keep money, entitlement and moderation fields out of reach of those policies.
select is(
  array(select cp.table_name || '.' || cp.column_name || ':' || cp.privilege_type
        from information_schema.column_privileges cp
        where cp.table_schema = 'public' and cp.grantee = 'authenticated'
          and cp.privilege_type in ('INSERT', 'UPDATE') order by 1),
  array['author_profiles.bio:UPDATE', 'author_profiles.location:UPDATE', 'author_profiles.pen_name:UPDATE',
        'author_profiles.photo_url:UPDATE', 'author_profiles.visibility:UPDATE',
        'group_members.last_read_at:UPDATE', 'group_members.last_seen_at:UPDATE',
        'group_members.notify_muted_until:UPDATE',
        'hidden_reviewers.created_at:INSERT', 'hidden_reviewers.hidden_user_id:INSERT', 'hidden_reviewers.user_id:INSERT',
        'notifications.read_at:UPDATE',
        'profiles.avatar_url:UPDATE', 'profiles.bio:UPDATE', 'profiles.full_name:UPDATE', 'profiles.interests:UPDATE',
        'profiles.reader_theme:UPDATE', 'profiles.theme:UPDATE',
        'review_likes.created_at:INSERT', 'review_likes.review_id:INSERT', 'review_likes.user_id:INSERT',
        'reviews.body:INSERT', 'reviews.body:UPDATE', 'reviews.book_id:INSERT', 'reviews.edited_at:UPDATE',
        'reviews.spoiler:INSERT', 'reviews.spoiler:UPDATE', 'reviews.stars:INSERT', 'reviews.stars:UPDATE',
        'reviews.user_id:INSERT'],
  'signed-in clients may insert or update only the reviewed columns');

select is(
  array(select r || ':' || c.relname || ':' || p
        from pg_class c, unnest(array['anon', 'authenticated']) r,
             unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
          and has_table_privilege(r, c.oid, p)
        order by 1),
  array['authenticated:hidden_reviewers:delete', 'authenticated:hidden_reviewers:insert',
        'authenticated:review_likes:delete', 'authenticated:review_likes:insert', 'authenticated:reviews:delete'],
  'table-level write privileges are only the reviewed ones (never truncate)');

select is(
  array(select r || ':' || c.relname from pg_class c, unnest(array['anon', 'authenticated']) r
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
          and (has_sequence_privilege(r, c.oid, 'usage') or has_sequence_privilege(r, c.oid, 'update'))
        order by 1),
  '{}'::text[], 'clients cannot use or setval any sequence');

select is(
  array(select n.nspname::text || ':' || r from pg_namespace n, unnest(array['anon', 'authenticated']) r
        where n.nspname in ('pgmq', 'cron', 'vault', 'supabase_migrations') and has_schema_privilege(r, n.oid, 'usage')
        order by 1),
  '{}'::text[], 'clients cannot reach queues, scheduled jobs, the vault or migrations');

select is(
  array(select c.relname::text from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
          and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))
          and not coalesce('security_invoker=true' = any (c.reloptions), false)
        order by 1),
  array['catalog_books', 'genre_book_counts', 'public_profiles'],
  'views that bypass RLS are only the reviewed public ones');

select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
        order by 1),
  '{}'::text[], 'every SECURITY DEFINER function pins search_path');

select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')
        order by 1),
  array['_has_link_or_phone(text)', '_small(numeric)', '_try_inet(text)', 'get_help_articles(help_category,text)',
        'onboarding_step_ord(text)'],
  'anon can call only the reviewed functions');

select is(
  array(select p.oid::regprocedure::text from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('worker_key_bundle', 'worker_record_license', 'log_unmatched_store_event', 'launch_check',
                            'invite_first_super_admin', 'ingest_payment_event', 'apply_payment_event', 'accept_staff_invite')
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
        order by 1),
  '{}'::text[], 'key, licence, payment and launch functions are server only');

-- ─── As anon ────────────────────────────────────────────────────────────────
create temp table sweep_rows (who text, rel text, n bigint);
create temp table sweep_calls (fn text, state text, result text);
create temp table sweep_rels as
  select c.oid::regclass::text as rel from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm');
create temp table sweep_fns as
  select p.oid::regprocedure::text as sig, p.proname::text as name, p.proretset as setof,
         coalesce((select string_agg('null::' || format_type(t, null), ', ') from unnest(p.proargtypes::oid[]) t), '') as args
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
    and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute');
grant all on sweep_rows, sweep_calls, sweep_rels, sweep_fns to anon, authenticated;

-- Row counts a caller sees in every table and view (permission errors count as nothing).
create function pg_temp.count_rows(p_who text) returns void language plpgsql as $f$
declare r record; v bigint;
begin
  for r in select rel from sweep_rels order by rel loop
    begin
      execute format('select count(*) from %s', r.rel) into v;
    exception when insufficient_privilege then v := 0;
    end;
    insert into sweep_rows values (p_who, r.rel, v);
  end loop;
end $f$;

-- Every SECURITY DEFINER function a signed-in user may call, with every argument null.
create function pg_temp.call_all() returns void language plpgsql as $f$
declare r record; v text; st text;
begin
  for r in select * from sweep_fns order by sig loop
    begin
      if r.setof then
        execute format('select count(*)::text from public.%I(%s)', r.name, r.args) into v;
      else
        execute format('select public.%I(%s)::text', r.name, r.args) into v;
      end if;
      insert into sweep_calls values (r.sig, 'ok', v);
    exception when others then
      get stacked diagnostics st = returned_sqlstate;
      insert into sweep_calls values (r.sig, st, null);
    end;
  end loop;
end $f$;
grant execute on function pg_temp.count_rows(text), pg_temp.call_all() to anon, authenticated;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.count_rows('anon');
reset role;

select is(
  array(select rel from sweep_rows where who = 'anon' and n > 0 order by 1),
  array['genres', 'policies'],
  'anon reads only genres and policies');

-- ─── As a signed-in reader with nothing (no purchases, no staff role) ───────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"17000000-0000-4000-a000-000000000099","role":"authenticated","aal":"aal1"}', true);
select pg_temp.count_rows('reader');
select pg_temp.call_all();
reset role;

select is(
  array(select rel from sweep_rows where who = 'reader' and n > 0 order by 1),
  array['app_config', 'author_posts', 'author_profiles', 'author_stats', 'book_effective', 'book_rankings',
        'book_rating_stats', 'book_related', 'book_revisions', 'book_tags', 'books', 'catalog_books', 'chapters',
        'coming_soon_entries', 'genre_book_counts', 'genres', 'groups', 'help_article_versions', 'help_articles',
        'home_sections', 'paragraph_anchors', 'plans', 'policies', 'policy_versions', 'post_comments',
        'pricing_rule_versions', 'profiles', 'public_profiles', 'reviews', 'shelf_items', 'tags', 'topup_products'],
  'a new reader reads only the catalogue, public community and their own profile');

select is(
  (select count(*)::int from sweep_rows where who = 'reader' and rel in
     ('credit_ledger', 'entitlements', 'transactions', 'subscriptions', 'payment_events', 'chapter_keys',
      'audit_log', 'staff_roles', 'author_earnings', 'payouts', 'bank_accounts', 'unmatched_store_events',
      'support_tickets', 'reports', 'devices', 'offline_licenses') and n > 0),
  0, 'a new reader sees no money, key, staff or moderation rows');

select is((select count(*)::int from sweep_rows where who = 'reader' and rel = 'profiles'), 1,
  'profiles is in the sweep');
select is((select n from sweep_rows where who = 'reader' and rel = 'profiles'), 1::bigint,
  'a reader sees only their own profile row');

select is(
  array(select fn from sweep_calls
        where state = 'ok' and fn ~ '^(admin_|staff_)'
          and coalesce(result, '') not in ('', '0', 'false', '[]', '{}', 'null')
        order by 1),
  '{}'::text[], 'no admin_ or staff_ function returns anything to a reader');

select is(
  array(select fn from sweep_calls
        where state = 'ok' and coalesce(result, '') not in ('', '0', 'false', '[]', '{}', 'null')
          and fn !~ '^(get_|list_|search|count_books|suggest|my_credit_balance|pull_annotations)'
        order by 1),
  array['join_open_room(uuid,boolean)', 'join_reading_room(text,boolean)', 'revision_score(uuid)',
        'set_notification_preferences(jsonb)', 'start_application()', 'unfollow_author(uuid)',
        'update_profile(jsonb)'],
  'functions that act for a plain reader are only the reviewed ones');

-- Chapter keys: the Worker releases keys only for entitled_chapters() as the reader. A reader with
-- nothing gets no paid chapter of a live paid book.
select ok(
  (select count(*) > 0
   from public.books b
   join public.book_revisions r on r.id = b.current_revision_id
   join public.chapters ch on ch.revision_id = r.id and ch.ord > coalesce(r.free_through_ord, -1)
   where b.status = 'live' and b.id = '00000000-0000-4000-c000-000000000008'),
  'the seeded paid book has paid chapters to test with');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"17000000-0000-4000-a000-000000000099","role":"authenticated","aal":"aal1"}', true);
create temp table sweep_ent as
  select public.entitled_chapters('00000000-0000-4000-c000-000000000008') as e;
reset role;
select is(
  (select count(*)::int from sweep_ent, jsonb_array_elements_text(e -> 'chapter_uids') u
   join public.chapters ch on ch.chapter_uid::text = u
   join public.book_revisions r on r.id = ch.revision_id
   where ch.ord > coalesce(r.free_through_ord, -1)),
  0, 'no paid chapter key is released without an entitlement');
select is((select (e ->> 'all')::boolean from sweep_ent), false, 'a reader with nothing is not entitled to the whole book');

select * from finish();
rollback;
