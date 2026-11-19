-- Flow 16 pass 2: step-ups (single use, 5 minutes), pricing rules (role, version conflict, plan
-- check, Undo, 00:00 WAT apply), config and flags by role, remote copy placeholders, policy
-- versions immutable, approvals never self-approved, audit log immutable and visible by role.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

insert into auth.users (id, email) values
  ('16000000-0000-4000-a000-000000000001', 'sa1@arpedia.africa'),
  ('16000000-0000-4000-a000-000000000002', 'sa2@arpedia.africa'),
  ('16000000-0000-4000-a000-000000000003', 'ops@arpedia.africa'),
  ('16000000-0000-4000-a000-000000000004', 'fin@arpedia.africa'),
  ('16000000-0000-4000-a000-000000000005', 'pub@arpedia.africa'),
  ('16000000-0000-4000-a000-000000000006', 'reader16@test.local'),
  ('16000000-0000-4000-a000-000000000007', 'author16@test.local'),
  ('16000000-0000-4000-a000-000000000008', 'analyst@arpedia.africa');
insert into public.profiles (id, full_name) values
  ('16000000-0000-4000-a000-000000000001', 'Sa One'),
  ('16000000-0000-4000-a000-000000000002', 'Sa Two'),
  ('16000000-0000-4000-a000-000000000003', 'Ops'),
  ('16000000-0000-4000-a000-000000000004', 'Fin'),
  ('16000000-0000-4000-a000-000000000005', 'Pub'),
  ('16000000-0000-4000-a000-000000000006', 'Reader'),
  ('16000000-0000-4000-a000-000000000007', 'Author'),
  ('16000000-0000-4000-a000-000000000008', 'Analyst')
  on conflict (id) do update set full_name = excluded.full_name;
insert into public.staff_roles (user_id, role) values
  ('16000000-0000-4000-a000-000000000001', 'super_admin'),
  ('16000000-0000-4000-a000-000000000002', 'super_admin'),
  ('16000000-0000-4000-a000-000000000003', 'operations_admin'),
  ('16000000-0000-4000-a000-000000000004', 'finance'),
  ('16000000-0000-4000-a000-000000000005', 'publisher'),
  ('16000000-0000-4000-a000-000000000008', 'analyst');

-- A live book: 250 stored pages, 125 credits, chapters 0 (free) and 1–2 (paid, 100 + 150 pages).
insert into public.books (id, author_id, title) values
  ('16000000-0000-4000-c000-000000000001', '16000000-0000-4000-a000-000000000007', 'Rules Book');
insert into public.book_revisions (id, book_id, revision_no, words, pages, price_credits) values
  ('16000000-0000-4000-d000-000000000001', '16000000-0000-4000-c000-000000000001', 1, 62400, 250, 125);
insert into public.chapters (revision_id, ord, title, pages, price_credits) values
  ('16000000-0000-4000-d000-000000000001', 0, 'Free', 25, 0),
  ('16000000-0000-4000-d000-000000000001', 1, 'One', 100, 50),
  ('16000000-0000-4000-d000-000000000001', 2, 'Two', 150, 75);
update public.books set status = 'live', current_revision_id = '16000000-0000-4000-d000-000000000001'
  where id = '16000000-0000-4000-c000-000000000001';

-- JWT claims for `uid`: aal2 with a TOTP proof `age` old, or aal1 when age is null.
create function pg_temp.as_user(uid text, age interval default '1 minute') returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', uid, 'role', 'authenticated',
    'session_id', '16000000-0000-4000-f000-' || right(uid, 12),
    'aal', case when age is null then 'aal1' else 'aal2' end,
    'amr', case when age is null then jsonb_build_array(jsonb_build_object('method', 'password',
                  'timestamp', extract(epoch from now())::bigint))
           else jsonb_build_array(jsonb_build_object('method', 'totp',
                  'timestamp', extract(epoch from now() - age)::bigint)) end)::text, true)
$$;
grant execute on function pg_temp.as_user(text, interval) to authenticated;
create table pg_temp.ids (k text primary key, id uuid);
grant all on pg_temp.ids to authenticated;

set local role authenticated;

-- ─── Step-ups ───────────────────────────────────────────────────────────────
select pg_temp.as_user('16000000-0000-4000-a000-000000000001', '6 minutes');
select throws_ok($$select public.verify_stepup('pricing_rules')$$, 'P0001', 'stepup_expired',
  'a TOTP proof older than 5 minutes makes no step-up');
