-- Spec check 03-7, 05-7, 07-11 (server half): real book covers for the app.
-- Covers are uploaded to the private `src/{rev}/cover` (flow 12) and nothing served them. The api
-- Worker's public `GET /v1/covers/{rev}` asks this function which revision's cover it may serve:
-- only covers of books readers can already see: a revision that is or was published, or the
-- scheduled first release of a book (Coming soon; a scheduled update of a live book stays
-- private), of a book that is live, scheduled or unpublished (owners keep it in their library)
-- and not under a copyright claim hold. Drafts, revisions in review, taken-down and rejected
-- books never leave R2. Service role only (the Worker), so ids can't be probed via PostgREST.

create function public.public_cover_key(p_rev uuid) returns text
language sql stable security definer set search_path = '' as $$
  select r.cover_key
  from public.book_revisions r
  join public.books b on b.id = r.book_id
  where r.id = p_rev
    and r.cover_key is not null
    and (r.published_at is not null or (r.status = 'scheduled' and b.status = 'scheduled'))
    and r.status not in ('taken_down', 'rejected')
    and b.status in ('live', 'scheduled', 'unpublished')
    and b.claim_hold_at is null
$$;

revoke all on function public.public_cover_key(uuid) from public, anon, authenticated;
grant execute on function public.public_cover_key(uuid) to service_role;
