-- Flow 04 · spec check 04-3 (server half): a highlight or note can be shared with a club the reader
-- belongs to; bookmarks and other groups are refused.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email)
select ('40430000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@flow04s.test' from generate_series(1, 2) n;
insert into public.profiles (id, full_name, is_author)
select ('40430000-0000-4000-a000-00000000000' || n)::uuid, 'User ' || n, n = 2 from generate_series(1, 2) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;

insert into public.books (id, author_id, title, genres, status) values
  ('40430000-0000-4000-c000-000000000001', '40430000-0000-4000-a000-000000000002', 'Shared Book', '{Fiction}', 'live');
insert into public.book_revisions (id, book_id, revision_no, status, words, pages, price_credits, preview_percent,
  free_through_ord, preview_cut_para_id, preview_cut_chapter_uid)
values ('40430000-0000-4000-d000-000000000001', '40430000-0000-4000-c000-000000000001', 1, 'live', 1000, 4, 2,
  10, 0, 'c0p1', '40430000-0000-4000-e000-000000000000');
update public.books set current_revision_id = '40430000-0000-4000-d000-000000000001'
where id = '40430000-0000-4000-c000-000000000001';
insert into public.chapters (revision_id, chapter_uid, ord, title, words, words_before, pages, price_credits) values
  ('40430000-0000-4000-d000-000000000001', '40430000-0000-4000-e000-000000000000', 0, 'One', 1000, 0, 4, 0);
insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint, words, words_before) values
  ('40430000-0000-4000-d000-000000000001', 'c0p0', '40430000-0000-4000-e000-000000000000', 0, 'c0p0', 500, 0),
  ('40430000-0000-4000-d000-000000000001', 'c0p1', '40430000-0000-4000-e000-000000000000', 1, 'c0p1', 500, 500);

insert into public.groups (id, kind, name, visibility, member_count) values
  ('40430000-0000-4000-b000-000000000001', 'club', 'Shared Readers', 'public', 1),
  ('40430000-0000-4000-b000-000000000002', 'club', 'Other Club', 'public', 0);
insert into public.group_members (group_id, user_id) values
  ('40430000-0000-4000-b000-000000000001', '40430000-0000-4000-a000-000000000001');

create function pg_temp.note(p_client text, p_kind text, p_group text) returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'client_id', p_client, 'book_id', '40430000-0000-4000-c000-000000000001',
    'revision_id', '40430000-0000-4000-d000-000000000001', 'kind', p_kind,
    'color', case when p_kind = 'bookmark' then null else 'yellow' end,
    'cfi_range', 'epubcfi(/6/4!/4/2,/1:0,/1:20)', 'chapter_uid', '40430000-0000-4000-e000-000000000000',
    'start_para_id', 'c0p0', 'end_para_id', 'c0p0', 'quote', 'The first line', 'note_text', 'Lovely',
    'visibility', case when p_group is null then 'private' else 'club' end, 'shared_group_id', p_group,
    'updated_at', now()))
$$;
grant execute on function pg_temp.note(text, text, text) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40430000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(public.upsert_annotations(pg_temp.note('40430000-0000-4000-f000-000000000001', 'note',
  '40430000-0000-4000-b000-000000000001')) -> 0 ->> 'visibility', 'club', 'a note can be shared with my club');
select is((select shared_group_id from public.annotations where client_id = '40430000-0000-4000-f000-000000000001'),
  '40430000-0000-4000-b000-000000000001'::uuid, 'and records which club');
select is(public.upsert_annotations(pg_temp.note('40430000-0000-4000-f000-000000000002', 'highlight',
  '40430000-0000-4000-b000-000000000001')) -> 0 ->> 'visibility', 'club', 'a highlight too');
select throws_ok($$select public.upsert_annotations(pg_temp.note('40430000-0000-4000-f000-000000000003', 'note',
  '40430000-0000-4000-b000-000000000002'))$$, 'P0001', 'not_member', 'not to a club I am not in');
select throws_ok($$select public.upsert_annotations(pg_temp.note('40430000-0000-4000-f000-000000000004', 'bookmark',
  '40430000-0000-4000-b000-000000000001'))$$, 'P0001', 'not_member', 'bookmarks are never shared');
reset role;
update public.annotations set updated_at = now() - interval '1 minute'
where client_id = '40430000-0000-4000-f000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40430000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(public.upsert_annotations(pg_temp.note('40430000-0000-4000-f000-000000000001', 'note', null))
  -> 0 ->> 'visibility', 'private',
  'switching sharing off makes it private again');
select is(public.upsert_annotations(pg_temp.note('40430000-0000-4000-f000-000000000005', 'note', null))
  -> 0 ->> 'visibility', 'private', 'private notes work as before');

select * from finish();
rollback;
