-- Flow 03 admin rule 2 · spec check 03-15: a preview override goes live through the rebuild job.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
-- Rebuilt files for a cut through chapter p_free (chapters 0..2; chapter p_free + 1 holds the cut).
create function pg_temp.seal(p_percent numeric, p_free int, p_prices int[]) returns jsonb language sql as $$
  select jsonb_build_object(
    'artifact_prefix', 'books/r/p' || p_percent || '/', 'manifest_key', 'books/r/p' || p_percent || '/manifest.json',
    'preview_percent', p_percent, 'preview_cut_para_id', 'p' || (p_free + 1),
    'preview_cut_chapter_uid', '03e00000-0000-4000-e000-00000000000' || (p_free + 1),
    'free_through_ord', p_free,
    'chapters', (select jsonb_agg(jsonb_build_object('chapter_uid', '03e00000-0000-4000-e000-00000000000' || n,
                   'free_file', case when n = p_free + 1 then 'c' || n || '.free.xhtml' end,
                   'full_file', 'c' || n || '.full.xhtml')) from generate_series(0, 2) n),
    'keys', jsonb_build_array(jsonb_build_object('chapter_uid', null, 'wrapped_key', 'AAAA'))
            || (select coalesce(jsonb_agg(jsonb_build_object('chapter_uid', '03e00000-0000-4000-e000-00000000000' || n,
                                                             'wrapped_key', 'BBBB')), '[]')
                from generate_series(p_free + 1, 2) n),
    'prices', (select jsonb_agg(jsonb_build_object('chapter_uid', '03e00000-0000-4000-e000-00000000000' || n,
                                                   'price_credits', p_prices[n + 1])) from generate_series(0, 2) n))
$$;

insert into auth.users (id, email) values ('03e00000-0000-4000-a000-000000000001', 'author@t03e.local');
insert into public.profiles (id, full_name, is_author) values ('03e00000-0000-4000-a000-000000000001', 'Author', true)
on conflict (id) do update set full_name = excluded.full_name;
insert into public.books (id, author_id, title, genres, status) values
  ('03e00000-0000-4000-c000-000000000001', '03e00000-0000-4000-a000-000000000001', 'Cut Book', '{Fiction}', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord, preview_cut_para_id, artifact_prefix, manifest_key) values
  ('03e00000-0000-4000-d000-000000000001', '03e00000-0000-4000-c000-000000000001', 1, 'live', 30000, 120, 60, 10.2,
   -1, 'p0', 'books/r/g1/', 'books/r/g1/manifest.json'),
  ('03e00000-0000-4000-d000-000000000002', '03e00000-0000-4000-c000-000000000001', 2, 'ready_for_review', 30000, 120,
   60, 10.2, -1, 'p0', null, null);
update public.books set current_revision_id = '03e00000-0000-4000-d000-000000000001'
where id = '03e00000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, pages, price_credits)
select '03e00000-0000-4000-d000-000000000001', ('03e00000-0000-4000-e000-00000000000' || n)::uuid, n, 'Ch ' || n,
       10000, 40, 20
from generate_series(0, 2) n;
insert into public.chapter_keys (revision_id, chapter_uid, wrapped_key, generation)
select '03e00000-0000-4000-d000-000000000001', u, '\x00', 1
from (select null::uuid as u union all
      select ('03e00000-0000-4000-e000-00000000000' || n)::uuid from generate_series(0, 2) n) k;

-- An override waits for the rebuild: readers keep the sealed cut.
update public.books set preview_override_percent = 20 where id = '03e00000-0000-4000-c000-000000000001';
select is((select effective_preview_percent from public.book_effective
           where book_id = '03e00000-0000-4000-c000-000000000001'), 10.2::numeric,
  'override not live before the rebuild');

select pg_temp.as_user('03e00000-0000-4000-a000-000000000001');
select throws_ok($$ select public.complete_preview_rebuild('03e00000-0000-4000-d000-000000000001', 20,
                    pg_temp.seal(20.4, 0, '{0,30,30}')) $$, '42501', null, 'readers cannot apply a rebuild');

select pg_temp.as_service();
select is(public.complete_preview_rebuild('03e00000-0000-4000-d000-000000000001', 15,
            pg_temp.seal(15.1, 0, '{0,30,30}')) ->> 'applied', 'false', 'a stale target is not applied');
select is(public.complete_preview_rebuild('03e00000-0000-4000-d000-000000000001', 20,
            pg_temp.seal(20.4, 0, '{0,30,30}')) ->> 'applied', 'true', 'the current target is applied');
select pg_temp.as_owner();

select is((select effective_preview_percent from public.book_effective
           where book_id = '03e00000-0000-4000-c000-000000000001'), 20.4::numeric, 'readers see the new cut');
select is((select row(free_through_ord, preview_cut_para_id, artifact_prefix)::text from public.book_revisions
           where id = '03e00000-0000-4000-d000-000000000001'), '(0,p1,books/r/p20.4/)', 'cut and files moved');
select is((select array_agg(price_credits order by ord) from public.chapters
           where revision_id = '03e00000-0000-4000-d000-000000000001'), '{0,30,30}'::int[],
  'the free chapter costs 0 and the price is kept');
select is((select count(*)::int from public.chapter_keys
           where revision_id = '03e00000-0000-4000-d000-000000000001' and revoked_at is null), 3,
  'one key per paid chapter plus K_free');
select is((select count(*)::int from public.chapter_keys
           where revision_id = '03e00000-0000-4000-d000-000000000001' and revoked_at is not null), 4,
  'old keys revoked');
select is((select count(*)::int from public.audit_log where action = 'book.preview_rebuilt'
           and object_id = '03e00000-0000-4000-c000-000000000001'), 1, 'rebuild audited');

-- Removing the override rebuilds back to the revision's own cut.
update public.books set preview_override_percent = null where id = '03e00000-0000-4000-c000-000000000001';
select pg_temp.as_service();
select is(public.complete_preview_rebuild('03e00000-0000-4000-d000-000000000001', 10.2,
            pg_temp.seal(10.2, -1, '{20,20,20}')) ->> 'applied', 'true', 'back to the default cut');
select pg_temp.as_owner();
select is((select live_preview_percent from public.book_revisions
           where id = '03e00000-0000-4000-d000-000000000001'), null::numeric, 'no rebuilt percent left');

-- A new revision is sealed with the default cut, so publishing it queues a rebuild for the override.
update public.books set preview_override_percent = 20 where id = '03e00000-0000-4000-c000-000000000001';
update public.books set current_revision_id = '03e00000-0000-4000-d000-000000000002'
where id = '03e00000-0000-4000-c000-000000000001';
select is((select count(*)::int from pgmq.q_book_verify where message ->> 'kind' = 'preview_rebuild'
           and message ->> 'revision_id' = '03e00000-0000-4000-d000-000000000002'), 1,
  'publishing a revision queues the override rebuild');

select * from finish();
rollback;
