-- Spec check 03-16 (flow 03 admin rule 1, flow 12 rule 41): on the book detail, staff "Edit details"
-- and "Replace cover" create a new revision. Readers keep the live revision until it is published.
--
-- The book text is unchanged, so the new revision reuses the live revision's sealed files: it copies
-- the chapters (same chapter_uid, prices and file paths), the active chapter keys and the paragraph
-- anchors, and points at the same artefact prefix and manifest (sealed prefixes are never rewritten:
-- a reseal writes a new books/{rev}/g{n}/ prefix). The api Worker copies the working copy to the new
-- revision (for the review preview and staff fixes) and checks a new cover, then
-- complete_staff_revision records the diff (metadata or cover changed, so never the fast lane) and
-- routes it to Ready for review like any other revision (rule 41: "still go through checks").

-- What staff changed: {fields: [...], cover: bool, note}. Null for author and desk revisions.
alter table public.book_revisions add column staff_edit jsonb;

-- Start a staff edit of a live book. Publisher role (Super admin passes).
-- p_meta: any of title, subtitle, description, genres, content_notes, age, language.
-- p_cover: a new cover follows; the result carries the key to upload it to.
create function public.staff_revise_book(p_book uuid, p_meta jsonb, p_cover boolean default false,
                                         p_note text default null, p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._actor(p_actor, array['publisher']::public.staff_role[], 'staff_revise_book');
  v_book public.books;
  v_base public.book_revisions;
  v_meta jsonb;
  v_cur jsonb;
  v_fields text[];
  v_id uuid := gen_random_uuid();
  v_rev public.book_revisions;
begin
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

  -- An unfinished staff edit (its cover never arrived) is only a copy: drop it.
  delete from public.book_revisions
   where book_id = p_book and status = 'draft' and staff_edit is not null;
  if exists (select 1 from public.book_revisions
             where book_id = p_book
               and status in ('draft', 'processing', 'with_desk', 'needs_fixes', 'ready_for_review', 'scheduled')) then
    raise exception 'staff_revise_book: another revision of this book is open' using errcode = 'unique_violation';
  end if;

  select coalesce(jsonb_object_agg(key, value), '{}') into v_meta
  from jsonb_each(coalesce(p_meta, '{}'))
  where key in ('title', 'subtitle', 'description', 'genres', 'content_notes', 'age', 'language');
  if v_meta ? 'title' and nullif(trim(v_meta ->> 'title'), '') is null then
    raise exception 'staff_revise_book: title required' using errcode = 'invalid_parameter_value';
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
  if cardinality(v_fields) = 0 and not coalesce(p_cover, false) then
    raise exception 'staff_revise_book: nothing changed' using errcode = 'invalid_parameter_value';
  end if;

  -- The new revision: the live one's files and counts, with its own identity and pipeline state.
  insert into public.book_revisions
  select (jsonb_populate_record(null::public.book_revisions, to_jsonb(v_base) || jsonb_build_object(
    'id', v_id,
    'revision_no', (select max(revision_no) from public.book_revisions where book_id = p_book) + 1,
    'status', 'draft', 'draft_step', 'upload', 'uploaded_by', v_uid, 'created_via', 'staff',
    'base_revision_id', v_base.id,
    'meta', coalesce(v_base.meta, '{}') || v_meta,
    'content_notes', coalesce(v_meta -> 'content_notes', to_jsonb(coalesce(v_base.content_notes, '{}'))),
    'age_rating', case when v_meta ? 'age' then v_meta ->> 'age' else v_base.age_rating end,
    'language', case when v_meta ? 'language' then v_meta ->> 'language' else v_base.language end,
    'cover_key', case when p_cover then format('src/%s/cover', v_id) else v_base.cover_key end,
    'cover_sha256', case when p_cover then null else v_base.cover_sha256 end,
    'work_version', coalesce(v_base.sealed_work_version, v_base.work_version),
    'sealed_work_version', coalesce(v_base.sealed_work_version, v_base.work_version),
    'staff_edit', jsonb_build_object('fields', to_jsonb(v_fields), 'cover', coalesce(p_cover, false),
                                     'note', nullif(trim(p_note), '')),
    'steps', jsonb_build_object('received', now()),
    'readiness', 0, 'fast_lane', false, 'published_at', null, 'published_by', null, 'schedule_at', null,
    'submitted_at', null, 'assigned_to', null, 'last_activity_at', null, 'review_opened_at', null,
    'routed_at', null, 'due_at', null, 'late_alerted_at', null, 'desk_claimed_by', null,
    'desk_lease_until', null, 'desk_reason', null, 'sent_back_note', null, 'status_reason', null,
    'anchors_moved', null, 'created_at', now(), 'updated_at', now()))).*
  returning * into v_rev;

  insert into public.chapters
  select (jsonb_populate_record(null::public.chapters,
            to_jsonb(c) || jsonb_build_object('id', gen_random_uuid(), 'revision_id', v_id))).*
  from public.chapters c where c.revision_id = v_base.id;
  insert into public.chapter_keys (revision_id, chapter_uid, wrapped_key, key_version, generation)
  select v_id, k.chapter_uid, k.wrapped_key, k.key_version, k.generation
  from public.chapter_keys k where k.revision_id = v_base.id and k.revoked_at is null;
  insert into public.paragraph_anchors (revision_id, para_id, chapter_uid, ord, fingerprint, words, words_before)
  select v_id, a.para_id, a.chapter_uid, a.ord, a.fingerprint, a.words, a.words_before
  from public.paragraph_anchors a where a.revision_id = v_base.id;

  perform public._audit(v_uid, 'books', 'book.staff_edit', 'book_revision', v_id::text, v_book.title,
    format('Started revision %s: %s', v_rev.revision_no,
           array_to_string(v_fields || case when p_cover then array['cover'] else '{}'::text[] end, ', ')),
    null, jsonb_build_object('book_id', p_book, 'base_revision_id', v_base.id, 'fields', v_fields,
                             'cover', coalesce(p_cover, false)),
    nullif(trim(p_note), ''));

  return jsonb_build_object('book_id', p_book, 'revision_id', v_id, 'revision_no', v_rev.revision_no,
                            'base_revision_id', v_base.id, 'work_version', v_rev.work_version,
                            'cover_key', case when p_cover then v_rev.cover_key end);
end $$;

-- Worker: the working copy is copied and any new cover checked; route the staff edit to review.
-- p_cover: {sha256, flags: [{check_key, message}]} when the edit replaces the cover.
create function public.complete_staff_revision(p_rev uuid, p_actor uuid, p_cover jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  v_author uuid;
  v_status public.revision_status;
  v_cover boolean;
begin
  perform public._require_service('complete_staff_revision');
  v_rev := public._lock_revision(p_rev);
  if v_rev.staff_edit is null then
    raise exception 'complete_staff_revision: not a staff edit' using errcode = 'check_violation';
  end if;
  if v_rev.status <> 'draft' then
    return jsonb_build_object('status', v_rev.status, 'duplicate', true);
  end if;
  if p_actor is distinct from v_rev.uploaded_by then
    raise exception 'complete_staff_revision: not your edit' using errcode = 'insufficient_privilege';
  end if;
  v_cover := coalesce((v_rev.staff_edit ->> 'cover')::boolean, false);
  if v_cover and nullif(p_cover ->> 'sha256', '') is null then
    raise exception 'complete_staff_revision: the new cover has not arrived' using errcode = 'invalid_parameter_value';
  end if;

  if v_cover then
    update public.book_revisions set cover_sha256 = p_cover ->> 'sha256' where id = p_rev;
    perform public._insert_flags(p_rev, p_cover -> 'flags', 'worker');
  end if;
  select author_id into v_author from public.books where id = v_rev.book_id;
  insert into public.revision_diffs (revision_id, base_revision_id, cover_changed, metadata_changed,
                                     author_in_good_standing)
  values (p_rev, v_rev.base_revision_id,
          v_cover and (p_cover ->> 'sha256') is distinct from
            (select cover_sha256 from public.book_revisions where id = v_rev.base_revision_id),
          jsonb_array_length(coalesce(v_rev.staff_edit -> 'fields', '[]')) > 0,
          public.author_in_good_standing(v_author))
  on conflict (revision_id) do nothing;
  update public.revision_diffs set reasons = public._fast_lane_check(p_rev), fast_lane_eligible = false
   where revision_id = p_rev;

  update public.book_revisions set draft_step = null, submitted_at = now(), chapters_confirmed_at = now()
   where id = p_rev;
  perform public._step(p_rev, 'converted');
  perform public._step(p_rev, 'chapters_found');
  perform public._step(p_rev, 'checks');
  perform public._step(p_rev, 'author_confirms');
  v_status := public._route(p_rev);
  return jsonb_build_object('status', v_status, 'revision_id', p_rev);
end $$;

revoke all on function public.staff_revise_book(uuid, jsonb, boolean, text, uuid) from public, anon;
revoke all on function public.complete_staff_revision(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.staff_revise_book(uuid, jsonb, boolean, text, uuid) to authenticated, service_role;
grant execute on function public.complete_staff_revision(uuid, uuid, jsonb) to service_role;
