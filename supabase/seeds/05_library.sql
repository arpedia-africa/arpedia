-- Flow 05 seed: Ngozi's Saved shelf (Still Waters, Lagos at 110 credits; Psalms for the Danfo) so
-- Library shows all three account shelves (Reading: Harmattan Letters from 04; Finished: Ruth of
-- Ibadan from 03). Loaded after 04_reading.sql. Local and CI only. No credits move here.
insert into public.saved_books (user_id, book_id, created_at) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000004', now() - interval '6 days'),
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000006', now() - interval '2 days')
on conflict do nothing;