select pg_temp.as_user('16000000-0000-4000-a000-000000000001');
insert into pg_temp.ids values ('s1', public.verify_stepup('pricing_rules'));
select isnt((select id from pg_temp.ids where k = 's1'), null, 'a fresh TOTP proof makes a step-up');
select throws_ok($$select public.verify_stepup('maintenance')$$, 'P0001', 'stepup_used',
  'one TOTP proof makes only one step-up');
select is(public.verify_stepup('maintenance', 'zzzz-zzzz'), null, 'a wrong backup code returns null');
select ok(not has_table_privilege('authenticated', 'public.staff_stepups', 'SELECT'),
  'step-ups are never readable by clients');
select pg_temp.as_user('16000000-0000-4000-a000-000000000006');
select throws_ok($$select public.verify_stepup('pricing_rules')$$, '42501', null, 'readers cannot make step-ups');

-- ─── Pricing rules ──────────────────────────────────────────────────────────
select pg_temp.as_user('16000000-0000-4000-a000-000000000004');
select is((public.get_pricing_rules() ->> 'version')::int, 1, 'Finance reads the rules (version 1)');
select is((public.get_pricing_rules() ->> 'can_save')::boolean, false, 'Finance cannot save rules');
select is((public.preview_pricing_rules('{"credits_per_page": 0.6}') ->> 'books_changed')::int, 1,
  'Finance previews a change: one book price moves');
select throws_ok($$select public.save_pricing_rules('{"credits_per_page": 0.6}', 1, null)$$, '42501', null,
  'Finance cannot save pricing rules');
select pg_temp.as_user('16000000-0000-4000-a000-000000000005');
select throws_ok($$select public.get_pricing_rules()$$, '42501', null, 'a Publisher cannot open pricing rules');

select pg_temp.as_user('16000000-0000-4000-a000-000000000001');
select throws_ok($$select public.save_pricing_rules('{"credits_per_page": 0.6}', 1, null)$$, 'P0001',
  'stepup_expired', 'saving without a fresh code fails');
select throws_ok(format($$select public.save_pricing_rules('{"credits_per_page": 0.6}', 0, %L)$$,
  (select id from pg_temp.ids where k = 's1')), 'P0001', 'rules_changed', 'a stale version is refused');
select throws_ok(format($$select public.save_pricing_rules('{"author_rate_kobo": 300}', 1, %L)$$,
  (select id from pg_temp.ids where k = 's1')), 'P0001', 'plan_check_failed',
  'a plan with margin at or below zero cannot be saved');
select throws_ok(format($$select public.save_pricing_rules('{"words_per_page": 5}', 1, %L)$$,
  (select id from pg_temp.ids where k = 's1')), 'P0001', 'bad_rules', 'out-of-range rules are refused');
insert into pg_temp.ids select 'r2', (public.save_pricing_rules('{"credits_per_page": 0.6}', 1,
  (select id from pg_temp.ids where k = 's1')) ->> 'id')::uuid;
select is((select version from public.pricing_rule_versions where id = (select id from pg_temp.ids where k = 'r2')), 2,
  'saved as version 2');
select is((select effective_at from public.pricing_rule_versions where id = (select id from pg_temp.ids where k = 'r2')),
  (date_trunc('day', now() at time zone 'Africa/Lagos') + interval '1 day') at time zone 'Africa/Lagos',
  'effective at the next 00:00 WAT');
select is((public._rules() ->> 'credits_per_page')::numeric, 0.5, 'the rules in effect do not change mid-day');
select throws_ok(format($$select public.save_pricing_rules('{"credits_per_page": 0.7}', 2, %L)$$,
  (select id from pg_temp.ids where k = 's1')), 'P0001', 'stepup_expired', 'a step-up works only once');
select is((select count(*)::int from public.audit_log where action = 'pricing_rules.save'
           and object_id = (select id from pg_temp.ids where k = 'r2')::text), 1, 'the save is audited');

-- A second Super admin who loaded version 1 gets "Rules changed by Sa One".
select pg_temp.as_user('16000000-0000-4000-a000-000000000002');
insert into pg_temp.ids values ('s2', public.verify_stepup('pricing_rules'));
select throws_ok(format($$select public.save_pricing_rules('{"credits_per_page": 0.7}', 1, %L)$$,
  (select id from pg_temp.ids where k = 's2')), 'P0001', 'rules_changed',
  'two Super admins saving at once: the second save fails');

-- Undo before the effective time.
select pg_temp.as_user('16000000-0000-4000-a000-000000000001');
select lives_ok(format($$select public.cancel_pricing_rules(%L)$$, (select id from pg_temp.ids where k = 'r2')),
  'Undo works before the effective time');
