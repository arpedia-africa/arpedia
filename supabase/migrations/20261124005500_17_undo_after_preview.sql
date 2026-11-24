-- Flow 17 whole-app check (pay-as-you-read journey): Undo was refused as "already read" for the chapter
-- that holds the free preview cut, because the words read for free before the cut counted toward the
-- 20% anti-abuse limit (flow 04 rule 59). In a 4,000-word chapter cut a fifth of the way in, every
-- undo was refused. Count only the words read past the free part. Otherwise unchanged from flow 04.
create or replace function public._undo_chapter(p_user uuid, p_ledger bigint, p_key text, p_staff boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'u:' || p_user || ':' || p_key;
  v_free_before int;
  l public.credit_ledger;
  v_prior public.credit_ledger;
  c public.chapters;
  p public.reading_progress;
  v_read int;
  v_txn uuid := gen_random_uuid();
  v_balance int;
  v_first bigint;
  v_id bigint;
  v_refund int := 0;
  x record;
begin
  if p_key is null or length(p_key) < 8 or length(p_key) > 100 then
    perform public._raise('bad_key');
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select * into v_prior from public.credit_ledger where idempotency_key = v_key;
  if found then
    if v_prior.reason <> 'undo' then
      perform public._raise('key_reused');
    end if;
    return jsonb_build_object('status', 'undone', 'refunded',
      (select sum(delta) from public.credit_ledger where txn_id = v_prior.txn_id),
      'balance', public._balance(p_user), 'chapter_uid', v_prior.chapter_uid, 'replayed', true);
  end if;

  select * into l from public.credit_ledger where id = p_ledger and user_id = p_user and reason = 'chapter';
  if not found then
    perform public._raise('not_found');
  end if;
  if exists (select 1 from public.credit_ledger u join public.credit_ledger o on o.id = u.ref_ledger_id
             where o.txn_id = l.txn_id) then
    perform public._raise('already_undone');
  end if;
  if not p_staff and l.created_at < now() - interval '10 minutes' then
    perform public._raise('undo_expired');
  end if;
  -- Unlock all or Pay the rest since: the book entitlement already covers this chapter.
  if exists (select 1 from public.entitlements where user_id = p_user and book_id = l.book_id
               and scope = 'book' and revoked_at is null) then
    perform public._raise('book_unlocked');
  end if;

  if not p_staff then
    -- Anti-abuse: refused once the reader has read more than 20% of the chapter (by words) or moved past it.
    select ch.* into c from public.chapters ch
    join public.books b on b.current_revision_id = ch.revision_id
    where b.id = l.book_id and ch.chapter_uid = l.chapter_uid;
    select * into p from public.reading_progress where user_id = p_user and book_id = l.book_id;
    if p.user_id is not null and c.chapter_uid is not null then
      if p.max_chapter_ord > c.ord then
        perform public._raise('already_read');
      end if;
      if p.chapter_uid = c.chapter_uid then
        -- Where the paid part starts: the preview cut when it falls in this chapter, else its start.
        select greatest(c.words_before, coalesce(a.words_before, c.words_before)) into v_free_before
        from public.book_revisions r
        left join public.paragraph_anchors a on a.revision_id = r.id and a.para_id = r.preview_cut_para_id
        where r.id = c.revision_id and r.preview_cut_chapter_uid = c.chapter_uid;
        select a.words_before - coalesce(v_free_before, c.words_before) into v_read
        from public.paragraph_anchors a where a.revision_id = c.revision_id and a.para_id = p.para_id;
        if coalesce(v_read, 0) > c.words * 0.2 then
          perform public._raise('already_read');
        end if;
      end if;
    end if;
  end if;

  v_balance := public._balance(p_user);
  for x in select * from public.credit_ledger where txn_id = l.txn_id order by id loop
    v_balance := v_balance - x.delta;
    v_refund := v_refund - x.delta;
    insert into public.credit_ledger (user_id, delta, reason, bucket, expires_at, txn_id, ref_type, ref_id,
      idempotency_key, book_id, chapter_uid, author_id, author_earning_kobo, balance_after, ref_ledger_id, meta)
    values (p_user, -x.delta, 'undo', x.bucket, x.expires_at, v_txn, 'ledger', x.id::text,
      case when v_first is null then v_key else v_key || '#' || x.bucket end,
      x.book_id, x.chapter_uid, x.author_id, -x.author_earning_kobo, v_balance, x.id,
      jsonb_build_object('staff', p_staff))
    returning id into v_id;
    v_first := coalesce(v_first, v_id);
  end loop;

  update public.entitlements set revoked_at = now(), revoked_reason = 'undo'
  where user_id = p_user and book_id = l.book_id and scope = 'chapter' and chapter_uid = l.chapter_uid
    and revoked_at is null;

  return jsonb_build_object('status', 'undone', 'refunded', v_refund, 'balance', v_balance,
    'chapter_uid', l.chapter_uid, 'ledger_id', v_first, 'replayed', false);
end $$;
