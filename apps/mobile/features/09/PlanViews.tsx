import { ActivityIndicator, View } from 'react-native';
import { aboutBooks, ledgerDay, naira } from '@arpedia/core';
import {
  Btn,
  Callout,
  Hero,
  Icon,
  IconButton,
  KeyValue,
  Link,
  Pill,
  Skeleton,
  Text,
  useTheme,
  type PillTone,
} from '@arpedia/ui';
import { HeroSub } from '../01/parts';
import { everyLabel, n, type PlanJson, type SubscriptionJson } from './data';
import { Benefits, Legal, OfflineNote, OptionRow, OptionSkeleton } from './parts';

// s-plans, s-checkout and s-plan-cancel (`node tools/screen.mjs s-plans s-checkout s-plan-cancel --css`).
// `.sub-hero .hero__body`: padding-bottom 44.

// ─── s-plans ────────────────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; tone: PillTone }> = {
  active: { label: 'Active', tone: 'night' },
  grace: { label: 'Payment issue', tone: 'warn' },
  billing_retry: { label: 'Payment issue', tone: 'warn' },
  paused: { label: 'Paused', tone: 'night' },
  cancelled: { label: 'Cancelled', tone: 'night' },
  expired: { label: 'Expired', tone: 'grey' },
  refunded: { label: 'Refunded', tone: 'grey' },
};

/** The second pill: when it renews, resumes or ends. */
function dateLine(sub: SubscriptionJson) {
  switch (sub.status) {
    case 'active':
    case 'grace':
    case 'billing_retry':
      return `Renews ${ledgerDay(sub.period_end)} · ${naira(sub.price_kobo)}`;
    case 'paused':
      return sub.pause_until ? `Resumes ${ledgerDay(sub.pause_until)}` : 'Paused';
    case 'cancelled':
      return `Ends ${ledgerDay(sub.period_end)}`;
    default:
      return null;
  }
}

export function PlanHero({
  sub,
  loading,
  onBack,
}: {
  sub: SubscriptionJson | null;
  loading: boolean;
  onBack: () => void;
}) {
  const { c, s } = useTheme();
  const line = sub ? dateLine(sub) : null;
  const status = sub ? STATUS[sub.status] : null;
  return (
    <Hero
      barBack
      bar={
        <>
          <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          <View style={{ flex: 1 }} />
        </>
      }
      title={sub || loading ? 'Your plan' : 'Choose a plan'}
      sub={
        sub
          ? `${sub.plan.name} · ${n(sub.plan.total_credits)} credits ${everyLabel(sub.plan.months)}`
          : loading
            ? ''
            : 'Credits every period. Cancel anytime in Google Play.'
      }
      bodyStyle={{ paddingBottom: s(44) }}
    >
      {loading ? (
        <Skeleton width={s(200)} height={26} radius={999} />
      ) : status ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s(8) }}>
          <Pill tone={status.tone} label={status.label} />
          {line ? <Pill label={line} /> : null}
        </View>
      ) : null}
    </Hero>
  );
}

const perMonth = (p: PlanJson) => naira(Math.round(p.price_play_kobo / p.months));

/** The plan ladder (`.option-list` with radios): prices as Google Play charges them. */
export function PlanOptions({
  plans,
  currentCode,
  selected,
  onSelect,
}: {
  plans: PlanJson[] | null;
  currentCode: string | null;
  selected: string;
  onSelect: (code: string) => void;
}) {
  const { s } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: s(10) }}>
      {plans
        ? plans.map((p) => (
            <OptionRow
              key={p.code}
              radio
              title={p.name}
              pill={
                p.code === currentCode
                  ? { label: 'Current', tone: 'night' }
                  : p.badge
                    ? { label: p.badge, tone: p.badge === 'Best value' ? 'ok' : 'brand' }
                    : undefined
              }
              sub={`${n(p.total_credits)} credits ≈ ${aboutBooks(p.total_credits)} ${aboutBooks(p.total_credits) === 1 ? 'book' : 'books'} · ${perMonth(p)} a month`}
              trail={naira(p.price_play_kobo)}
              selected={p.code === selected}
              onPress={() => onSelect(p.code)}
            />
          ))
        : [0, 1, 2].map((i) => <OptionSkeleton key={i} />)}
    </View>
  );
}

export const PLAN_BENEFITS = [
  'Credits refill every renewal; unused ones roll over once',
  'Unlock whole books or pay as you read',
  'First 10% of every book free',
  'Offline reading, book rooms and clubs',
  'Message authors for 5 credits; cancel anytime',
];

export function PlanBody({
  sub,
  plans,
  selected,
  onSelect,
}: {
  sub: SubscriptionJson | null;
  plans: PlanJson[] | null;
  selected: string;
  onSelect: (code: string) => void;
}) {
  const grace = sub && (sub.status === 'grace' || sub.status === 'billing_retry');
  const differs = !!sub && sub.plan.code !== selected;
  return (
    <>
      {grace ? (
        <Callout tone="warn">
          {sub.store === 'web'
            ? 'Update your payment method on your Arpedia web account.'
            : 'Update your payment method in Google Play'}
        </Callout>
      ) : null}
      {sub?.pending_plan ? (
        <Callout tone="info">{`Switching to ${sub.pending_plan.name} when this period ends on ${ledgerDay(sub.period_end)}.`}</Callout>
      ) : null}
      <PlanOptions
        plans={plans}
        currentCode={sub?.plan.code ?? null}
        selected={selected}
        onSelect={onSelect}
      />
      <Benefits items={PLAN_BENEFITS} />
      <Callout tone="info">Books you unlock stay in your library for good, even if you cancel.</Callout>
      <Legal>
        {`Renews automatically at the end of each period. Cancel anytime in ${sub?.store === 'web' ? 'your web account' : 'Google Play'}; your library, history and progress stay.${differs ? ' A switch takes effect at your next renewal, and this period’s credits stay as they are.' : ''}`}
      </Legal>
    </>
  );
}

