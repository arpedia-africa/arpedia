// "Buy N credits" from a not-enough-credits sheet (flow 03 rule 29, flow 04, flow 05): buys the pack
// through the store, waits for the credits, then refreshes the screens that show the balance. Nothing
// is spent automatically: the sheet shows the new balance and the reader taps Unlock again.
import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { TopupPack } from '@arpedia/core';
import { useToast } from '@arpedia/ui';
import { useTrack } from './analytics';
import { balanceBefore, keepWatching, n, usePlans, waitForCredits } from './data';
import { failureMessage, purchase } from './purchases';

export function useBuyPack(refresh: QueryKey[] = []) {
  const toast = useToast();
  const track = useTrack();
  const qc = useQueryClient();
  const plans = usePlans();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  /** Resolves true once the store took the payment (the credits may still be on their way). */
  const buy = useCallback(
    async (pack: TopupPack): Promise<boolean> => {
      if (running.current) return false;
      // The sheet's packs are the store products of the same size; without the list, the Credits
      // screen sells them.
      const product = plans.data?.topups.find((t) => t.credits === pack.credits);
      if (!product) {
        router.push('/credits');
        return false;
      }
      running.current = true;
      setBusy(true);
      track('topup_started', { credits: pack.credits });
      const before = await balanceBefore();
      try {
        const res = await purchase({ kind: 'topup', code: product.code });
        if (res.status === 'cancelled') return false;
        if (res.status === 'error') {
          track('purchase_failed', { reason: res.code });
          toast({ message: failureMessage(res.code, res.message) });
          return false;
        }
        if (await waitForCredits(before, { current: false })) {
          track('topup_completed', { credits: pack.credits });
          toast({ message: `${n(pack.credits)} credits added` });
        } else {
          keepWatching(before);
          toast({ message: 'Your purchase went through. Credits will appear shortly' });
        }
        await Promise.all(refresh.map((queryKey) => qc.invalidateQueries({ queryKey })));
        return true;
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    // refresh is a fresh array each render; its keys are what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans.data, qc, toast, track, JSON.stringify(refresh)],
  );

  return { buy, busy };
}
