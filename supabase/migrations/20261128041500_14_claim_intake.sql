-- Flow 14 · spec check 14-21 (rules 29 and 30): copyright claims that arrive by email, and the
-- matching-passages hint on the claim page.
--   ingest_claim_email          the Resend inbound webhook (workers/api, POST /v1/trust/support/inbound)
--                               opens a claim when an email to copyright@arpedia.africa names a book
--                               (its id, its arpedia.africa/book/ link or its title in the subject);
--                               otherwise the Worker files it as a support ticket as before.
--   claims_needing_similarity   open claims with no passage check yet, and the working copy to read
--   set_claim_similarity        the Worker's result (packages/core claimSimilarity), once per claim,
--                               with a "Similarity check run" line on the claim's timeline; a failed
--                               check is tried again hourly for a day
-- A follow-up about a book the same address already has an open claim on becomes a support ticket.
-- A claim by email does not hold the book: Ask author does, as for claims from an app report, so an
-- email alone cannot take a book out of Discover.

alter table public.copyright_claims add column source_message_id text unique;

create function public.ingest_claim_email(p_from text, p_name text, p_subject text, p_body text,
                                          p_message_id text, p_type public.claim_type default 'copyright',
                                          p_attachments jsonb default '[]')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_text text := coalesce(p_subject, '') || ' ' || coalesce(p_body, '');
  v_book uuid;
  v_ids uuid[];
  v_claim public.copyright_claims;
begin
  perform public._require_service('ingest_claim_email');
  if coalesce(btrim(p_from), '') = '' then
    raise exception 'ingest_claim_email: no sender' using errcode = '22023';
  end if;

  select * into v_claim from public.copyright_claims where source_message_id = p_message_id;
  if found then
    return jsonb_build_object('claim', v_claim.ref, 'id', v_claim.id, 'duplicate', true);
  end if;

  -- 1. A book id anywhere in the subject or body.
  select b.id into v_book
  from regexp_matches(lower(v_text), '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'g') m
  join public.books b on b.id = m[1]::uuid
  limit 1;

  -- 2. A share link, arpedia.africa/book/<title>-<first 8 characters of the id>, naming one book.
  if v_book is null then
    select array_agg(distinct b.id) into v_ids
    from regexp_matches(lower(v_text), 'arpedia\.africa/book/[a-z0-9-]*?([0-9a-f]{8})(?![a-z0-9-])', 'g') m
    join public.books b on left(b.id::text, 8) = m[1];
    if cardinality(v_ids) = 1 then v_book := v_ids[1]; end if;
  end if;

  -- 3. The subject names one published book's title of two or more words, as whole words (the
  --    longest title wins; a tie names none). One-word titles are found by id or link only.
  if v_book is null and coalesce(btrim(p_subject), '') <> '' then
    select case when count(*) = 1 or max(len) > min(len) filter (where rn = 2) then
             (array_agg(id order by rn))[1] end
    into v_book
    from (
      select b.id, char_length(b.title) len,
             row_number() over (order by char_length(b.title) desc, b.id) rn
      from public.books b
      where b.status in ('live', 'taken_down', 'unpublished')
        and btrim(b.title) ~ '\s'
        and p_subject ~* ('(^|[^[:alnum:]_])' || regexp_replace(btrim(b.title), '([^[:alnum:][:space:]])', '\\\1', 'g')
                      || '($|[^[:alnum:]_])')
      order by char_length(b.title) desc, b.id
      limit 2
    ) t;
  end if;

  if v_book is null then
    return jsonb_build_object('routed', 'ticket');
  end if;

  -- A follow-up from the same address about a book it already has an open claim on goes to the
  -- support inbox (staff link it), so a reply thread never opens a second claim.
  select * into v_claim from public.copyright_claims
  where book_id = v_book and claimant_contact = lower(btrim(p_from)) and status in ('new', 'waiting_on_author')
  limit 1;
  if found then
    return jsonb_build_object('routed', 'ticket', 'open_claim', v_claim.ref);
  end if;

  insert into public.copyright_claims (book_id, claimant_name, claimant_contact, type, details, evidence,
                                       source_message_id)
  values (v_book, coalesce(nullif(left(btrim(p_name), 120), ''), lower(btrim(p_from))), lower(btrim(p_from)),
          coalesce(p_type, 'copyright'), nullif(left(btrim(coalesce(p_body, '')), 4000), ''),
          case when jsonb_typeof(p_attachments) = 'array' then p_attachments else '[]'::jsonb end,
          p_message_id)
  returning * into v_claim;
  return jsonb_build_object('claim', v_claim.ref, 'id', v_claim.id, 'book_id', v_book);
