-- Flow 12 · spec check 12-16 (Analytics). The pipeline's server events reach PostHog through the
-- flow 15 outbox (`_track`, sent each minute by the api Worker). Phone-side events
-- (book_upload_started, convert_completed, convert_drift) stay with the app.
--   book_revisions: convert_failed {reason}, verify_completed {ms, score, flags}, routed {to},
--     desk_job {reason, wait_h}, readiness_changed {from, to}, quick_review_decision {decision,
--     minutes}, book_published {mode: manual|scheduled|fast_lane}, anchors_moved {n}
--   send_backs: send_back {source, issues} · book_fixes: fix_applied {op}
--   fast_lane_audits: fast_lane_audit {result} · revision_diffs: revision_diff {changed_pct}
-- distinct_id is the staff member who acted when there is one, else the book's author. Properties
-- hold only counts, times, keys and decisions (no book text, no reader data).

create function public._book_author(p_rev uuid) returns text
language sql stable security definer set search_path = '' as $$
  select b.author_id::text from public.book_revisions r join public.books b on b.id = r.book_id where r.id = p_rev
$$;

create function public._revision_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_who text := coalesce(auth.uid()::text, public._book_author(new.id));
  v_author text := public._book_author(new.id);
  v_start timestamptz;
begin
  -- The Worker could not verify the file: to the desk, or back to the author when unreadable.
  if old.status = 'processing' and old.draft_step = 'checking' and new.status in ('with_desk', 'sent_back') then
    perform public._track('convert_failed', v_author, jsonb_build_object(
      'reason', case when new.status = 'with_desk' then coalesce(new.desk_reason, 'worker_failed') else 'unreadable' end));
  end if;
  if old.status = 'processing' and old.draft_step = 'checking' and new.status = 'draft' then
    v_start := coalesce((new.steps ->> 'converted')::timestamptz, (new.steps ->> 'received')::timestamptz);
    perform public._track('verify_completed', v_author, jsonb_build_object(
      'ms', case when v_start is not null and new.steps ? 'checks'
                 then round(extract(epoch from (new.steps ->> 'checks')::timestamptz - v_start) * 1000) end,
      'score', new.readiness,
      'flags', (select count(*) from public.book_flags f where f.revision_id = new.id and f.status = 'open')));
  end if;
  if new.routed_at is distinct from old.routed_at and new.routed_at is not null then
    perform public._track('routed', v_who, jsonb_build_object('to', new.status));
  end if;
  if old.status = 'with_desk' and new.status <> 'with_desk' then
    -- Entered the desk desk_days before it was due.
    perform public._track('desk_job', v_who, jsonb_build_object('reason', old.desk_reason,
      'wait_h', case when old.due_at is not null then round(extract(epoch from now()
        - (old.due_at - make_interval(days => public._threshold('desk_days')::int))) / 3600.0, 1) end));
  end if;
  if new.readiness is distinct from old.readiness then
    perform public._track('readiness_changed', v_who, jsonb_build_object('from', old.readiness, 'to', new.readiness));
  end if;
  if old.status = 'ready_for_review' and new.status in ('scheduled', 'live', 'needs_fixes', 'sent_back', 'rejected') then
    perform public._track('quick_review_decision', v_who, jsonb_build_object(
      'decision', case new.status when 'scheduled' then 'approve' when 'live' then 'approve'
                    when 'sent_back' then 'send_back' when 'rejected' then 'reject' else 'needs_fixes' end,
      'minutes', round(extract(epoch from now() - coalesce(old.review_opened_at, old.routed_at, now())) / 60.0, 1)));
  end if;
  if new.published_at is not null and old.published_at is null then
    perform public._track('book_published', v_who, jsonb_build_object(
      'mode', case when new.fast_lane then 'fast_lane' when old.status = 'scheduled' then 'scheduled' else 'manual' end));
  end if;
  if new.anchors_moved is distinct from old.anchors_moved and new.anchors_moved is not null then
    perform public._track('anchors_moved', v_who, jsonb_build_object('n',
      coalesce((new.anchors_moved ->> 'highlights')::int, 0) + coalesce((new.anchors_moved ->> 'comments')::int, 0)));
  end if;
  return null;
end $$;
create trigger book_revisions_analytics after update on public.book_revisions
  for each row execute function public._revision_events();

create function public._send_back_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._track('send_back', coalesce(new.sent_by::text, public._book_author(new.revision_id)),
    jsonb_build_object('source', new.source, 'issues', jsonb_array_length(new.issues)));
  return null;
end $$;
create trigger send_backs_analytics after insert on public.send_backs
  for each row execute function public._send_back_event();

create function public._fix_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._track('fix_applied', coalesce(new.staff_id::text, auth.uid()::text, public._book_author(new.revision_id)),
    jsonb_build_object('op', new.op ->> 'op'));
  return null;
end $$;
create trigger book_fixes_analytics after insert on public.book_fixes
  for each row execute function public._fix_event();

create function public._fast_lane_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'pending' and new.status is distinct from old.status then
    perform public._track('fast_lane_audit', coalesce(new.audited_by::text, auth.uid()::text, 'system'),
      jsonb_build_object('result', new.status));
  end if;
  return null;
end $$;
create trigger fast_lane_audits_analytics after update on public.fast_lane_audits
  for each row execute function public._fast_lane_event();

create function public._revision_diff_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.changed_pct is distinct from old.changed_pct then
    perform public._track('revision_diff', public._book_author(new.revision_id),
      jsonb_build_object('changed_pct', new.changed_pct));
  end if;
  return null;
end $$;
create trigger revision_diffs_analytics after insert or update on public.revision_diffs
  for each row execute function public._revision_diff_event();

revoke execute on function public._book_author(uuid), public._revision_events(), public._send_back_event(),
  public._fix_event(), public._fast_lane_event(), public._revision_diff_event()
  from public, anon, authenticated, service_role;