select is((public.get_pricing_rules() -> 'scheduled'), 'null'::jsonb, 'nothing is scheduled after Undo');
select is((public.get_pricing_rules() ->> 'version')::int, 1, 'the version goes back to 1');

-- Save again (version 3) and let it fall due.
insert into pg_temp.ids values ('s3', null);
reset role;
update public.staff_stepups set proof_at = now() - interval '4 minutes', verified_at = now() - interval '4 minutes'
  where id = (select id from pg_temp.ids where k = 's2');
-- A step-up verified more than 5 minutes ago is expired.
update public.staff_stepups set verified_at = now() - interval '6 minutes'
  where id = (select id from pg_temp.ids where k = 's2');
set local role authenticated;
select pg_temp.as_user('16000000-0000-4000-a000-000000000002');
select throws_ok(format($$select public.save_pricing_rules('{"credits_per_page": 0.6}', 1, %L)$$,
  (select id from pg_temp.ids where k = 's2')), 'P0001', 'stepup_expired', 'a step-up expires after 5 minutes');
select pg_temp.as_user('16000000-0000-4000-a000-000000000002', '30 seconds');
update pg_temp.ids set id = public.verify_stepup('pricing_rules') where k = 's3';
insert into pg_temp.ids select 'r3', (public.save_pricing_rules('{"credits_per_page": 0.6}', 1,
  (select id from pg_temp.ids where k = 's3')) ->> 'id')::uuid;
select is((select version from public.pricing_rule_versions where id = (select id from pg_temp.ids where k = 'r3')), 3,
  'the next save is version 3');

reset role;
update public.pricing_rule_versions set effective_at = now() - interval '1 minute'
  where id = (select id from pg_temp.ids where k = 'r3');
select is(public.apply_pricing_rules(), 1, 'the 00:00 WAT job reprices one book');
select is((select price_credits from public.book_revisions where id = '16000000-0000-4000-d000-000000000001'), 150,
  'price = ceil(250 pages × 0.6) = 150');
select is((select array_agg(price_credits order by ord) from public.chapters
           where revision_id = '16000000-0000-4000-d000-000000000001'), array[0, 60, 90],
  'chapter prices spread by pages and sum to the price');
select is((select new_credits from public.book_price_history where book_id = '16000000-0000-4000-c000-000000000001'
           order by id desc limit 1), 150, 'the change is in the price history');
select isnt((select applied_at from public.pricing_rule_versions where id = (select id from pg_temp.ids where k = 'r3')),
  null, 'the row is marked applied');
select is(public.apply_pricing_rules(), 0, 'the job does nothing twice');
select is((public._rules() ->> 'credits_per_page')::numeric, 0.6, 'the new rules are in effect');
select is((select actor_name from public.audit_log where action = 'pricing_rules.apply' order by id desc limit 1),
  'Sa Two', 'the apply is audited under the person who saved');

-- ─── App configuration ──────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user('16000000-0000-4000-a000-000000000003');
select is((public.get_config_screen() ->> 'can_edit')::boolean, false, 'Operations admin sees config read-only');
select throws_ok($$select public.set_flag('gifts', false)$$, '42501', null, 'Operations admin cannot change flags');
select throws_ok($$select public.set_config('android_min_version', '"25.5"')$$, '42501', null,
  'Operations admin cannot change versions');
select is(public.set_copy('unlock.confirm', 'Unlock for {credits} credits?') ->> 'text', 'Unlock for {credits} credits?',
  'Operations admin edits remote copy');
select throws_ok($$select public.set_copy('unlock.confirm', 'Unlock this book?')$$, 'P0001', 'missing_placeholder',
  'a text that drops a required placeholder is rejected');

select pg_temp.as_user('16000000-0000-4000-a000-000000000001', '4 minutes');
select throws_ok($$select public.set_config('maintenance', '{"on": true, "message": "Back in 30 minutes, books are safe."}')$$,
  'P0001', 'stepup_expired', 'maintenance mode needs a fresh code');
select throws_ok($$select public.set_config('android_min_version', '"25"')$$, 'P0001', 'bad_version',
  'versions must be major.minor');
