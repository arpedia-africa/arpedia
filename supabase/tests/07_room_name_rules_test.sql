-- Flow 07 · spec check 07-9: room names run through the muted words ("Choose a different name.").
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data, created_at) values
  ('70900000-0000-4000-a000-000000000001', 'host@t79.local', '{"full_name":"Host"}', now() - interval '30 days'),
  ('70900000-0000-4000-a000-000000000002', 'au@t79.local', '{"full_name":"Author"}', now() - interval '90 days');
insert into public.books (id, author_id, title, status) values
  ('70900000-0000-4000-b000-000000000001', '70900000-0000-4000-a000-000000000002', 'Named Book', 'live');
insert into public.entitlements (user_id, book_id, scope, source) values
  ('70900000-0000-4000-a000-000000000001', '70900000-0000-4000-b000-000000000001', 'book', 'staff');
delete from public.automod_words;
insert into public.automod_words (text, is_phrase, category, scope, action) values
  ('rubbishword', false, 'harassment', 'everywhere', 'hide'),
  ('mildword', false, 'abuse', 'everywhere', 'warn'),
  ('kiss me', true, 'sexual', 'chat_dms', 'blur'),
  ('spoilerword', false, 'spoilers', 'reviews', 'hide');

select set_config('request.jwt.claims', '{"sub":"70900000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.create_reading_room('The RUBBISHWORD club', '70900000-0000-4000-b000-000000000001')$$,
  '22023', 'name_blocked', 'a Hide word blocks the name');
select throws_ok($$select public.create_reading_room('Kissme readers', '70900000-0000-4000-b000-000000000001')$$,
  '22023', 'name_blocked', 'a chat and DM Blur phrase blocks it too');
select ok(public.create_reading_room('Mildword readers', '70900000-0000-4000-b000-000000000001') ->> 'room_id' is not null,
  'a Warn word does not block a name');
select ok(public.create_reading_room('Spoilerword night', '70900000-0000-4000-b000-000000000001') ->> 'room_id' is not null,
  'review-only words do not apply to rooms');

select * from finish();
rollback;
