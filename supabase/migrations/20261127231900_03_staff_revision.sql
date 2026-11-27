-- Spec check 03-16 (flow 03 admin rule 1, flow 12 rule 41): on the book detail, staff "Edit details"
-- and "Replace cover" create a new revision. Readers keep the live revision until it is published.
--
-- The book text is unchanged, so the new revision reuses the live revision's sealed files: it copies
-- the chapters (same chapter_uid, prices and file paths), the active chapter keys and the paragraph
-- anchors, and points at the same artefact prefix and manifest (sealed prefixes are never rewritten:
-- a reseal writes a new books/{rev}/g{n}/ prefix). The api Worker first copies the working copy (for
-- the review preview and staff fixes) and checks a new cover, both under the new revision's id, then
-- calls staff_revise_book, which creates the revision, records the diff (details or cover changed,
-- so never the fast lane) and routes it to review in one transaction (rule 41: "still go through
-- checks"). Nothing is written before the cover has arrived, so an abandoned edit leaves no row.

-- What staff changed: {fields: [...], cover: bool}. Null for author and desk revisions. The staff
-- note stays in audit_log only (authors can read their own revisions).
alter table public.book_revisions add column staff_edit jsonb;

-- Worker (service role) for a Publisher (p_actor). p_rev: the id the Worker chose (the working copy
-- and a new cover are already under it). p_meta: any of title, subtitle, description, genres,
-- content_notes, age, language. p_cover: {sha256, flags: [{check_key, message}]} for a new cover at
-- src/{p_rev}/cover, or null.
create function public.staff_revise_book(p_rev uuid, p_book uuid, p_meta jsonb, p_cover jsonb default null,
                                         p_note text default null, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_book public.books;
  v_base public.book_revisions;
  v_meta jsonb;
  v_cur jsonb;
  v_fields text[];
  v_cover boolean := p_cover is not null;
  v_rev public.book_revisions;
  v_status public.revision_status;
begin
  perform public._require_service('staff_revise_book');
  v_uid := public._actor(p_actor, array['publisher']::public.staff_role[], 'staff_revise_book');
  select * into v_book from public.books where id = p_book for update;
  if not found then
    raise exception 'staff_revise_book: book not found' using errcode = 'no_data_found';
  end if;
  if v_book.current_revision_id is null or v_book.status <> 'live' then
    raise exception 'staff_revise_book: only a live book can be edited here' using errcode = 'check_violation';
  end if;
  select * into v_base from public.book_revisions where id = v_book.current_revision_id;
  if v_base.artifact_prefix is null or v_base.manifest_key is null then
    raise exception 'staff_revise_book: the live revision has no sealed files' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.book_revisions
             where book_id = p_book
               and status in ('draft', 'processing', 'with_desk', 'needs_fixes', 'ready_for_review', 'scheduled')) then
    raise exception 'staff_revise_book: another revision of this book is open' using errcode = 'unique_violation';
  end if;
  if v_cover and nullif(p_cover ->> 'sha256', '') is null then
    raise exception 'staff_revise_book: the new cover has not arrived' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}') into v_meta
  from jsonb_each(coalesce(p_meta, '{}'))
  where key in ('title', 'subtitle', 'description', 'genres', 'content_notes', 'age', 'language');
  if v_meta ? 'title' and nullif(trim(v_meta ->> 'title'), '') is null then
    raise exception 'staff_revise_book: title required' using errcode = 'invalid_parameter_value';
  end if;
  -- Publishing keeps the old genres for an empty list, so an empty list would never take effect.
  if v_meta ? 'genres' and jsonb_array_length(coalesce(v_meta -> 'genres', '[]')) = 0 then
    raise exception 'staff_revise_book: pick at least one genre' using errcode = 'invalid_parameter_value';
  end if;
  if v_meta ? 'title' then
    v_meta := v_meta || jsonb_build_object('title', trim(v_meta ->> 'title'));
  end if;

  -- What readers see now, to tell which fields really change.
  v_cur := jsonb_build_object(
    'title', v_book.title, 'subtitle', v_book.subtitle, 'description', v_book.description,
    'genres', to_jsonb(coalesce(v_book.genres, '{}')), 'content_notes', to_jsonb(coalesce(v_base.content_notes, '{}')),
    'age', v_base.age_rating, 'language', v_base.language);
  select coalesce(array_agg(key order by key), '{}') into v_fields
  from jsonb_each(v_meta)
  where value is distinct from coalesce(v_cur -> key, 'null'::jsonb);
  if cardinality(v_fields) = 0 and not v_cover then
    raise exception 'staff_revise_book: nothing changed' using errcode = 'invalid_parameter_value';
  end if;

  -- The new revision: the live one's files and counts, with its own identity and pipeline state.
  insert into public.book_revisions
  select (jsonb_populate_record(null::public.book_revisions, to_jsonb(v_base) || jsonb_build_object(
    'id', p_rev,
    'revision_no', (select max(revision_no) from public.book_revisions where book_id = p_book) + 1,
    'status', 'processing', 'draft_step', null, 'uploaded_by', v_uid, 'created_via', 'staff',
    'base_revision_id', v_base.id,
    'meta', coalesce(v_base.meta, '{}') || v_meta,
    'content_notes', coalesce(v_meta -> 'content_notes', to_jsonb(coalesce(v_base.content_notes, '{}'))),
    'age_rating', case when v_meta ? 'age' then v_meta ->> 'age' else v_base.age_rating end,
    'language', case when v_meta ? 'language' then v_meta ->> 'language' else v_base.language end,
    'cover_key', case when v_cover then format('src/%s/cover', p_rev) else v_base.cover_key end,
    'cover_sha256', case when v_cover then p_cover ->> 'sha256' else v_base.cover_sha256 end,
    'work_version', coalesce(v_base.sealed_work_version, v_base.work_version),
    'sealed_work_version', coalesce(v_base.sealed_work_version, v_base.work_version),
    'staff_edit', jsonb_build_object('fields', to_jsonb(v_fields), 'cover', v_cover),
    'steps', (select jsonb_object_agg(s, now())
              from unnest(array['received', 'converted', 'chapters_found', 'checks', 'author_confirms']) s),
    'readiness', 0, 'fast_lane', false, 'published_at', null, 'published_by', null, 'schedule_at', null,
    'submitted_at', now(), 'chapters_confirmed_at', now(), 'assigned_to', null, 'last_activity_at', null,
    'review_opened_at', null, 'routed_at', null, 'due_at', null, 'late_alerted_at', null,
    'desk_claimed_by', null, 'desk_lease_until', null, 'desk_reason', null, 'sent_back_note', null,
    'status_reason', null, 'anchors_moved', null, 'created_at', now(), 'updated_at', now()))).*
  returning * into v_rev;

  insert into public.chapters
  select (jsonb_populate_record(null::public.chapters,
            to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'revision_id', p_rev))).*
  from public.chapters c where c.revision_id = v_base.id;
  insert into public.chapter_keys (revision_id, chapter_uid, wrapped_key, key_version, generation)
  select p_rev, k.chapter_uid, k.wrapped_key, k.key_version, k.generation
  from public.chapter_keys k where k.revision_id = v_base.id and k.revoked_at is null;
  insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint, words, words_before)
  select p_rev, a.para_id, a.chapter_uid, a.ord, a.fingerprint, a.words, a.words_before
  from public.paragraph_anchors a where a.revision_id = v_base.id;

  if v_cover then
    perform public._insert_flags(p_rev, p_cover -> 'flags', 'worker');
  end if;
  insert into public.revision_diffs (revision_id, base_revision_id, cover_changed, metadata_changed,
                                     author_in_good_standing)
  values (p_rev, v_base.id, v_cover and (p_cover ->> 'sha256') is distinct from v_base.cover_sha256,
          cardinality(v_fields) > 0, public.author_in_good_standing(v_book.author_id));
  update public.revision_diffs set reasons = public._fast_lane_check(p_rev), fast_lane_eligible = false
   where revision_id = p_rev;
  v_status := public._route(p_rev);

  perform public._audit(v_uid, 'books', 'book.staff_edit', 'book_revision', p_rev::text, v_book.title,
    format('Saved revision %s: %s', v_rev.revision_no,
           array_to_string(v_fields || case when v_cover then array['cover'] else '{}'::text[] end, ', ')),
    null, jsonb_build_object('book_id', p_book, 'base_revision_id', v_base.id, 'fields', v_fields,
                             'cover', v_cover, 'status', v_status),
    nullif(trim(p_note), ''));

  return jsonb_build_object('book_id', p_book, 'revision_id', p_rev, 'revision_no', v_rev.revision_no,
                            'status', v_status);
end $$;

revoke all on function public.staff_revise_book(uuid, uuid, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.staff_revise_book(uuid, uuid, jsonb, jsonb, text, uuid) to service_role;
