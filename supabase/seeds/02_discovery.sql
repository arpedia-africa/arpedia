-- Flow 02 · Discovery seed: shelves, rankings with movement, preview text for search, trending
-- searches, a zero-result request and Ngozi's notifications, as in the prototype.

-- Trending this week (curated, prototype order) and Arpedia authors.
insert into public.shelf_items (section_id, item_type, item_id, position, pinned)
select h.id, 'book', b.id, k.ord - 1, k.ord = 1
from public.home_sections h,
  unnest(array['Harmattan Letters', 'The Alignment', 'Ruth of Ibadan', 'Still Waters, Lagos',
    'A House Called Grace', 'Seven Bridges to Jos', 'Bread on Water', 'Psalms for the Danfo'])
    with ordinality k(title, ord)
join public.books b on b.title = k.title
where h.key = 'trending';

insert into public.shelf_items (section_id, item_type, item_id, position)
select h.id, 'author', p.id, k.ord - 1
from public.home_sections h,
  unnest(array['ifeoma', 'chioma', 'adaeze', 'musa', 'kemi', 'emeka', 'tolu', 'halima']) with ordinality k(username, ord)
join public.profiles p on p.username = k.username
where h.key = 'authors';

update public.home_sections set updated_by = '00000000-0000-4000-b000-000000000008', updated_at = now() - interval '10 days'
where key = 'trending';
update public.home_sections set updated_by = '00000000-0000-4000-b000-000000000001', updated_at = now() - interval '17 days'
where key = 'authors';

-- Rankings: this week's hourly snapshot and last week's weekly one, giving the prototype's
-- movement (— , ▲ 3, New, ▼ 1, —, ▲ 2, ▼ 2, New).
insert into public.book_rankings (snapshot_at, kind, book_id, rank, readers_7d, unlocks_7d)
select now() - interval '20 minutes', 'hourly', b.id, k.ord, 4200 - k.ord * 350, 900 - k.ord * 80
from unnest(array['The Alignment', 'Harmattan Letters', 'Still Waters, Lagos', 'Seven Bridges to Jos',
  'Ruth of Ibadan', 'A House Called Grace', 'Psalms for the Danfo', 'Bread on Water']) with ordinality k(title, ord)
join public.books b on b.title = k.title;

insert into public.book_rankings (snapshot_at, kind, book_id, rank, readers_7d, unlocks_7d)
select date_trunc('week', now()) - interval '1 hour', 'weekly', b.id, k.rank, 3900 - k.rank * 300, 800 - k.rank * 70
from (values ('The Alignment', 1), ('Seven Bridges to Jos', 3), ('Harmattan Letters', 5), ('Ruth of Ibadan', 5),
  ('A House Called Grace', 8), ('Psalms for the Danfo', 5)) k(title, rank)
join public.books b on b.title = k.title;

-- Preview text (first 10%) for story matches.
insert into public.book_search_text (book_revision_id, chapter_id, "offset", text)
select b.current_revision_id, c.id, 0, k.text
from (values
  ('Harmattan Letters', 'The tin smelled of dust and groundnut oil. Inside were forty letters, every one addressed to her, none of them sent. The first began: I prayed for you today, though I do not know your name yet. By grace we will meet before the rains.'),
  ('A House Called Grace', 'Grandmother called the house Grace because it had no right to still be standing. The roof leaked in three places and the tenant in the back room paid his rent in mangoes.'),
  ('The Alignment', 'Two calendars, one Sunday. Kunle wanted the harvest service at eight; Ada had already booked the choir for ten. Somebody would have to give way, and neither of them ever had.'),
  ('Still Waters, Lagos', 'At five every morning the lagoon was still enough to hold the sky. Bayo steered the ferry through it the way his father had taught him, slowly, without looking down.'),
  ('Seven Bridges to Jos', 'The package was the size of a Bible and heavier than it looked. Nobody at the depot would say who sent it, only that it had to reach Jos before the morning.'),
  ('Ruth of Ibadan', 'Ruth packed her chalk, her two good wrappers and her mother-in-law''s recipe for pepper soup. Ibadan grew small behind the bus, and the village road began.'),
  ('Psalms for the Danfo', 'Conductor, take my fare and my worry. Somewhere between Ojota and Obalende I remembered that grace also rides the bus.'),
  ('Bread on Water', 'Mama Kano gave the boy her last loaf without thinking. Eleven years later a stranger paid her shop rent for a year and would not say why.')
) k(title, text)
join public.books b on b.title = k.title
join public.chapters c on c.revision_id = b.current_revision_id and c.ord = 0;

