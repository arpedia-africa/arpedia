import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { Btn, EmptyState, Link, Screen, Skeleton, useTheme, useToast } from '@arpedia/ui';
import { OnbSheet } from '../features/01/parts';
import {
  errCode,
  manageUrl,
  planPrice,
  playManageUrl,
  useOnline,
  usePlanScreen,
  useResume,
} from '../features/09/data';
import { useTrack } from '../features/09/analytics';
import { Foot, OfflineNote, SubPad } from '../features/09/parts';
import { PlanBody, PlanHero } from '../features/09/PlanViews';

// s-plans (Your plan): current plan, status, renewal and price; switching, pausing and cancelling
// happen in Google Play for in-app subscribers (rules 16 to 19).
export default function Plan() {
  const { s } = useTheme();
  const toast = useToast();
  const online = useOnline();
  const q = usePlanScreen();
  const resume = useResume();
  const [picked, setPicked] = useState<string | null>(null);
  const track = useTrack();

  const d = q.data;
  const sub = d?.subscription ?? null;
  const plans = d?.plans ?? null;
  const live = !!sub && sub.status !== 'expired' && sub.status !== 'refunded';
  const selected = picked ?? plans?.find((p) => p.code === 'yearly')?.code ?? plans?.[0]?.code ?? '';
  const target = plans?.find((p) => p.code === selected) ?? null;
  // Analytics: one paywall_viewed per visit once the plans are known; plan_selected on each pick.
  const viewed = useRef(false);
  useEffect(() => {
    if (!plans || viewed.current) return;
    viewed.current = true;
    track('paywall_viewed', { source: 'plans', plan_shown: selected });
  }, [plans, selected, track]);
  const pickPlan = (code: string) => {
    setPicked(code);
    const p = plans?.find((x) => x.code === code);
    track('plan_selected', { plan: code, price: p ? Math.round(p.price_play_kobo / 100) : 0 });
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));
  const open = (url: string) => void Linking.openURL(url);

  const main = (() => {
    if (!d || !target) return null;
    const store = sub?.store === 'web' ? 'on the web' : 'in Google Play';
    if (!live || !sub) {
      return {
        label: `Subscribe to ${target.name} · ${planPrice(target)}`,
        needsNet: true,
        run: () => router.push({ pathname: '/checkout', params: { plan: target.code } }),
      };
    }
    if (sub.status === 'paused') {
      return {
        label: sub.store === 'web' ? 'Resume plan' : 'Resume in Google Play',
        needsNet: sub.store === 'web',
        run: () =>
          sub.store === 'web'
            ? resume.mutate(undefined, {
                onSuccess: () => toast({ message: 'Your plan is back on' }),
                onError: (e) =>
                  toast({
                    message:
                      errCode(e) === 'not_paused' ? 'Your plan isn’t paused.' : 'Couldn’t resume. Try again.',
                  }),
              })
            : open(manageUrl(sub)),
      };
    }
    return {
      label:
        target.code === sub.plan.code ? `Manage ${store}` : `Switch to ${target.name} · ${planPrice(target)}`,
      needsNet: false,
      // A switch is made in the store and starts at the next renewal.
      run: () => open(sub.store === 'web' ? manageUrl(sub) : playManageUrl(target.play_product_id)),
    };
  })();

  if (!d && q.isError) {
    return (
      <Screen top="white">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title="Your plan didn’t load"
            body={
              online
                ? 'Something went wrong on our side. Try again.'
                : 'You’re offline. Connect and try again.'
            }
            action={{ label: 'Try again', onPress: () => void q.refetch() }}
          />
        </View>
      </Screen>
    );
  }

  const canLeave = live && sub?.status !== 'paused' && sub?.status !== 'cancelled';
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <Foot>
          {main ? (
            <Btn
              label={main.label}
              block
              loading={resume.isPending}
              disabled={main.needsNet && !online}
              onPress={main.run}
            />
          ) : (
            <Skeleton height={48} radius={12} />
          )}
          {main?.needsNet && !online ? <OfflineNote /> : null}
          {canLeave ? (
            <View style={{ alignItems: 'center', minHeight: s(44), justifyContent: 'center' }}>
              <Link label="Pause or cancel plan" size={13.5} onPress={() => router.push('/plan-cancel')} />
            </View>
          ) : null}
        </Foot>
      }
    >
      <PlanHero sub={sub} loading={!d} onBack={back} />
      <OnbSheet>
        <SubPad>
          <PlanBody sub={sub} plans={plans} selected={selected} onSelect={pickPlan} />
        </SubPad>
      </OnbSheet>
    </Screen>
  );
}