select is(public.set_config('android_min_version', '"25.10"') #>> '{}', '25.10', 'Super admin sets the minimum version');
insert into pg_temp.ids values ('m', public.verify_stepup('maintenance'));
select is(public.set_config('maintenance', '{"on": true, "message": "Back in 30 minutes, books are safe."}',
  (select id from pg_temp.ids where k = 'm')) ->> 'on', 'true', 'maintenance turns on with a fresh code');
select is((public.get_app_config('26.1') -> 'maintenance' ->> 'on'), 'true', 'the app config shows maintenance');
select is(public.set_config('maintenance', '{"on": false, "message": "Back in 30 minutes, books are safe."}') ->> 'on',
  'false', 'turning maintenance off needs no code');
select is(public.set_flag('gifts', false) ->> 'enabled', 'false', 'Super admin turns a flag off');
select is((select count(*)::int from public.audit_log where action = 'flag.off' and object_id = 'gifts'), 1,
  'turning a flag off is audited');
select is((public.get_app_config('26.1', '16000000-0000-4000-a000-000000000006') -> 'flags' ->> 'gifts'), 'false',
  'an off flag is off for every reader');
select is((public.get_app_config('26.1', '16000000-0000-4000-a000-000000000006') -> 'flags' ->> 'onboarding_v2'), 'false',
  'a 0% flag is off');
select is(public._version_cmp('25.4', '25.10'), -1, '25.4 is below 25.10');

-- ─── Policies ───────────────────────────────────────────────────────────────
insert into pg_temp.ids select 'p', id from public.policies where slug = 'privacy';
select lives_ok(format($$select public.save_policy_draft(%L, 'Privacy policy body that is long enough to publish.')$$,
  (select id from pg_temp.ids where k = 'p')), 'Super admin saves a draft');
select pg_temp.as_user('16000000-0000-4000-a000-000000000001', '3 minutes');
insert into pg_temp.ids values ('pp', public.verify_stepup('publish_policy', null));
select is((public.publish_policy((select id from pg_temp.ids where k = 'p'), 'Adds how long we keep reading history.',
  true, (select id from pg_temp.ids where k = 'pp')) ->> 'version')::int, 2, 'publishing makes version 2');
reset role;
select throws_ok($$update public.policy_versions set body = 'changed' where status = 'published'$$, '42501', null,
  'a published version can never be edited, even by the owner role');
select throws_ok($$delete from public.policy_versions where status = 'published'$$, '42501', null,
  'a published version can never be deleted');
set local role authenticated;
select pg_temp.as_user('16000000-0000-4000-a000-000000000006');
select is((select count(*)::int from jsonb_array_elements(public.get_pending_policies()) x where x ->> 'slug' = 'privacy'),
  1, 'the reader must accept the new privacy version');
select lives_ok(format($$select public.accept_policy(%L)$$, (select id from public.policy_versions
  where policy_id = (select id from pg_temp.ids where k = 'p') and version = 2)), 'the reader accepts');
select is(jsonb_array_length(public.get_pending_policies()), 0, 'nothing left to accept');

-- ─── Approvals: nobody approves their own request ───────────────────────────
select pg_temp.as_user('16000000-0000-4000-a000-000000000001');
insert into pg_temp.ids select 'a', (public.request_approval('pii_export', '{"user": "x"}', 'Legal request from NDPC')).id;
select throws_ok(format($$select public.decide_approval(%L, true)$$, (select id from pg_temp.ids where k = 'a')),
  'P0001', 'own_request', 'a Super admin cannot approve their own request');
reset role;
select throws_ok($$update public.approval_requests set approver_id = requested_by, status = 'approved', decided_at = now()$$,
  '23514', null, 'the table itself rejects self-approval');
set local role authenticated;
select pg_temp.as_user('16000000-0000-4000-a000-000000000002');
select is((public.decide_approval((select id from pg_temp.ids where k = 'a'), true)).status, 'approved',
  'a second Super admin approves');

-- ─── Audit log: immutable, visible by role ──────────────────────────────────
select pg_temp.as_user('16000000-0000-4000-a000-000000000004');
select ok((select count(*) from public.audit_log where area <> 'money') = 0 and
          (public.list_audit(p_area => 'money') ->> 'total')::int > 0, 'Finance sees money entries only');
select pg_temp.as_user('16000000-0000-4000-a000-000000000008');
select ok((public.list_audit(p_area => 'settings') ->> 'total')::int > 0, 'Analyst sees every area');
select pg_temp.as_user('16000000-0000-4000-a000-000000000005');
select throws_ok($$select public.list_audit()$$, '42501', null, 'a Publisher cannot open the audit log');
reset role;
select throws_ok($$update public.audit_log set summary = 'x'$$, null, null, 'nobody can edit an audit entry');
select throws_ok($$delete from public.audit_log$$, null, null, 'nobody can delete an audit entry');

select * from finish();
rollback;
