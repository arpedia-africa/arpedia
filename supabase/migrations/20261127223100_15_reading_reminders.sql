-- Flow 15 · spec check 15-18 (Server: pg_cron reading_reminders; rule 1). The job ran once a day
-- at 17:00 UTC for everyone, reminded readers who had no unfinished book, and sent no book title
-- or tap target, so the push read " is waiting for you" and opened Home.
-- Now: every hour, readers whose own time zone (notification_preferences.timezone, default
-- Africa/Lagos) reads 18:00, who have an unfinished book they started (the Library's Reading
-- shelf rule) and haven't read for 3 days, at most one reminder a week. The push names the book
-- they opened last and a tap opens it.
create or replace function public.enqueue_reading_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
begin
  with zones as (
    select z.name, z.utc_offset from pg_catalog.pg_timezone_names z
  ), local_six as (
    -- Readers whose clock reads 18:xx now. An unknown zone falls back to Lagos (UTC+1).
    select pr.id as user_id
    from public.profiles pr
    left join public.notification_preferences np on np.user_id = pr.id
    left join zones z on z.name = coalesce(np.timezone, 'Africa/Lagos')
    where extract(hour from (now() at time zone 'UTC') + coalesce(z.utc_offset, interval '1 hour')) = 18
  ), open_book as (
    -- The unfinished book each reader opened last (Reading shelf: started, not finished).
    select distinct on (rp.user_id) rp.user_id, rp.book_id, b.title
    from public.reading_progress rp
    join local_six l on l.user_id = rp.user_id
    join public.books b on b.id = rp.book_id
    where rp.finished_at is null and rp.max_percent > 0 and b.status not in ('taken_down', 'rejected')
    order by rp.user_id, rp.last_opened_at desc
  ), due as (
    select o.* from open_book o
    where greatest(
            (select max(s.started_at) from public.reading_sessions s where s.user_id = o.user_id),
            (select max(rp.last_opened_at) from public.reading_progress rp where rp.user_id = o.user_id))
          between now() - interval '60 days' and now() - interval '3 days'
      and not exists (select 1 from public.push_log pl where pl.user_id = o.user_id
                        and pl.type = 'reading_reminder' and pl.created_at > now() - interval '7 days')
  )
  select count(*) into n from (
    select pgmq.send('push_fanout', jsonb_build_object('type', 'reading_reminder',
      'user_ids', jsonb_build_array(d.user_id),
      'data', jsonb_build_object('book_id', d.book_id, 'vars', jsonb_build_object('book_title', d.title),
                                 'target', jsonb_build_object('kind', 'book', 'id', d.book_id))))
    from due d
  ) s;
  return n;
end $$;

revoke all on function public.enqueue_reading_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_reading_reminders() to service_role;

-- Hourly, so each time zone gets its 18:00 (cron.schedule replaces the job of the same name).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('reading_reminders', '0 * * * *', 'select public.enqueue_reading_reminders()');
  end if;
end $$;
