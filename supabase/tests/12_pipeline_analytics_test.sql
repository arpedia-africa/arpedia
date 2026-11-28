-- Flow 12 · spec check 12-16: pipeline events reach the analytics outbox with their properties.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

delete from public.analytics_outbox;
insert into auth.users (id, email) values
  ('12c00000-0000-4000-a000-000000000001', 'a@t12c.local'), ('12c00000-0000-4000-a000-000000000002', 'p@t12c.local');
insert into public.profiles (id, full_name, is_author) values
  ('12c00000-0000-4000-a000-000000000001', 'Author', true), ('12c00000-0000-4000-a000-000000000002', 'Publisher', false)
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.books (id, author_id, title, genres, status) values
  ('12c00000-0000-4000-c000-000000000001', '12c00000-0000-4000-a000-000000000001', 'Counted Book', '{Fiction}', 'draft');
insert into public.book_revisions (id, book_id, revision_no, status, draft_step, generation, readiness, steps) values
  ('12c00000-0000-4000-d000-000000000001', '12c00000-0000-4000-c000-000000000001', 1, 'processing', 'checking', 1, 100,
   jsonb_build_object('received', '2026-11-20T10:00:00Z', 'converted', '2026-11-20T10:00:30Z'));

create function pg_temp.ev(p_event text) returns jsonb language sql as $$
  select props - 'source' from public.analytics_outbox where event = p_event order by id desc limit 1
$$;
create function pg_temp.who(p_event text) returns text language sql as $$
  select distinct_id from public.analytics_outbox where event = p_event order by id desc limit 1
$$;
create function pg_temp.as_publisher() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"sub": "12c00000-0000-4000-a000-000000000002", "role": "authenticated"}', true);
end $$;
create function pg_temp.as_nobody() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Verify finishes: 90 s after conversion, score 92, one open flag.
insert into public.book_flags (revision_id, check_key, message, source)
values ('12c00000-0000-4000-d000-000000000001', 'cover_aspect', 'Cover shape', 'worker');
update public.book_revisions set status = 'draft', draft_step = 'chapters', readiness = 92,
  steps = steps || jsonb_build_object('checks', '2026-11-20T10:02:00Z')
where id = '12c00000-0000-4000-d000-000000000001';
select is(pg_temp.ev('verify_completed'), '{"ms": 90000, "score": 92, "flags": 1}'::jsonb, 'verify_completed with time, score and flags');
select is(pg_temp.who('verify_completed'), '12c00000-0000-4000-a000-000000000001', 'the author is the distinct id');
select is(pg_temp.ev('readiness_changed'), '{"from": 100, "to": 92}'::jsonb, 'readiness_changed from and to');

-- Routed to review, then the publisher approves 12 minutes after opening it.
update public.book_revisions set status = 'ready_for_review', routed_at = now()
where id = '12c00000-0000-4000-d000-000000000001';
select is(pg_temp.ev('routed'), '{"to": "ready_for_review"}'::jsonb, 'routed to review');
update public.book_revisions set review_opened_at = now() - interval '12 minutes'
where id = '12c00000-0000-4000-d000-000000000001';
select pg_temp.as_publisher();
update public.book_revisions set status = 'live', published_at = now()
where id = '12c00000-0000-4000-d000-000000000001';
select pg_temp.as_nobody();
select is(pg_temp.ev('quick_review_decision'), '{"decision": "approve", "minutes": 12.0}'::jsonb, 'quick_review_decision');
select is(pg_temp.who('quick_review_decision'), '12c00000-0000-4000-a000-000000000002', 'the publisher who decided is the distinct id');
select is(pg_temp.ev('book_published'), '{"mode": "manual"}'::jsonb, 'book_published manual');

update public.book_revisions set anchors_moved = '{"highlights": 3, "comments": 2, "paragraphs": 40}'
where id = '12c00000-0000-4000-d000-000000000001';
select is(pg_temp.ev('anchors_moved'), '{"n": 5}'::jsonb, 'anchors_moved counts highlights and comments');

-- A second upload fails verify and goes to the desk; the desk finishes it 6 hours later.
insert into public.book_revisions (id, book_id, revision_no, status, draft_step, generation) values
  ('12c00000-0000-4000-d000-000000000002', '12c00000-0000-4000-c000-000000000001', 2, 'processing', 'checking', 1);
update public.book_revisions set status = 'with_desk', draft_step = null, desk_reason = 'worker_failed',
  due_at = now() + make_interval(days => public._threshold('desk_days')::int) - interval '6 hours'
where id = '12c00000-0000-4000-d000-000000000002';
select is(pg_temp.ev('convert_failed'), '{"reason": "worker_failed"}'::jsonb, 'convert_failed with the reason');
update public.book_revisions set status = 'processing', draft_step = 'checking'
where id = '12c00000-0000-4000-d000-000000000002';
select is(pg_temp.ev('desk_job'), '{"reason": "worker_failed", "wait_h": 6.0}'::jsonb, 'desk_job with reason and wait');

insert into public.send_backs (revision_id, issues, sent_by, source) values
  ('12c00000-0000-4000-d000-000000000002', '[{"text": "a"}, {"text": "b"}]', '12c00000-0000-4000-a000-000000000002', 'fixer');
select is((select props from public.analytics_outbox where event = 'send_back'), '{"source": "fixer", "issues": 2}'::jsonb, 'send_back with source and issue count');

insert into public.book_fixes (revision_id, op, inverse, work_version, staff_id) values
  ('12c00000-0000-4000-d000-000000000002', '{"op": "rename_chapter", "title": "One"}', '{}', 1,
   '12c00000-0000-4000-a000-000000000002');
select is(pg_temp.ev('fix_applied'), '{"op": "rename_chapter"}'::jsonb, 'fix_applied with the op');

select is((select count(*)::int from public.analytics_outbox where props::text like '%Counted Book%'), 0,
  'no book text in any event');

select * from finish();
rollback;
