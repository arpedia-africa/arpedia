-- Flow 14 · spec check 14-9 (rules 31, 32): books.claim_hold_at was written but never read.
-- 1. A book held for a claim is kept out of Discover: every Discover read goes through
--    catalog_books, which now leaves held books out. Readers who unlocked it keep access (the
--    book page, library and reader don't use catalog_books).
-- 2. Author earnings are frozen while the claim is open: the author's earnings line is held
--    ("held_dispute", reason names the book) and carries until the claim is decided. This holds
--    the whole line, not only that book's share (the safe side; owner may ask for per-book later).

create or replace view public.catalog_books with (security_barrier) as
  select b.id, b.title, b.subtitle, b.author_id, p.full_name as author_name, p.avatar_url as author_avatar,
    coalesce(b.genres[1], '') as genre, b.genres, r.words, r.pages, r.price_credits, r.cover_key,
    coalesce(r.published_at, b.created_at) as published_at,
    public.norm_query(b.title) as title_norm, public.norm_query(p.full_name) as author_norm
  from public.books b
  join public.book_revisions r on r.id = b.current_revision_id
  join public.profiles p on p.id = b.author_id
  where b.status = 'live' and r.price_credits is not null and b.claim_hold_at is null;

create or replace function public._line_status(p_author uuid, p_payable bigint, p_min bigint)
returns table (status public.author_earning_status, held_reason text)
language sql stable security definer set search_path = '' as $$
  select
    case
      when p_payable < p_min then 'carried'::public.author_earning_status
      when a.status::text = 'suspended' then 'held_dispute'
      when held.title is not null then 'held_dispute'
      when coalesce(a.payouts_paused, false) or h.id is not null then 'held_paused'
      when not exists (select 1 from public.author_bank_accounts b
                       where b.author_id = p_author and b.status = 'verified') then 'held_unverified'
      else 'payable'
    end,
    case
      when p_payable < p_min then null
      when a.status::text = 'suspended' then coalesce(a.suspended_reason, 'Author suspended')
      when held.title is not null then 'Claim open on ' || held.title
      when coalesce(a.payouts_paused, false) or h.id is not null
        then coalesce(h.reason, a.payouts_paused_reason, 'Payouts paused')
      when not exists (select 1 from public.author_bank_accounts b
                       where b.author_id = p_author and b.status = 'verified') then 'Bank account not verified'
    end
  from (select 1) one
  left join public.author_profiles a on a.user_id = p_author
  left join public.payout_holds h on h.author_id = p_author and h.lifted_at is null
  left join lateral (select bk.title from public.books bk
                     where bk.author_id = p_author and bk.claim_hold_at is not null
                     order by bk.claim_hold_at limit 1) held on true
$$;
