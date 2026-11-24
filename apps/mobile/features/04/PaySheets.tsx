// s-pay-rest and s-reader-chapter-low as sheets in the reader. Money moves only in unlock_book
// (flow 03); these sheets never compute a charge, they show what get_reader_state just read.
import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useMutation } from '@tanstack/react-query';
import { LAUNCH_PLANS, TOPUP_PACKS, pickTopupPack, type TopupPack } from '@arpedia/core';
import { Sheet } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { rpcError } from '../03/UnlockSheet';
import { ChapterLowBody, PayRestBody } from './PayViews';
import type { ReaderState } from './state';
import { chapterNumber } from './useReader';
import { useAskPush } from '../15/push';

const n = (v: number) => v.toLocaleString('en-NG');
const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long' });

/** "chapters 5 to 14" / "chapter 5" from chapter numbers. */
function range(nums: number[]) {
  if (nums.length === 0) return null;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return lo === hi ? `chapter ${lo}` : `chapters ${lo} to ${hi}`;
}

export function PayRestSheet({
  st,
  open,
  onClose,
  onPaid,
  onShort,
}: {
  st: ReaderState;
  open: boolean;
  onClose: () => void;
  /** After a successful charge: fetch every key, redraw, toast. */
  onPaid: (r: { balance: number; spent: number; status: string }) => void;
  /** Not enough credits for the rest. */
  onShort: () => void;
}) {
  // One idempotency key per opening, reused for every retry of the same tap (flow 03 rule 19).
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setKey(Crypto.randomUUID());
    setError(null);
  }, [open]);

  const chargeable = st.chapters.filter((c) => c.kind === 'chapter' && c.price_credits > 0);
  const paidNums = chargeable
    .filter((c) => c.access === 'unlocked')
    .map((c) => chapterNumber(st, c.chapter_uid));
  const leftNums = chargeable
    .filter((c) => c.access !== 'unlocked')
    .map((c) => chapterNumber(st, c.chapter_uid));
  const paidRange = range(paidNums);
  const leftRange = range(leftNums);

  const askPush = useAskPush();
  const pay = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.rpc('unlock_book', {
        p_book: st.book.id,
        p_expected_price: st.price,
        p_key: key,
      });
      if (e) throw e;
      return data as { balance: number; spent: number; status: string };
    },
    onSuccess: (r) => {
      askPush('unlock');
      onPaid(r);
    },
    onError: (e) => {
      const { code, detail } = rpcError(e);
      if (code === 'network') return setError('No connection. Nothing was charged. Try again.');
      if (code === 'signed_out')
        return setError('You’re signed out. Sign in again, then try. Nothing was charged.');
      setKey(Crypto.randomUUID());
      if (code === 'insufficient_credits') return onShort();
      if (code === 'price_changed')
        return setError(`The price changed to ${n(detail.price ?? st.price)} credits.`);
      if (code === 'rate_limited') return setError('That’s a lot of taps. Wait a minute, then try again.');
      setError('Something went wrong. Nothing was charged. Try again.');
    },
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      locked={pay.isPending}
      bold
      title="Pay the rest"
      sub={leftRange ? `${st.book.title} · ${leftRange}` : st.book.title}
    >
      <PayRestBody
        price={st.price}
        paid={st.paid_credits}
        paidLabel={paidRange ? `Already paid · ${paidRange}` : 'Already paid'}
        left={st.remaining}
        busy={pay.isPending}
        error={error}
        onPay={() => pay.mutate()}
      />
    </Sheet>
  );
}

export function ChapterLowSheet({
  st,
  chapterUid,
  onClose,
  onTopUp,
  onLibrary,
}: {
  st: ReaderState;
  /** The chapter the balance can't cover; null keeps the sheet closed. */
  chapterUid: string | null;
  onClose: () => void;
  onTopUp: (p: TopupPack) => void;
  onLibrary: () => void;
}) {
  const ch = chapterUid ? st.chapters.find((c) => c.chapter_uid === chapterUid) : null;
  const no = ch ? chapterNumber(st, ch.chapter_uid) : 0;
  const price = ch?.price_credits ?? 0;
  const { pack: preset } = pickTopupPack(Math.max(0, price - st.balance));
  const [pack, setPack] = useState<TopupPack>(preset);
  useEffect(() => setPack(preset), [preset]);

  const planCredits = LAUNCH_PLANS.find((p) => p.id === st.plan.plan_code)?.credits;
  const renews = st.plan.period_end ? DATE.format(new Date(st.plan.period_end)) : null;
  const copy = [
    `Your place is saved. Top up and you'll be back on page 1 of Chapter ${no}.`,
    planCredits && renews ? `Your plan adds ${n(planCredits)} credits on ${renews}.` : null,
  ]
    .filter(Boolean)
    .join(' ');
  const presetSub =
    preset.credits >= st.remaining
      ? 'The rest of this book and more'
      : preset.credits >= price
        ? 'Enough for this chapter'
        : `≈ ${Math.max(1, Math.floor(preset.credits / Math.max(1, price)))} chapters`;

  return (
    <Sheet
      open={ch != null}
      onClose={onClose}
      bold
      title={`Not enough credits for Chapter ${no}`}
      sub={`You have ${n(st.balance)} credits · this chapter is ${n(price)}`}
    >
      <ChapterLowBody
        copy={copy}
        packs={TOPUP_PACKS}
        selected={pack}
        presetSub={{ credits: preset.credits, sub: presetSub }}
        onSelect={setPack}
        onTopUp={() => onTopUp(pack)}
        onLibrary={onLibrary}
      />
    </Sheet>
  );
}
