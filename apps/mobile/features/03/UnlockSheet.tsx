import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LAUNCH_PLANS,
  TOPUP_PACKS,
  booksCovered,
  chaptersCovered,
  perMonthNaira,
  pickTopupPack,
  previewPages,
  spendSheet,
  type TopupPack,
} from '@arpedia/core';
import { Sheet, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useTrack } from './analytics';
import { bookKey, type BookPageData } from './book';
import { LowBody, NoSubBody, PayGoBody, UnlockAllBody, type UnlockMode } from './UnlockViews';

// s-unlock, s-unlock-paygo, s-unlock-low, s-unlock-nosub: one sheet whose body follows the credit
// checks (rules 13–31). Money moves only in unlock_book; this sheet never computes a charge.

type Variant = UnlockMode | 'low' | 'nosub';

const n = (v: number) => v.toLocaleString('en-NG');
const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long' });

/**
 * Postgres raises `P0001` with the code as the message and JSON detail (03 migration). A fetch
 * failure has no code ('network'); 42501 / PGRST30x is an ended session ('signed_out'); any other
 * server error is 'unknown'.
 */
export function rpcError(e: unknown): { code: string; detail: Record<string, number> } {
  const err = e as { code?: string; message?: string; details?: string };
  if (!err?.code) return { code: 'network', detail: {} };
  if (err.code === '42501' || err.code.startsWith('PGRST30')) return { code: 'signed_out', detail: {} };
  if (err.code !== 'P0001') return { code: 'unknown', detail: {} };
  let detail = {};
  try {
    detail = JSON.parse(err.details ?? '{}');
  } catch {
    // detail is optional
  }
  return { code: err.message ?? 'unknown', detail };
}

/** Which body a tap opens: the confirm sheet when the balance covers it, else low or no-plan (rule 14). */
export function variantFor(d: BookPageData, mode: UnlockMode): Variant {
  const need = mode === 'all' ? (d.paid_credits > 0 ? d.remaining : d.price) : (d.first_unpaid?.price ?? 0);
  const sheet = spendSheet(need, d.balance, d.plan.state);
  return sheet === 'confirm' ? mode : sheet;
}

export interface UnlockSheetProps {
  book: BookPageData;
  /**
   * The option tapped; null keeps the sheet closed. 'short' is a gift or tip the balance doesn't
   * cover: only the not-enough-credits or no-plan body shows, for `need` credits.
   */
  open: UnlockMode | 'short' | null;
  need?: number;
  onClose: () => void;
  onRead: () => void;
  onPlans: () => void;
  onBuyPack: (pack: TopupPack) => void;
}

