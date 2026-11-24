-- Flow 03 admin rule 2 (spec check 03-15): a preview override goes live only when the rebuild job
-- has sealed the live revision with the new cut. Until then readers keep the old cut, and the
-- percent shown (book_effective) is the one actually sealed, not the override waiting for it.

-- The cut the live files were last rebuilt with (null: the revision's own preview_percent).
alter table public.book_revisions add column live_preview_percent numeric(4, 1);

create or replace view public.book_effective with (security_invoker) as
  select b.id as book_id, b.current_revision_id as revision_id,
         coalesce(b.price_override_credits, r.price_credits) as effective_price,
         coalesce(r.live_preview_percent, r.preview_percent, 10) as effective_preview_percent
  from public.books b
  left join public.book_revisions r on r.id = b.current_revision_id;

-- Worker (previewRebuild): make the rebuilt files live. Applies only while p_rev is still the book's
-- live revision and p_target is still the cut it wants (a newer override queues its own rebuild).
-- Same writes as complete_seal for files and keys; prices are spread over the new paid chapters.
create function public.complete_preview_rebuild(p_rev uuid, p_target numeric, p_seal jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rev public.book_revisions;
  b public.books;
begin
  perform public._require_service('complete_preview_rebuild');
  v_rev := public._lock_revision(p_rev);
  select * into b from public.books where id = v_rev.book_id for update;
  if b.current_revision_id is distinct from p_rev
     or coalesce(b.preview_override_percent, v_rev.preview_percent, 10) <> p_target then
    return jsonb_build_object('applied', false);
  end if;
  if nullif(p_seal ->> 'artifact_prefix', '') is null or nullif(p_seal ->> 'manifest_key', '') is null
     or nullif(p_seal ->> 'preview_cut_para_id', '') is null or (p_seal ->> 'free_through_ord') is null then
    raise exception 'complete_preview_rebuild: artifact, manifest and cut required' using errcode = 'invalid_parameter_value';
  end if;

  update public.chapters c set free_file = s.free_file, full_file = s.full_file
  from jsonb_to_recordset(coalesce(p_seal -> 'chapters', '[]')) as s(chapter_uid uuid, free_file text, full_file text)
  where c.revision_id = p_rev and c.chapter_uid = s.chapter_uid;

  update public.chapter_keys set revoked_at = now() where revision_id = p_rev and revoked_at is null;
  insert into public.chapter_keys (revision_id, chapter_uid, wrapped_key, key_version, generation)
  select p_rev, n.chapter_uid, decode(n.wrapped_key, 'base64'), coalesce(n.key_version, 1), v_rev.generation
  from jsonb_to_recordset(coalesce(p_seal -> 'keys', '[]')) as n(chapter_uid uuid, wrapped_key text, key_version int);

  update public.book_revisions set
    artifact_prefix = p_seal ->> 'artifact_prefix',
    manifest_key = p_seal ->> 'manifest_key',
    preview_cut_para_id = p_seal ->> 'preview_cut_para_id',
    preview_cut_chapter_uid = (p_seal ->> 'preview_cut_chapter_uid')::uuid,
    free_through_ord = (p_seal ->> 'free_through_ord')::int,
    live_preview_percent = case when b.preview_override_percent is null then null
                                else (p_seal ->> 'preview_percent')::numeric end
  where id = p_rev;
  perform public._apply_book_price(p_rev, coalesce(b.price_override_credits, v_rev.price_credits),
                                   p_seal -> 'prices');

  perform public._audit(null, 'books', 'book.preview_rebuilt', 'book', b.id::text, b.title,
    format('Preview now %s%%', p_seal ->> 'preview_percent'), null,
    jsonb_build_object('preview_percent', (p_seal ->> 'preview_percent')::numeric,
                       'free_through_ord', (p_seal ->> 'free_through_ord')::int));
  return jsonb_build_object('applied', true, 'preview_percent', (p_seal ->> 'preview_percent')::numeric);
end $$;

-- A new revision is sealed with the default cut; when the book has an override, rebuild it once live.
create function public._preview_override_on_publish() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.preview_override_percent is not null and new.current_revision_id is not null then
    perform pgmq.send('book_verify', jsonb_build_object('kind', 'preview_rebuild', 'book_id', new.id,
      'revision_id', new.current_revision_id, 'percent', new.preview_override_percent));
  end if;
  return null;
end $$;

create trigger books_preview_override_on_publish
  after update of current_revision_id on public.books
  for each row when (old.current_revision_id is distinct from new.current_revision_id)
  execute function public._preview_override_on_publish();

revoke all on function public.complete_preview_rebuild(uuid, numeric, jsonb),
  public._preview_override_on_publish() from public, anon, authenticated, service_role;
grant execute on function public.complete_preview_rebuild(uuid, numeric, jsonb) to service_role;
