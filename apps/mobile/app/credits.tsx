import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { isPromoCode } from '@arpedia/core';
import { Callout, Screen, useTheme, useToast } from '@arpedia/ui';
import { useTrack } from '../features/09/analytics';
import {
  BuySection,
  CreditsFailed,
  CreditsHero,
  HistorySection,
  HistorySkeleton,
  PromoSection,
  TopUpSection,
} from '../features/09/CreditsViews';
import {
  PROMO_COPY,
  balanceBefore,
  errCode,
  isNetworkFailure,
  keepWatching,
  n,
  updatedAgo,
  useCreditsScreen,
  useOnline,
  usePlans,
  useRedeem,
  waitForCredits,
} from '../features/09/data';
import { PENDING_COPY, failureMessage, purchase } from '../features/09/purchases';
import { Announcements } from '../features/15/AnnouncementCard';

// s-credits: balance split, top-ups (subscribers), what credits buy, promo code, history.
export default function Credits() {
  const { c, s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const online = useOnline();
  const q = useCreditsScreen();
  const plans = usePlans();
  const redeem = useRedeem();

  const first = q.data?.pages[0];
  const lines = q.data?.pages.flatMap((p) => p.history) ?? [];
  const packs = first?.topups ?? [];

  const [picked, setPicked] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const viewed = useRef(false);
  useEffect(() => {
    if (first && !viewed.current) {
      viewed.current = true;
      track('credits_viewed');
    }
  }, [first, track]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));
  const toPlan = () => router.push('/plan');

  // Preselect the middle pack, as the prototype does.
  const pickCode = picked ?? packs[Math.min(1, packs.length - 1)]?.code ?? '';
  const planState = first?.plan;
  const mode = !first
    ? 'loading'
    : planState?.state === 'plan'
      ? planState.status === 'paused'
        ? 'paused'
        : 'plan'
      : 'none';
  const plan =
    planState?.state === 'plan'
      ? (plans.data?.plans.find((p) => p.code === planState.plan_code) ?? null)
      : null;

  const buy = async () => {
    const pack = packs.find((p) => p.code === pickCode);
    if (!pack || buying) return;
    setBuying(true);
    track('topup_started', { credits: pack.credits });
    const before = await balanceBefore();
    try {
      const res = await purchase({ kind: 'topup', code: pack.code });
      if (res.status === 'cancelled') return;
      if (res.status === 'pending') {
        keepWatching(before);
        toast({ message: PENDING_COPY });
        return;
      }
      if (res.status === 'error') {
        track('purchase_failed', { reason: res.code });
        toast({ message: failureMessage(res.code, res.message) });
        return;
      }
      const stop = { current: false };
      if (await waitForCredits(before, stop)) {
        track('topup_completed', { credits: pack.credits });
        toast({ message: `${n(pack.credits)} credits added` });
      } else {
        keepWatching(before);
        toast({ message: 'Your purchase went through. Credits will appear shortly' });
      }
    } finally {
      setBuying(false);
    }
  };

  const doRedeem = () => {
    if (redeem.isPending) return;
    if (!isPromoCode(code)) {
      setCodeError('Codes are 4 to 16 letters or numbers.');
      return;
    }
    setCodeError(null);
    redeem.mutate(code, {
      onSuccess: (r) => {
        track('promo_redeemed', { kind: 'bonus_credits' });
        setCode('');
        toast({ message: `${n(r.credits)} credits added` });
      },
      onError: (e) =>
        setCodeError(
          PROMO_COPY[errCode(e)] ??
            (isNetworkFailure(e)
              ? 'No connection. Check your network and try again.'
              : 'Something went wrong. Try again.'),
        ),
    });
  };

  if (!first && q.isError) {
    return (
      <Screen top="white">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <CreditsFailed offline={!online} onRetry={() => void q.refetch()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen top="org" contentStyle={{ backgroundColor: c.white }}>
      <CreditsHero balance={first?.balance ?? null} plan={plan} onBack={back} onPlan={toPlan} />
      {!online ? (
        <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
          <Callout tone="quiet">
            {`You’re offline. ${q.dataUpdatedAt ? `${updatedAgo(q.dataUpdatedAt)}.` : 'Showing your last balance.'}`}
          </Callout>
        </View>
      ) : null}
      <Announcements placement="credits" style={{ paddingHorizontal: s(16), paddingTop: s(16) }} />
      <TopUpSection
        mode={mode}
        packs={packs}
        selected={pickCode}
        onSelect={setPicked}
        plan={plan}
        busy={buying}
        offline={!online}
        onBuy={() => void buy()}
        onPlans={toPlan}
      />
      <PromoSection
        value={code}
        onChange={(v) => {
          setCode(v);
          setCodeError(null);
        }}
        error={codeError}
        busy={redeem.isPending}
        offline={!online}
        onRedeem={doRedeem}
      />
      <BuySection
        bookPrice={plans.data?.avg_book_price_credits ?? 125}
        messageCost={first?.message_cost ?? 5}
        tipFrom={first?.tip_presets.length ? Math.min(...first.tip_presets) : 10}
      />
      {first ? (
        <HistorySection
          lines={lines}
          hasMore={!!q.hasNextPage}
          loadingMore={q.isFetchingNextPage}
          onMore={() => void q.fetchNextPage()}
        />
      ) : (
        <HistorySkeleton />
      )}
    </Screen>
  );
}
