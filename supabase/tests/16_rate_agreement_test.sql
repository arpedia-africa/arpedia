-- Flow 16 · spec check 16-20: an author rate change that comes into effect publishes a new Author
-- agreement version with Accept again; authors must accept it, readers are not asked; other rule
-- changes and undone changes publish nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end $$;
create function pg_temp.latest() returns public.policy_versions language sql as $$
  select l.* from public.policies p cross join lateral public._policy_latest(p.id) l where p.slug = 'author-agreement'
$$;
-- Schedule rules (current rules with p_patch) as due now, then run the 00:00 WAT job.
create function pg_temp.apply(p_patch jsonb) returns void language sql as $$
  update public.pricing_rule_versions set cancelled_at = now() where applied_at is null and cancelled_at is null;
  insert into public.pricing_rule_versions (effective_at, rules, changed_by, approved_by, note, version)
  values (now() - interval '1 second', public._rules() || p_patch, '16200000-0000-4000-a000-000000000001',
          '16200000-0000-4000-a000-000000000001', 'test', (select max(version) + 1 from public.pricing_rule_versions));
  select public.apply_pricing_rules();
$$;

-- 1 super admin, 2 author, 3 reader.
insert into auth.users (id, email)
select ('16200000-0000-4000-a000-00000000000' || n)::uuid, 'u' || n || '@t16r.local' from generate_series(1, 3) n;
insert into public.profiles (id, full_name, is_author)
select ('16200000-0000-4000-a000-00000000000' || n)::uuid, 'Rate ' || n, n = 2 from generate_series(1, 3) n
on conflict (id) do update set full_name = excluded.full_name, is_author = excluded.is_author;
insert into public.books (id, author_id, title, status) values
  ('16200000-0000-4000-b000-000000000001', '16200000-0000-4000-a000-000000000002', 'Rated', 'live');
-- Both have accepted every current version, so only a new one can be pending.
insert into public.policy_acceptances (user_id, policy_version_id)
select u.id, l.id from public.policies p cross join lateral public._policy_latest(p.id) l
cross join (values ('16200000-0000-4000-a000-000000000002'::uuid), ('16200000-0000-4000-a000-000000000003'::uuid)) u(id);
select set_config('t.v', (pg_temp.latest()).version::text, true);
select set_config('t.rate', public._rules() ->> 'author_rate_kobo', true);
update public.policies set subtitle = public._naira(current_setting('t.rate')::int) || ' per credit spent · authors only'
where slug = 'author-agreement';

-- ─── Another rule changes: nothing new ──────────────────────────────────────
select pg_temp.apply(jsonb_build_object('undo_minutes', 15));
select is((pg_temp.latest()).version, current_setting('t.v')::int, 'a change that keeps the author rate publishes nothing');

-- ─── An undone rate change: nothing new ─────────────────────────────────────
insert into public.pricing_rule_versions (effective_at, rules, changed_by, note, version)
values (now() + interval '1 day', public._rules() || '{"author_rate_kobo": 200}', '16200000-0000-4000-a000-000000000001',
        'undone', (select max(version) + 1 from public.pricing_rule_versions));
update public.pricing_rule_versions set cancelled_at = now() where note = 'undone';
select public.apply_pricing_rules();
select is((pg_temp.latest()).version, current_setting('t.v')::int, 'an undone rate change publishes nothing');

-- ─── The rate changes ───────────────────────────────────────────────────────
select pg_temp.apply(jsonb_build_object('author_rate_kobo', current_setting('t.rate')::int + 20));
select is((pg_temp.latest()).version, current_setting('t.v')::int + 1, 'a rate change publishes the next agreement version');
select ok((pg_temp.latest()).accept_again, 'with Accept again on');
select matches((pg_temp.latest()).change_summary, '^The author rate changes from ₦[0-9.]+ to ₦[0-9.]+ per credit spent, from ',
  'the summary says what changed');
select is((select subtitle from public.policies where slug = 'author-agreement'),
  public._naira(current_setting('t.rate')::int + 20) || ' per credit spent · authors only',
  'the subtitle shows the new rate');
select ok(exists (select 1 from public.audit_log where action = 'policy.publish'
                  and actor_id = '16200000-0000-4000-a000-000000000001' and object_id = 'author-agreement'),
  'audited as the Super admin who saved the rules');

select pg_temp.as_user('16200000-0000-4000-a000-000000000002');
select is((select x ->> 'slug' from jsonb_array_elements(public.get_pending_policies()) x), 'author-agreement',
  'the author must accept it on next open');
select pg_temp.as_user('16200000-0000-4000-a000-000000000003');
select is(jsonb_array_length(public.get_pending_policies()), 0, 'readers are not asked');

select * from finish();
rollback;
