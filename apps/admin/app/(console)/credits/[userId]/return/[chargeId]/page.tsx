import { notFound } from 'next/navigation';
import { ledgerStamp } from '@arpedia/core';
import { guard } from '@/lib/money';
import { serverSupabase } from '@/lib/supabase/server';
import { LedgerScreen } from '../../ledger';
import { ReturnModal } from './client';

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

/** s-unlock-return, drawn over the reader's ledger: give back a pay as you read chapter charge. */
export default async function ReturnPage({ params }: { params: Promise<{ userId: string; chargeId: string }> }) {
  const { userId, chargeId } = await params;
  const { denied } = await guard('credits', 'Credits');
  if (denied) return denied;
  const id = Number(chargeId);
  if (!Number.isInteger(id)) notFound();

  const supabase = await serverSupabase();
  const { data: charge } = await supabase
    .from('credit_ledger')
    .select('id, user_id, reason, delta, txn_id, created_at, book_id, chapter_id, author_id')
    .eq('id', id)
    .maybeSingle();
  if (!charge || charge.user_id !== userId || charge.reason !== 'chapter' || charge.delta >= 0) notFound();

  const [rows, profile, book, chapter, author, rules] = await Promise.all([
    supabase.from('credit_ledger').select('id, delta').eq('txn_id', charge.txn_id).eq('reason', 'chapter').lt('delta', 0),
    supabase.from('profiles').select('full_name, username').eq('id', userId).maybeSingle(),
    charge.book_id ? supabase.from('books').select('title').eq('id', charge.book_id).maybeSingle() : { data: null },
    charge.chapter_id ? supabase.from('chapters').select('title').eq('id', charge.chapter_id).maybeSingle() : { data: null },
    charge.author_id ? supabase.from('profiles').select('full_name').eq('id', charge.author_id).maybeSingle() : { data: null },
    supabase
      .from('pricing_rule_versions')
      .select('rules')
      .lte('effective_at', new Date().toISOString())
      .order('effective_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const chargeIds = (rows.data ?? []).map(r => r.id);
  const credits = (rows.data ?? []).reduce((n, r) => n - r.delta, 0);
  const { count: undone } = chargeIds.length
    ? await supabase.from('credit_ledger').select('id', { count: 'exact', head: true }).eq('reason', 'undo').in('ref_ledger_id', chargeIds)
    : { count: 0 };

  const minutes = Number((rules.data?.rules as { undo_minutes?: number } | null)?.undo_minutes ?? 10);
  const windowEnds = new Date(charge.created_at).getTime() + minutes * 60_000;
  const name = profile.data?.full_name || (profile.data?.username ? `@${profile.data.username}` : 'the reader');

  return (
    <>
      <LedgerScreen userId={userId} />
      <ReturnModal
        userId={userId}
        chargeId={id}
        name={name}
        what={[book.data?.title, chapter.data?.title].filter(Boolean).join(', ') || 'A chapter'}
        chargedAt={ledgerStamp(charge.created_at).replace(/^Today/, 'today')}
        credits={credits}
        windowEnd={clock(windowEnds)}
        windowOpen={Date.now() < windowEnds}
        returned={(undone ?? 0) > 0}
        author={author.data?.full_name ?? 'The author'}
      />
    </>
  );
}