-- Tags from authors (topics).
insert into public.tags (name, slug) values ('grace', 'grace'), ('letters', 'letters'), ('widowhood', 'widowhood'),
  ('Grace', 'grace-2'), ('family', 'family');
insert into public.book_tags (book_id, tag_id)
select b.id, t.id from (values ('Harmattan Letters', 'grace'), ('Harmattan Letters', 'letters'),
  ('Harmattan Letters', 'widowhood'), ('A House Called Grace', 'grace-2'), ('A House Called Grace', 'family'),
  ('Ruth of Ibadan', 'family')) k(title, slug)
join public.books b on b.title = k.title join public.tags t on t.slug = k.slug;

-- Synonyms and settings.
insert into public.search_synonyms (terms, created_by) values
  (array['devotional', 'devotion', 'prayer book'], '00000000-0000-4000-b000-000000000002'),
  (array['romance', 'love story'], '00000000-0000-4000-b000-000000000002');

-- Searches this week: enough distinct searchers for the trending list (anonymous ids).
insert into public.search_events (user_id, query_norm, result_count, created_at)
select gen_random_uuid(), q.query, q.results, now() - make_interval(hours => (g % 150))
from (values ('grace', 24, 3), ('harmattan letters', 19, 1), ('chioma okafor', 11, 1), ('christian romance', 9, 1),
  ('things fall apart', 5, 0)) q(query, per_ten, results)
cross join lateral generate_series(1, q.per_ten * 2 + 2) g;

-- Zero-result requests ("Books readers want").
insert into public.book_requests (user_id, query_norm, created_at)
select u.id, 'things fall apart', now() - interval '2 days'
from public.profiles u where u.username in ('tolu', 'kemi', 'chioma');

-- Ngozi's notifications (3 new, 5 earlier), as on s-notifications.
insert into public.notifications (user_id, kind, category, actor_id, book_id, title, body, target_type, target_id,
  created_at, read_at)
select '00000000-0000-4000-a000-000000000001', n.kind, n.category, a.id, b.id, n.title, n.body, n.target_type,
  coalesce(b.id::text, n.target_id), now() - n.ago, case when n.read then now() - n.ago + interval '1 hour' end
from (values
  ('new_book', 'books', null, 'Bread on Water', 'New in the library.', 'Bread on Water by Halima Bello is now available.', 'book', null, interval '2 hours', false),
  ('note_reply', 'community', null, 'Harmattan Letters', 'New reply to your note.', 'Hauwa Musa replied to your note in Harmattan Letters.', 'note', 'n1', interval '5 hours', false),
  ('author_post', 'authors', 'ifeoma', null, 'Ifeoma Nwachukwu posted.', 'Why Kemi had to take the train.', 'post', 'p1', interval '7 hours', false),
  ('club_message', 'community', null, null, 'Grace Readers.', 'Amaka: What is everyone reading this weekend?', 'club', 'grace-readers', interval '10 hours', true),
  ('author_reply', 'authors', 'ifeoma', null, 'Reply from Ifeoma Nwachukwu.', 'She is a little bit of three women I knew in Kano.', 'post', 'p2', interval '2 days', true),
  ('resume', 'books', null, 'Harmattan Letters', 'Pick up where you left off.', 'You are 34% through Harmattan Letters.', 'reader', null, interval '2 days 1 hour', true),
  ('challenge', 'community', null, null, 'Reading challenge.', 'Finish one book this month to enter the free-year draw.', null, null, interval '4 days', true),
  ('coming_soon', 'books', null, 'Seven Bridges to Jos', 'Coming soon.', 'Seven Bridges to Jos has a new chapter excerpt.', 'book', null, interval '6 days', true)
) n(kind, category, actor, book, title, body, target_type, target_id, ago, read)
left join public.profiles a on a.username = n.actor
left join public.books b on b.title = n.book;
