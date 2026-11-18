import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { LAUNCH_PLANS, PRIVACY_URL, TERMS_URL, paywallCopy, reminderDay, type PlanId } from '@arpedia/core';
import { Btn, Screen, Sheet } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import {
  PaywallBody,
  PaywallFoot,
  PaywallHero,
  PlansAllList,
  type PaywallBook,
} from '../../features/01/PaywallViews';
import { useTrack } from '../../features/01/analytics';
import { NO_PLAN_FOUND, STORE_UNAVAILABLE, loadStore, purchase, restore } from '../../features/01/billing';
import { finishOnboarding } from '../../features/01/finish';
import { COPY, isNetworkError } from '../../features/01/session';
import { saveStep } from '../../features/01/steps';

interface PaywallData {
  first_name: string | null;
  genres: string[];
  book_count: number;
  covers: PaywallBook[];
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// s-plans-onboard (+ s-plans-all sheet). Reaching it finishes onboarding (rule 29).
export default function Plans() {
  const track = useTrack();
  const net = useNetInfo();
  const offline = net.isConnected === false;
  const [planId, setPlanId] = useState<PlanId>('quarterly');
  const [sheet, setSheet] = useState(false);
  const [sheetPick, setSheetPick] = useState<PlanId>('quarterly');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shelf = useQuery({
    queryKey: ['onboarding-paywall'],
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc('get_onboarding_paywall');
      if (e) throw e;
      return data as unknown as PaywallData;
    },
  });
  const store = useQuery({ queryKey: ['store'], queryFn: loadStore });

  useEffect(() => {
    void saveStep('plans');
  }, []);
  useEffect(() => {
    if (shelf.data) track('paywall_viewed', { plan: 'quarterly', genres_count: shelf.data.genres.length });
  }, [shelf.data, track]);
  useEffect(() => {
    if (store.data && !store.data.available) setError(STORE_UNAVAILABLE);
  }, [store.data]);

  const plans = store.data?.plans ?? null;
  const selected = (plans ?? LAUNCH_PLANS).find((p) => p.id === planId)!;
  const copy = paywallCopy(
    shelf.data?.first_name ?? null,
    shelf.data?.genres ?? [],
    shelf.data?.book_count ?? 0,
  );
  const day = useMemo(() => reminderDay(today(), selected.months), [selected.months]);

  const browseFirst = () => {
    track('paywall_closed', { via: 'browse_first' });
    void finishOnboarding(track);
  };
  // OS back on the paywall is the same as ✕ (never back into the profile form).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) setSheet(false);
      else browseFirst();
      return true;
    });
    return () => sub.remove();
  });

  const pick = (id: PlanId) => {
    setPlanId(id);
    track('plan_selected', { plan: id });
  };

  const run = async (kind: 'buy' | 'restore') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'buy') {
        if (await purchase(selected.id)) router.replace('/(onboarding)/all-set');
      } else {
        const found = await restore();
        track('restore_tapped', { result: found });
        if (found === 'found') router.replace('/(onboarding)/all-set');
        else setError(NO_PLAN_FOUND);
      }
    } catch (e) {
      if (kind === 'restore') track('restore_tapped', { result: 'error' });
      setError(isNetworkError(e) ? COPY.offline : e instanceof Error ? e.message : COPY.generic);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <PaywallFoot
          plan={plans ? selected : null}
          offline={offline}
          disabled={!store.data?.available}
          busy={busy === 'buy'}
          error={offline ? COPY.offline : error}
          onContinue={() => void run('buy')}
          onOffline={() => void finishOnboarding(track)}
          onTerms={() => void Linking.openURL(TERMS_URL)}
          onPrivacy={() => void Linking.openURL(PRIVACY_URL)}
        />
      }
    >
      <PaywallHero
        title={copy.title}
        sub={shelf.data ? copy.sub : ''}
        books={shelf.data?.covers ?? []}
        onClose={browseFirst}
        onRestore={() => void run('restore')}
        restoring={busy === 'restore'}
      />
      <PaywallBody
        plans={plans ? plans.filter((p) => p.id !== 'monthly') : null}
        selected={selected}
        reminderDay={day}
        onSelect={pick}
        onMore={() => {
          setSheetPick(planId);
          setSheet(true);
        }}
      />
      <Sheet
        bold
        open={sheet}
        onClose={() => setSheet(false)}
        title="All plans"
        footer={
          <Btn
            label="Choose plan"
            block
            onPress={() => {
              pick(sheetPick);
              setSheet(false);
            }}
          />
        }
      >
        <View>
          <PlansAllList plans={[...(plans ?? LAUNCH_PLANS)]} selected={sheetPick} onSelect={setSheetPick} />
        </View>
      </Sheet>
    </Screen>
  );
}