// ─── s-checkout ─────────────────────────────────────────────────────────────
export function CheckoutHero({ plan, onBack }: { plan: PlanJson | null; onBack: () => void }) {
  const { c, s } = useTheme();
  return (
    <Hero
      barBack
      bar={
        <>
          <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          <Text size={14} weight={700} color="onOrg" oneLine>
            Secure checkout
          </Text>
          <View style={{ flex: 1 }} />
          <View style={{ width: s(44), alignItems: 'center' }}>
            <Icon name="lock" color={c.onOrg} />
          </View>
        </>
      }
      bodyStyle={{ paddingBottom: s(44) }}
    >
      {plan ? (
        <Text
          family="display"
          weight={800}
          size={44}
          color="onOrg"
          oneLine
          style={{ letterSpacing: s(44) * -0.03, lineHeight: s(44) }}
        >
          {`Pay ${naira(plan.price_play_kobo)}`}
        </Text>
      ) : (
        <Skeleton width={s(180)} height={44} radius={10} />
      )}
      {plan ? (
        <HeroSub>{`Arpedia ${plan.name} · ${everyLabel(plan.months)}`}</HeroSub>
      ) : (
        <Skeleton width="60%" height={14} />
      )}
    </Hero>
  );
}

export function CheckoutSummary({ plan }: { plan: PlanJson | null }) {
  if (!plan) return <Skeleton height={140} radius={14} />;
  const books = aboutBooks(plan.total_credits);
  return (
    <KeyValue
      rows={[
        { k: `Credits ${everyLabel(plan.months)}`, v: n(plan.total_credits) },
        { k: 'About', v: `${books} ${books === 1 ? 'book' : 'books'} of 250 pages` },
        { k: 'Today', v: naira(plan.price_play_kobo), total: true },
      ]}
    />
  );
}

export function CheckoutBody({
  plan,
  busy,
  restoring,
  offline,
  unavailable,
  error,
  onSubscribe,
  onRestore,
  onRetry,
}: {
  plan: PlanJson | null;
  busy: boolean;
  restoring: boolean;
  offline: boolean;
  /** Google Play isn't usable on this phone. */
  unavailable: boolean;
  error: string | null;
  onSubscribe: () => void;
  onRestore: () => void;
  onRetry: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <CheckoutSummary plan={plan} />
      {unavailable ? (
        <>
          <Callout tone="warn">Google Play is not responding. Try again</Callout>
          <Btn label="Try again" variant="s" block onPress={onRetry} />
        </>
      ) : null}
      <Btn
        label="Subscribe with Google Play"
        icon="arrow"
        block
        loading={busy}
        disabled={!plan || offline || unavailable || restoring}
        onPress={onSubscribe}
      />
      {offline ? <OfflineNote /> : null}
      {error ? (
        <Text size={12} weight={500} color="err" center accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={{ alignItems: 'center', minHeight: s(44), justifyContent: 'center' }}>
        {restoring ? (
          <ActivityIndicator accessibilityLabel="Restoring purchases" />
        ) : (
          <Link label="Restore purchases" onPress={offline || busy ? undefined : onRestore} />
        )}
      </View>
      <Legal>
        One charge through Google Play, no other payment method. Reading access starts as soon as the store
        confirms the purchase, and renews until you cancel in your Google Play account.
      </Legal>
    </>
  );
}

/** After the store confirms: "Setting up your plan", then the late note (rule 6). */
export function SettingUp({ late, onDone }: { late: boolean; onDone: () => void }) {
  const { c, s } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: s(12), paddingVertical: s(24) }}>
      <Text size={16} weight={700} center accessibilityLiveRegion="polite">
        {late ? 'Your purchase went through. Credits will appear shortly' : 'Setting up your plan'}
      </Text>
      {late ? (
        <>
          <Text size={13.5} color="ink2" center>
            You won’t be charged again. We’ll add your credits as soon as the store confirms.
          </Text>
          <Btn label="Done" block onPress={onDone} />
        </>
      ) : (
        <ActivityIndicator color={c.org} accessibilityLabel="Loading" />
      )}
    </View>
  );
}

// ─── s-plan-cancel ──────────────────────────────────────────────────────────
export function CancelHero({ title, sub, onBack }: { title: string; sub: string; onBack: () => void }) {
  const { c, s } = useTheme();
  return (
    <Hero
      barBack
      bar={
        <>
          <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          <View style={{ flex: 1 }} />
        </>
      }
      title={title}
      sub={sub}
      bodyStyle={{ paddingBottom: s(44) }}
    />
  );
}

/** "If you cancel": what is kept and lost, in plain words (rule 19). */
export function CancelSummary({
  plan,
  rollover,
  topup,
  until,
}: {
  plan: number;
  rollover: number;
  topup: number;
  until: string;
}) {
  const rows = [
    { k: 'If you cancel, you keep', v: `${n(plan)} credits until ${until}` },
    {
      k: 'If you cancel, you lose',
      v: rollover > 0 ? `${n(rollover)} rolled-over credits` : 'No rolled-over credits',
    },
    ...(topup > 0 ? [{ k: 'Top-up credits', v: `${n(topup)} stay yours` }] : []),
    { k: 'Books you unlocked', v: 'Stay yours', total: true },
  ];
  return <KeyValue rows={rows} />;
}
