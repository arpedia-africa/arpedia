-- Flow 16 rule 31 (spec check 16-24): Pay as you read is a saved pricing rule. Off stops new
-- chapter-by-chapter buying; readers part-way through keep going (rule 35). Uses the seeded
-- A House Called Grace.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- 1 reader who has not started, 2 reader who pays by chapter already.
insert into auth.users (id, email)
select ('16240000-0000-4000-a000-00000000000' || n)::uuid, 'payg' || n || '@flow16.test' from generate_series(1, 2) n;
insert into public.profiles (id, full_name)
select ('16240000-0000-4000-a000-00000000000' || n)::uuid, 'Reader ' || n from generate_series(1, 2) n
on conflict (id) do nothing;
insert into public.credit_ledger (user_id, delta, reason, bucket, idempotency_key)
select ('16240000-0000-4000-a000-00000000000' || n)::uuid, 100, 'top_up', 'topup', 't16:g' || n
from generate_series(1, 2) n;

-- Two paid chapters of Grace, in reading order.
create temp table ch as
select c.chapter_uid as uid, row_number() over (order by c.ord) as n
from public.books b
join public.book_revisions r on r.id = b.current_revision_id
join public.chapters c on c.revision_id = r.id
where b.id = '00000000-0000-4000-c000-000000000003' and c.ord > r.free_through_ord and c.price_credits > 0
order by c.ord limit 2;
grant select on ch to authenticated;

create function pg_temp.as_user(uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

select is((select count(*)::int from ch), 2, 'Grace has two paid chapters');
select is(public._rules() ->> 'pay_as_you_read', 'true', 'rules saved before the switch read as On');
select is(public._validate_rules('{"pay_as_you_read": false}') ->> 'pay_as_you_read', 'false',
  'Off is a valid rule');
select throws_ok($$select public._validate_rules('{"pay_as_you_read": "no"}')$$, 'P0001', 'bad_rules',
  'a rule that is not On or Off is refused');
select ok(not has_function_privilege('authenticated', 'public._unlock_chapter_base(uuid,uuid,text,text)', 'execute'),
  'readers cannot call the unguarded unlock');

-- Reader 2 starts paying by chapter while the rule is On.
set local role authenticated;
select pg_temp.as_user('16240000-0000-4000-a000-000000000002');
select is(public.unlock_chapter('00000000-0000-4000-c000-000000000003', (select uid from ch where n = 1),
  'tap', 't16-r2-ch1') ->> 'status', 'ok', 'On: a chapter unlocks');
reset role;

-- Saved Off, now in effect.
update public.pricing_rule_versions set cancelled_at = now() where applied_at is null and cancelled_at is null;
insert into public.pricing_rule_versions (effective_at, rules, note, version, applied_at)
values (now() - interval '1 second', public._rules() || '{"pay_as_you_read": false}', 'test',
        (select max(version) + 1 from public.pricing_rule_versions), now());

set local role authenticated;
select pg_temp.as_user('16240000-0000-4000-a000-000000000001');
select throws_ok($$select public.unlock_chapter('00000000-0000-4000-c000-000000000003',
  (select uid from ch where n = 1), 'tap', 't16-r1-ch1')$$, 'P0001', 'payg_off',
  'Off: a reader who has not started cannot pay by chapter');
select is(public.get_book_page('00000000-0000-4000-c000-000000000003') ->> 'pay_as_you_read', 'false',
  'Off: the book page offers only Unlock all');
select is(public.get_reader_state('00000000-0000-4000-c000-000000000003') ->> 'pay_as_you_read', 'false',
  'Off: the reader offers only Unlock all');

select pg_temp.as_user('16240000-0000-4000-a000-000000000002');
select is(public.unlock_chapter('00000000-0000-4000-c000-000000000003', (select uid from ch where n = 1),
  'tap', 't16-r2-ch1') ->> 'replayed', 'true', 'Off: a replayed charge still answers');
select is(public.unlock_chapter('00000000-0000-4000-c000-000000000003', (select uid from ch where n = 2),
  'tap', 't16-r2-ch2') ->> 'status', 'ok', 'Off: a reader part-way through keeps paying by chapter');
select is(public.get_book_page('00000000-0000-4000-c000-000000000003') ->> 'pay_as_you_read', 'true',
  'Off: the book page still offers it to that reader');
reset role;

select is((select count(*)::int from public.credit_ledger
           where user_id = '16240000-0000-4000-a000-000000000001' and reason = 'chapter'), 0,
  'the refused reader was never charged');

select * from finish();
rollback;
