-- Flow 16 fix: public legal pages. get_public_policies returns the latest published version of every
-- policy (never a draft) and only the service role (the api Worker) may call it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- A draft of the Privacy policy must not show; a second published version must replace version 1.
insert into public.policy_versions (policy_id, body, status)
select id, 'Secret draft text', 'draft' from public.policies where slug = 'privacy';
insert into public.policy_versions (policy_id, version, body, change_summary, status, published_at)
select id, 2, 'Terms version two', 'Second version', 'published', now() from public.policies where slug = 'terms';

set local role service_role;
select is(jsonb_array_length(public.get_public_policies()),
  (select count(*)::int from public.policies), 'one entry per policy');
select is((select e->>'version' from jsonb_array_elements(public.get_public_policies()) e where e->>'slug' = 'terms'),
  '2', 'the latest published version');
select is((select e->>'body' from jsonb_array_elements(public.get_public_policies()) e where e->>'slug' = 'terms'),
  'Terms version two', 'with its text');
select ok(public.get_public_policies()::text not like '%Secret draft text%', 'drafts never leave the database');
reset role;

set local role anon;
select throws_ok($$select public.get_public_policies()$$, '42501', null, 'anon cannot call it');
reset role;
set local role authenticated;
select throws_ok($$select public.get_public_policies()$$, '42501', null, 'readers cannot call it');
reset role;

select * from finish();
rollback;
