import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { ledgerDay, pauseResumeDate } from '@arpedia/core';
import { Btn, EmptyState, Link, Screen, Segmented, Skeleton, Text, useTheme, useToast } from '@arpedia/ui';
import { OnbSheet } from '../features/01/parts';
import { useTrack } from '../features/09/analytics';
import {
  dayMonth,
  errCode,
  longDayMonth,
  manageUrl,
  n,
  useOnline,
  usePause,
  usePlanScreen,
  useResume,
} from '../features/09/data';
import { Foot, OfflineNote, SubPad } from '../features/09/parts';
import { CancelHero, CancelSummary } from '../features/09/PlanViews';

type Months = '1' | '2' | '3';

// s-plan-cancel (Pause or cancel): the pause offer first, an honest cancel summary, and a final
// cancel that is a deep link to Google Play (rules 17 to 19). We never hide the way out.
export default function PlanCancel() {
  const { s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const online = useOnline();
  const q = usePlanScreen();
  const pause = usePause();
  const resume = useResume();
  const [months, setMonths] = useState<Months>('1');

  const d = q.data;
  const sub = d?.subscription ?? null;
  const bal = d?.balance;
  const web = sub?.store === 'web';
  const max = Math.min(3, d?.pause_max_months ?? 3);
  const count = Number(months);

  const offered = useRef(false);
  useEffect(() => {
    if (sub?.status === 'active' && !offered.current) {
      offered.current = true;
      track('pause_offered');
    }
  }, [sub?.status, track]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/plan'));
  const openStore = () => {
    if (sub) void Linking.openURL(manageUrl(sub));
  };
  const cancel = () => {
    track('cancel_started');
    openStore();
  };
  const cancelLabel = web ? 'Cancel on the web' : 'Cancel in Google Play';

  if (!d) {
    if (q.isError) {
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
    return (
      <Screen top="org" contentStyle={{ flexGrow: 1 }}>
        <CancelHero title="Take a break instead?" sub="" onBack={back} />
        <OnbSheet>
          <SubPad>
            <Skeleton height={64} radius={12} />
            <Skeleton height={20} />
            <Skeleton height={120} radius={14} />
          </SubPad>
        </OnbSheet>
      </Screen>
    );
  }

  // Nothing to pause: no plan, or it already ended or is ending.
  if (!sub || sub.status === 'expired' || sub.status === 'refunded' || sub.status === 'cancelled') {
    return (
      <Screen top="white">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title={
              sub?.status === 'cancelled'
                ? `Your plan ends on ${ledgerDay(sub.period_end)}`
                : 'You don’t have a plan to pause'
            }
            body={
              sub?.status === 'cancelled'
                ? 'It won’t renew. Your credits stay usable until then, and your books stay yours.'
                : 'Pick a plan and your credits arrive straight away.'
            }
            action={{ label: sub?.status === 'cancelled' ? 'Back to your plan' : 'See plans', onPress: back }}
          />
        </View>
      </Screen>
    );
  }

  // Already paused: resume, or cancel.
  if (sub.status === 'paused') {
    const total = bal?.total ?? 0;
    return (
      <Screen
        top="org"
        contentStyle={{ flexGrow: 1 }}
        footer={
          <Foot>
            <Btn
              label={web ? 'Resume plan' : 'Resume in Google Play'}
              block
              loading={resume.isPending}
              disabled={web && !online}
              onPress={() =>
                web
                  ? resume.mutate(undefined, {
                      onSuccess: () => {
                        toast({ message: 'Your plan is back on' });
                        router.replace('/plan');
                      },
                      onError: () => toast({ message: 'Couldn’t resume. Try again.' }),
                    })
                  : openStore()
              }
            />
            {web && !online ? <OfflineNote /> : null}
            <View style={{ alignItems: 'center', minHeight: s(44), justifyContent: 'center' }}>
              <Link label={cancelLabel} size={13.5} onPress={cancel} />
            </View>
          </Foot>
        }
      >
        <CancelHero
          title="Your plan is paused"
          sub={`${sub.pause_until ? `Billing starts again on ${longDayMonth(sub.pause_until)}. ` : ''}All ${n(total)} credits are kept.`}
          onBack={back}
        />
        <OnbSheet>
          <SubPad>
            <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
              Your credits, rollover and library stay exactly as they are while you wait.
            </Text>
          </SubPad>
        </OnbSheet>
      </Screen>
    );
  }

  const resumeOn = pauseResumeDate(new Date(sub.period_end), count, max);
  const doPause = () => {
    if (!web) {
      track('pause_started', { months: count });
      openStore();
      return;
    }
    pause.mutate(count, {
      onSuccess: () => {
        track('pause_started', { months: count });
        toast({ message: `Plan paused. It starts again on ${longDayMonth(resumeOn)}.` });
        router.replace('/plan');
      },
      onError: (e) => {
        const code = errCode(e);
        if (code === 'pause_in_store') return openStore();
        toast({
          message:
            code === 'no_active_plan'
              ? 'Your plan isn’t active, so it can’t be paused.'
              : 'Couldn’t pause. Try again.',
        });
      },
    });
  };

  const options = (['1', '2', '3'] as const)
    .filter((m) => Number(m) <= max)
    .map((m) => ({ value: m, label: m === '1' ? '1 month' : `${m} months` }));
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <Foot>
          <Btn
            label={`Pause for ${count} ${count === 1 ? 'month' : 'months'}`}
            block
            loading={pause.isPending}
            disabled={web && !online}
            onPress={doPause}
          />
          {web && !online ? <OfflineNote /> : null}
          <View style={{ alignItems: 'center', minHeight: s(44), justifyContent: 'center' }}>
            <Link label={cancelLabel} size={13.5} onPress={cancel} />
          </View>
        </Foot>
      }
    >
      <CancelHero
        title="Take a break instead?"
        sub={`Pause your plan and keep all ${n(bal?.total ?? 0)} credits.`}
        onBack={back}
      />
      <OnbSheet>
        <SubPad>
          <View style={{ gap: s(8) }}>
            <Text variant="label">Pause for</Text>
            <Segmented options={options} value={months} onChange={setMonths} />
          </View>
          <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
            {`Billing stops and starts again on ${longDayMonth(resumeOn)}. Your credits, rollover and library stay exactly as they are.${web ? '' : ' You’ll confirm the pause in Google Play.'}`}
          </Text>
          <CancelSummary
            plan={bal?.plan ?? 0}
            rollover={bal?.rollover ?? 0}
            topup={bal?.topup ?? 0}
            until={dayMonth(sub.period_end)}
          />
        </SubPad>
      </OnbSheet>
    </Screen>
  );
}