end $$;

-- Open claims with no passage check yet, oldest first, with the book's text to read: the live
-- revision's sealed working copy, else the newest revision's working copy.
create function public.claims_needing_similarity(p_limit int default 5)
returns table (id uuid, details text, evidence jsonb, revision_id uuid, work_version int)
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_service('claims_needing_similarity');
  return query
  select c.id, c.details, c.evidence, r.id, coalesce(r.sealed_work_version, r.work_version)
  from public.copyright_claims c
  join public.books b on b.id = c.book_id
  left join lateral (
    select x.* from public.book_revisions x
    where x.id = b.current_revision_id
       or (b.current_revision_id is null and x.book_id = b.id)
    order by x.revision_no desc limit 1
  ) r on true
  where c.status in ('new', 'waiting_on_author')
    and (c.similarity is null
         or (c.similarity ->> 'failed' = 'true' and (c.similarity ->> 'retry_at')::timestamptz <= now()))
  order by c.created_at
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
end $$;

-- A failed check (no working copy yet, or the Worker could not read it) is tried again every hour
-- for a day; the timeline shows the first failure and the result, never each retry.
create function public.set_claim_similarity(p_claim uuid, p_similarity jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  c public.copyright_claims;
  v_prev jsonb;
  v_failed boolean;
  v_attempts int;
  v_score int;
  v_flagged int;
  v_checked int;
begin
  perform public._require_service('set_claim_similarity');
  if p_similarity is null or jsonb_typeof(p_similarity) <> 'object' then
    raise exception 'set_claim_similarity: bad result' using errcode = '22023';
  end if;
  select similarity into v_prev from public.copyright_claims where id = p_claim for update;
  if not found or (v_prev is not null and v_prev ->> 'failed' is distinct from 'true') then
    return false;
  end if;
  v_failed := coalesce(p_similarity ->> 'failed' = 'true', false);
  if v_failed then
    v_attempts := coalesce((v_prev ->> 'attempts')::int, 0) + 1;
    p_similarity := p_similarity || jsonb_build_object('attempts', v_attempts,
      'retry_at', case when v_attempts < 24 then now() + interval '1 hour' end);
  else
    v_score := case when jsonb_typeof(p_similarity -> 'score') = 'number' then (p_similarity ->> 'score')::numeric::int end;
    v_flagged := case when jsonb_typeof(p_similarity -> 'flagged') = 'number' then (p_similarity ->> 'flagged')::numeric::int end;
    v_checked := case when jsonb_typeof(p_similarity -> 'checked') = 'number' then (p_similarity ->> 'checked')::numeric::int end;
  end if;
  update public.copyright_claims set similarity = p_similarity where id = p_claim returning * into c;
  if not v_failed or v_prev is null then
    perform public._audit(null, 'trust', 'claim.similarity', 'claim', c.id::text, c.ref,
      case
        when v_failed then 'Similarity check could not read the book yet'
        when coalesce(v_checked, 0) = 0 then 'Similarity check: no passage to compare in the claim'
        when coalesce(v_flagged, 0) = 0 then 'Similarity check run: no passage found in the book'
        else format('Similarity check run: %s%% over %s %s', v_score, v_flagged,
                    case when v_flagged = 1 then 'passage' else 'passages' end)
      end,
      null, jsonb_build_object('score', v_score, 'flagged', v_flagged, 'failed', v_failed));
  end if;
  return true;
end $$;

revoke all on function public.ingest_claim_email(text, text, text, text, text, public.claim_type, jsonb),
  public.claims_needing_similarity(int), public.set_claim_similarity(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_claim_email(text, text, text, text, text, public.claim_type, jsonb),
  public.claims_needing_similarity(int), public.set_claim_similarity(uuid, jsonb)
  to service_role;
