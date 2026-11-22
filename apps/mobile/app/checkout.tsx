import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen, useToast } from '@arpedia/ui';
import { OnbSheet } from '../features/01/parts';
import { useTrack } from '../features/09/analytics';
import {
  balanceBefore,
  keepWatching,
  refreshCredits,
  useOnline,
  usePlans,
  waitForCredits,
} from '../features/09/data';
import { SubPad } from '../features/09/parts';
import { CheckoutBody, CheckoutHero, SettingUp } from '../features/09/PlanViews';
import { PURCHASE_COPY, failureMessage, isAvailable, purchase, restore } from '../features/09/purchases';

// s-checkout (Secure checkout): plan summary, Subscribe with Google Play, Restore purchases.
// After the store confirms: "Setting up your plan", polling `my_credit_balance` for up to 30 s
// (rules 5 and 6). The app never grants credits itself and never asks to pay twice.
export default function Checkout() {
  const { plan: planParam, from } = useLocalSearchParams<{ plan?: string; from?: string }>();
  const toast = useToast();
  const track = useTrack();
  const online = useOnline();
  const plans = usePlans();
  const store = useQuery({ queryKey: ['store-available'], queryFn: isAvailable, staleTime: 0 });
  const plan = plans.data?.plans.find((p) => p.code === (planParam ?? 'quarterly')) ?? null;

  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'setting_up' | 'late'>('idle');
  const gone = useRef({ current: false });
  useEffect(() => {
    const flag = gone.current;
    return () => {
      flag.current = true;
    };
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (plan && !started.current) {
      started.current = true;
      track('checkout_started', { plan: plan.code });
    }
  }, [plan, track]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/plan'));
  /** Onboarding goes on to "You're all set"; later purchases land on Credits. */
  const finish = () =>
    from === 'onboarding' ? router.replace('/(onboarding)/all-set') : router.replace('/credits');

  const subscribe = async () => {
    if (!plan || busy) return;
    setBusy(true);
    setError(null);
    try {
      const before = await balanceBefore();
      const res = await purchase({ kind: 'plan', code: plan.code });
      if (res.status === 'cancelled') return;
      if (res.status === 'error') {
        track('purchase_failed', { reason: res.code });
        setError(failureMessage(res.code, res.message));
        return;
      }
      track('purchase_completed', { plan: plan.code, store: 'play', price: plan.price_play_kobo / 100 });
      setPhase('setting_up');
      if (await waitForCredits(before, gone.current)) {
        if (gone.current.current) return;
        toast({ message: 'Your plan is active' });
        finish();
      } else if (!gone.current.current) {
        keepWatching(before);
        setPhase('late');
      }
    } catch {
      setError(PURCHASE_COPY.unknown);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (restoring || busy) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await restore();
      if (res.status === 'restored') {
        refreshCredits();
        toast({ message: 'Your plan is back' });
        finish();
      } else if (res.status === 'none') {
        setError('No plan found on this Google account.');
      } else {
        setError(failureMessage(res.code, res.message));
      }
    } catch {
      setError(PURCHASE_COPY.unknown);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <CheckoutHero plan={plan} onBack={back} />
      <OnbSheet>
        <SubPad>
          {phase === 'idle' ? (
            <CheckoutBody
              plan={plan}
              busy={busy}
              restoring={restoring}
              offline={!online}
              unavailable={store.data === false}
              error={error}
              onSubscribe={() => void subscribe()}
              onRestore={() => void doRestore()}
              onRetry={() => void store.refetch()}
            />
          ) : (
            <SettingUp late={phase === 'late'} onDone={finish} />
          )}
        </SubPad>
      </OnbSheet>
    </Screen>
  );
}