export function UnlockSheet({
  book: d,
  open,
  need: shortNeed = 0,
  onClose,
  onRead,
  onPlans,
  onBuyPack,
}: UnlockSheetProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const track = useTrack();
  const [variant, setVariant] = useState<Variant>('all');
  // One idempotency key per opening, reused for every retry of the same tap (rule 19).
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<UnlockMode>('all');
  const short = open === 'short';
  // A gift or tip shortfall follows the live balance, so a refetch after `insufficient_credits`
  // lands in the sheet.
  const shortVariant: Variant = spendSheet(shortNeed, d.balance, d.plan.state) === 'nosub' ? 'nosub' : 'low';
  const shown = short ? shortVariant : variant;

  useEffect(() => {
    if (!open) return;
    const v: Variant = open === 'short' ? shortVariant : variantFor(d, open);
    if (open !== 'short') setMode(open);
    setVariant(v);
    setKey(Crypto.randomUUID());
    setError(null);
    track('unlock_sheet_viewed', { variant: v === 'all' ? 'whole' : v });
    // Only when the sheet opens; later price or balance changes are handled by the error paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const settings = useQuery({
    queryKey: ['reader-settings'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error: e } = await supabase
        .from('profiles')
        .select('reader_settings')
        .eq('id', auth.user?.id ?? '')
        .single();
      if (e) throw e;
      return (data.reader_settings ?? {}) as { auto_unlock?: boolean };
    },
    enabled: open === 'paygo',
  });
  const autoUnlock = settings.data?.auto_unlock !== false;
  const setAuto = useMutation({
    mutationFn: async (on: boolean) => {
      const { error: e } = await supabase.rpc('set_reader_setting', { p_key: 'auto_unlock', p_value: on });
      if (e) throw e;
    },
    onMutate: (on) => qc.setQueryData(['reader-settings'], { ...settings.data, auto_unlock: on }),
    onError: (_e, on) => {
      qc.setQueryData(['reader-settings'], { ...settings.data, auto_unlock: !on });
      toast({ message: 'Couldn’t save that. Try again.' });
    },
  });

  const unlock = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.rpc('unlock_book', {
        p_book: d.book.id,
        p_expected_price: d.price,
        p_key: key,
      });
      if (e) throw e;
      return data as { balance: number; spent: number; status: string };
    },
    onSuccess: (r) => {
      onClose();
      void qc.invalidateQueries({ queryKey: bookKey(d.book.id) });
      if (r.status === 'already_unlocked') {
        // Unlocked or gifted elsewhere while this page was stale: nothing was spent.
        toast({ message: 'You already have this book. Nothing was charged.' });
        return;
      }
      track('book_unlocked', {
        book_id: d.book.id,
        price: d.price,
        remaining: d.remaining,
        mode: d.paid_credits > 0 ? 'rest' : 'upfront',
      });
      toast({ message: `Unlocked · ${n(r.balance)} credits left` });
    },
    onError: async (e) => {
      const { code, detail } = rpcError(e);
      track('unlock_failed', { reason: code });
      if (code === 'network') {
        setError('No connection. Nothing was charged. Try again.');
        return;
      }
      if (code === 'signed_out') {
        setError('You’re signed out. Sign in again, then try. Nothing was charged.');
        return;
      }
      // A new key for a new tap: the old one may have been used by the failed attempt.
      setKey(Crypto.randomUUID());
      const fresh = await qc
        .fetchQuery({
          queryKey: bookKey(d.book.id),
          queryFn: async () => {
            const { data, error: fe } = await supabase.rpc('get_book_page', { p_book: d.book.id });
            if (fe) throw fe;
            return data as unknown as BookPageData | null;
          },
          staleTime: 0,
        })
        .catch(() => null);
      if (code === 'price_changed') {
        setError(`The price changed to ${n(detail.price ?? fresh?.price ?? d.price)} credits.`);
      } else if (code === 'insufficient_credits') {
        setError(null);
        setVariant(fresh ? variantFor(fresh, 'all') : 'low');
      } else if (fresh?.owns_book) {
        onClose();
      } else if (code === 'rate_limited') {
        setError('That’s a lot of taps. Wait a minute, then try again.');
      } else if (code === 'own_book') {
        setError('This is your own book, so you can’t spend credits on it. Nothing was charged.');
      } else {
        setError('Something went wrong. Nothing was charged. Try again.');
      }
    },
  });

  const switchMode = (m: UnlockMode) => {
    setMode(m);
    setError(null);
    setVariant(variantFor(d, m));
    track('buy_option_tapped', { book_id: d.book.id, option: m === 'all' ? 'unlock_all' : 'pay_go' });
  };

  const paid = d.paid_credits;
  const missing = Math.max(
    0,
    (short ? shortNeed : mode === 'all' ? (paid > 0 ? d.remaining : d.price) : (d.first_unpaid?.price ?? 0)) -
      d.balance,
  );
  const { pack: preset, enough } = pickTopupPack(missing);
  const [pack, setPack] = useState<TopupPack>(preset);
  useEffect(() => setPack(preset), [preset]);

  const preview = Number(d.preview_percent);
  const quarterly = LAUNCH_PLANS.find((p) => p.id === 'quarterly')!;
  const fromNaira = Math.min(...LAUNCH_PLANS.map(perMonthNaira));
  const periodEnd = d.plan.period_end ? DATE.format(new Date(d.plan.period_end)) : null;
  const planCredits = LAUNCH_PLANS.find((p) => p.id === d.plan.plan_code)?.credits;

  const head: Record<Variant, { title: string; sub?: string }> = {
    all: {
      title: paid > 0 ? 'Pay the rest' : `Unlock ${d.book.title}`,
      sub: `${n(d.pages ?? 0)} pages · ${n(d.chapters)} chapters · ${n(d.price)} credits`,
    },
    paygo: { title: 'Pay as you read', sub: `${d.book.title} · ${n(d.price)} credits in total` },
    low: {
      title: `You need ${n(missing)} more credits`,
      sub: short ? `Your balance is ${n(d.balance)} credits` : `${d.book.title} costs ${n(d.price)} credits`,
    },
    nosub: { title: 'Credits come with a plan' },
  };

  const covered = short ? 0 : chaptersCovered(d.balance, d.unpaid_prices ?? []);
  const lowCopy = [
    planCredits && periodEnd
      ? `Your plan adds ${n(planCredits)} more on ${periodEnd}, or top up now.`
      : 'Top up now to keep going.',
    !enough ? 'You’ll need a second top-up after this one.' : null,
    covered > 0
      ? `Or switch to pay as you read: your ${n(d.balance)} credits cover the next ${covered === 1 ? 'chapter' : `${covered} chapters`}.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Sheet
      open={open !== null}
      onClose={onClose}
      locked={unlock.isPending}
      bold
      title={head[shown].title}
      sub={head[shown].sub}
    >
      {shown === 'all' ? (
        <UnlockAllBody
          balance={d.balance}
          price={d.price}
          paid={paid}
          remaining={d.remaining}
          author={d.book.author.name ?? 'The author'}
          onMode={switchMode}
          onUnlock={() => unlock.mutate()}
          busy={unlock.isPending}
          error={error}
          showSwitch={d.chargeable_chapters > 0}
        />
      ) : shown === 'paygo' ? (
        <PayGoBody
          previewPercent={preview}
          previewPages={previewPages(d.pages ?? 0, preview)}
          perChapter={d.per_chapter ?? 0}
          price={d.price}
          autoUnlock={autoUnlock}
          onAutoUnlock={(v) => setAuto.mutate(v)}
          onMode={switchMode}
          onStart={() => {
            track('paygo_started', { book_id: d.book.id, auto_unlock: autoUnlock });
            onClose();
            onRead();
          }}
        />
      ) : shown === 'low' ? (
        <LowBody
          bookLine={short ? 'You’re sending' : `${d.book.title} · ${n(d.pages ?? 0)} pages`}
          price={short ? shortNeed : d.price}
          balance={d.balance}
          copy={lowCopy}
          packs={TOPUP_PACKS}
          selected={pack}
          enough={enough ? preset : null}
          onSelect={setPack}
          onBuy={() => {
            track('topup_from_unlock', { missing, pack: pack.credits });
            onBuyPack(pack);
          }}
        />
      ) : (
        <NoSubBody
          copy={`A plan gives you credits every time it renews. This book costs ${n(d.price)} credits. Quarterly gives you ${n(quarterly.credits)}, about ${booksCovered(quarterly.credits, d.price)} books like this one over three months.`}
          previewPercent={preview}
          fromNaira={fromNaira}
          onPlans={() => {
            onClose();
            onPlans();
          }}
          onRead={() => {
            onClose();
            onRead();
          }}
        />
      )}
    </Sheet>
  );
}
