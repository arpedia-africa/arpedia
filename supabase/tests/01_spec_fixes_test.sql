-- Flow 01 · spec check 01-2: when Google links onto an email-password account nobody verified,
-- the password is cleared and earlier sessions end; a verified account keeps its password; a
-- Google sign-up marks the email verified; readers can't set email_verified_at themselves.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Victim's address pre-registered by someone else (email identity, password, a live session).
insert into auth.users (id, email, encrypted_password, raw_user_meta_data, created_at) values
  ('01200000-0000-4000-a000-000000000001', 'victim@t12.local', 'attacker-hash', '{"full_name":"Pre-registered"}', now() - interval '2 days'),
  ('01200000-0000-4000-a000-000000000002', 'owner@t12.local', 'owner-hash', '{"full_name":"Verified Owner"}', now() - interval '2 days'),
  ('01200000-0000-4000-a000-000000000003', 'new@t12.local', null, '{"full_name":"Google Reader"}', now());
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at) values
  ('01200000-0000-4000-a000-000000000001', '01200000-0000-4000-a000-000000000001', '{"sub":"1","email":"victim@t12.local"}', 'email', now() - interval '2 days'),
  ('01200000-0000-4000-a000-000000000002', '01200000-0000-4000-a000-000000000002', '{"sub":"2","email":"owner@t12.local"}', 'email', now() - interval '2 days');
insert into auth.sessions (id, user_id, created_at) values
  ('01200000-0000-4000-c000-000000000001', '01200000-0000-4000-a000-000000000001', now() - interval '1 day'),
  ('01200000-0000-4000-c000-000000000002', '01200000-0000-4000-a000-000000000002', now() - interval '1 day');
update public.profiles set email_verified_at = now() - interval '1 day' where id = '01200000-0000-4000-a000-000000000002';

-- The real owner signs in with Google: Supabase links the identity to the existing user.
insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('g-victim', '01200000-0000-4000-a000-000000000001', '{"sub":"g-victim","email":"victim@t12.local","email_verified":true}', 'google'),
  ('g-owner', '01200000-0000-4000-a000-000000000002', '{"sub":"g-owner","email":"owner@t12.local","email_verified":true}', 'google'),
  ('g-new', '01200000-0000-4000-a000-000000000003', '{"sub":"g-new","email":"new@t12.local","email_verified":true}', 'google');

select is((select encrypted_password from auth.users where id = '01200000-0000-4000-a000-000000000001'), null,
  'the password set by whoever pre-registered the address is cleared');
select is((select count(*)::int from auth.sessions where user_id = '01200000-0000-4000-a000-000000000001'), 0,
  'their earlier sessions end');
select ok((select email_verified_at is not null from public.profiles where id = '01200000-0000-4000-a000-000000000001'),
  'Google proves the address');
select ok((select count(*)::int from public.audit_log where action = 'google_link_password_cleared'
           and object_id = '01200000-0000-4000-a000-000000000001') = 1, 'and it is audited');
select is((select encrypted_password from auth.users where id = '01200000-0000-4000-a000-000000000002'), 'owner-hash',
  'a verified account keeps its password when Google links');
select is((select count(*)::int from auth.sessions where user_id = '01200000-0000-4000-a000-000000000002'), 1,
  'and keeps its sessions');
select ok((select email_verified_at is not null from public.profiles where id = '01200000-0000-4000-a000-000000000003'),
  'a Google sign-up is verified');

-- A Google identity for another address never marks this one verified.
insert into auth.users (id, email, created_at) values
  ('01200000-0000-4000-a000-000000000004', 'reset@t12.local', now() - interval '2 days'),
  ('01200000-0000-4000-a000-000000000005', 'mismatch@t12.local', now() - interval '2 days');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('g-other', '01200000-0000-4000-a000-000000000005', '{"sub":"g-other","email":"someone-else@t12.local","email_verified":true}', 'google');
select ok((select email_verified_at is null from public.profiles where id = '01200000-0000-4000-a000-000000000005'),
  'a Google identity for a different address proves nothing');
-- A finished password reset (the recovery token is used up) proves the inbox.
update auth.users set recovery_token = 'tok', recovery_sent_at = now() where id = '01200000-0000-4000-a000-000000000004';
update auth.users set recovery_token = '' where id = '01200000-0000-4000-a000-000000000004';
select ok((select email_verified_at is not null from public.profiles where id = '01200000-0000-4000-a000-000000000004'),
  'a finished password reset marks the email verified');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"01200000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$ update public.profiles set email_verified_at = null where id = '01200000-0000-4000-a000-000000000001' $$,
  '42501', null, 'readers cannot change email_verified_at');

select * from finish();
rollback;
