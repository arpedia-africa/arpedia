-- Flow 08 · authors: Ifeoma's posts and comments (s-author, s-post), Ngozi following her and her
-- paid thread with Ifeoma (s-dm). a000-…01 Ngozi · 02 Ifeoma · 03 Tolu · 05 Chioma · 09 Halima.

-- Seeded DM "Ngozi and Ifeoma" (flow 06) is the reader–author thread: owner = the author, and Ngozi
-- has already seen the price, so Message goes straight to s-dm.
update public.groups set owner_id = '00000000-0000-4000-a000-000000000002'
 where id = '00000000-0000-4000-d000-000000000006';
update public.group_members set role = 'owner'
 where group_id = '00000000-0000-4000-d000-000000000006' and user_id = '00000000-0000-4000-a000-000000000002';
update public.group_members set cost_ack_at = now() - interval '10 days'
 where group_id = '00000000-0000-4000-d000-000000000006' and user_id = '00000000-0000-4000-a000-000000000001';

insert into public.follows (follower_id, followee_id, created_at)
select ('00000000-0000-4000-a000-' || u)::uuid, '00000000-0000-4000-a000-000000000002', now() - interval '20 days'
from unnest(array['000000000001', '000000000003', '000000000004', '000000000005', '000000000009']) u
on conflict do nothing;

insert into public.author_posts (id, author_id, title, body, state, published_at, created_at) values
  ('00000000-0000-4000-e080-000000000001', '00000000-0000-4000-a000-000000000002',
   'Why I wrote the letters first',
   'Before there was a story there were twelve letters in a notebook my late uncle gave me. I wrote one every harmattan for twelve years. When I finally wrote the novel, the letters were already there, waiting for someone to find them in a biscuit tin.',
   'published', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-e080-000000000002', '00000000-0000-4000-a000-000000000002',
   'Chapter 12 is with my editor',
   'Thank you for every message about the gate man. I read every one. Chapter 12 answers more than you think.',
   'published', now() - interval '7 days', now() - interval '7 days'),
  ('00000000-0000-4000-e080-000000000003', '00000000-0000-4000-a000-000000000002',
   'A note on the next book',
   'Draft: not ready to share yet.',
   'draft', null, now() - interval '1 day');

insert into public.post_comments (id, post_id, user_id, parent_id, client_id, body, created_at) values
  ('00000000-0000-4000-e081-000000000001', '00000000-0000-4000-e080-000000000001',
   '00000000-0000-4000-a000-000000000005', null, gen_random_uuid(),
   'Please publish the other nine letters as a short book! I''d unlock it today.', now() - interval '1 day 2 hours'),
  ('00000000-0000-4000-e081-000000000002', '00000000-0000-4000-e080-000000000001',
   '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-e081-000000000001', gen_random_uuid(),
   'Working on it, Chioma 🙂', now() - interval '1 day'),
  ('00000000-0000-4000-e081-000000000003', '00000000-0000-4000-e080-000000000001',
   '00000000-0000-4000-a000-000000000003', null, gen_random_uuid(),
   'The line about the biscuit tin. Wow.', now() - interval '20 hours'),
  ('00000000-0000-4000-e081-000000000004', '00000000-0000-4000-e080-000000000001',
   '00000000-0000-4000-a000-000000000009', null, gen_random_uuid(),
   'Greetings from Kano. You got the harmattan dust exactly right.', now() - interval '5 hours'),
  ('00000000-0000-4000-e081-000000000005', '00000000-0000-4000-e080-000000000002',
   '00000000-0000-4000-a000-000000000001', null, gen_random_uuid(),
   'I knew it! Can''t wait.', now() - interval '6 days');

insert into public.post_likes (post_id, user_id)
select '00000000-0000-4000-e080-000000000001'::uuid, ('00000000-0000-4000-a000-' || u)::uuid
from unnest(array['000000000003', '000000000004', '000000000005', '000000000009']) u
union all
select '00000000-0000-4000-e080-000000000002'::uuid, ('00000000-0000-4000-a000-' || u)::uuid
from unnest(array['000000000001', '000000000005']) u;

select public.author_stats_refresh();
