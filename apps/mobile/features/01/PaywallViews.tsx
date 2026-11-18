import { useState, type ReactNode } from 'react';
import { ActivityIndicator, PixelRatio, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { approxBooks, formatNaira, perMonthNaira, type Plan, type PlanId } from '@arpedia/core';
import {
  Avatar,
  Btn,
  Cell,
  Cover,
  Group,
  Hero,
  Icon,
  OnHero,
  Petals,
  Pill,
  Press,
  Section,
  Skeleton,
  Text,
  useBottomInset,
  useTheme,
  type CoverTone,
} from '@arpedia/ui';
import { FormError, OnbSheet } from './parts';

// s-plans-onboard, s-plans-all and s-all-set. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-plans-onboard s-plans-all s-all-set --css`).

const RING_OFF = '#C7CBD1';
const n = (v: number) => v.toLocaleString('en-NG');

/** Words for each billing period. */
const PERIOD: Record<PlanId, { every: string; per: string; bill: string }> = {
  monthly: { every: 'every month', per: 'month', bill: 'every month' },
  quarterly: { every: 'every 3 months', per: 'quarter', bill: 'every 3 months' },
  yearly: { every: 'once a year', per: 'year', bill: 'every year' },
};
const BADGE: Partial<Record<PlanId, string>> = { quarterly: 'Most popular', yearly: 'Best value' };

/** "Billed by Google Play every 3 months until you cancel." */
export const billedLine = (id: PlanId) => `Billed by Google Play ${PERIOD[id].bill} until you cancel.`;

/** Inset ring that takes no layout space (CSS `box-shadow: inset 0 0 0 Npx`). */
function Ring({ width, color, radius }: { width: number; color: string; radius: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, borderRadius: radius, borderWidth: width, borderColor: color }}
    />
  );
}

/** `.dot`: 20px radio; off = 1.5 grey ring, on = 6px main-colour ring. */
function Dot({ on, style }: { on: boolean; style?: object }) {
  const { c, s } = useTheme();
  return (
    <View
      style={[
        {
          width: s(20),
          height: s(20),
          borderRadius: s(10),
          borderWidth: on ? s(6) : s(1.5),
          borderColor: on ? c.org : RING_OFF,
        },
        style,
      ]}
    />
  );
}

// ─── s-plans-onboard ────────────────────────────────────────────────────────
export interface PaywallBook {
  id: string;
  title: string;
  author: string;
}

const FAN_TONES: CoverTone[] = ['c6', 'c1', 'c2'];

/**
 * `.pw-fan`: 220×150, covers absolutely placed at left 50% then
 * translateX(-112%) rotate(-10deg) translateY(10px) · translateX(-50%) · translateX(12%) rotate(10deg) translateY(10px).
 */
function Fan({ books }: { books: PaywallBook[] }) {
  const { s } = useTheme();
  const order = books.length === 3 ? [books[1]!, books[0]!, books[2]!] : books;
  const spots = [
    { w: 88, x: -1.12, rot: -10, top: 8, z: 1 },
    { w: 104, x: -0.5, rot: 0, top: 0, z: 2 },
    { w: 88, x: 0.12, rot: 10, top: 8, z: 1 },
  ];
  // One or two books: centre first, then left.
  const slots = order.length === 3 ? [0, 1, 2] : order.length === 2 ? [0, 1] : [1];
  return (
    <View style={{ height: s(150), width: s(220), marginTop: s(2), marginBottom: s(6) }}>
      {order.map((b, i) => {
        const at = spots[slots[i]!]!;
        return (
          <View
            key={b.id}
            style={{
              position: 'absolute',
              left: s(110),
              top: s(at.top),
              zIndex: at.z,
              transform: [
                { translateX: s(at.w * at.x) },
                { rotate: `${at.rot}deg` },
                { translateY: s(at.rot ? 10 : 0) },
              ],
            }}
          >
            {/* .pw-fan .cv: own drop shadow (no spine); text centred by .pw-hero */}
            <Cover
              title={b.title}
              author={b.author}
              size={at.w as 88 | 104}
              tone={FAN_TONES[slots[i]!]}
              center
              boxShadow={`0 ${s(16)}px ${s(28)}px -${s(14)}px rgba(0,0,0,0.55)`}
            />
          </View>
        );
      })}
    </View>
  );
}

/** `.hero.pw-hero`: ✕ and Restore, covers, centred title (28) and sub (14). */
export function PaywallHero({
  title,
  sub,
  books,
  onClose,
  onRestore,
  restoring,
}: {
  title: string;
  sub: string;
  books: PaywallBook[];
  onClose: () => void;
  onRestore: () => void;
  restoring?: boolean;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        <Petals size={s(260)} style={{ right: s(-110), top: s(-90) }} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(2),
            minHeight: s(52),
            paddingLeft: s(16),
            paddingRight: s(6),
          }}
        >
          {/* .pw-x: 40 circle, white 22% (44 target via hitSlop) */}
          <Press
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Not now, browse first"
            hitSlop={s(2)}
            style={{
              width: s(40),
              height: s(40),
              borderRadius: s(20),
              backgroundColor: 'rgba(255,255,255,0.22)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size="s" color={c.onOrg} />
          </Press>
          <View style={{ flex: 1 }} />
          {/* .pw-restore: 13/700, padding 8 10 */}
          <Press
            onPress={restoring ? undefined : onRestore}
            accessibilityRole="button"
            accessibilityState={{ busy: !!restoring }}
            hitSlop={s(6)}
            style={{ paddingVertical: s(8), paddingHorizontal: s(10), opacity: restoring ? 0.6 : 1 }}
          >
            <Text size={13} weight={700} color="onOrg" oneLine>
              Restore
            </Text>
          </Press>
        </View>
        {/* .pw-hero .hero__body: centred, padding 0 20 26, gap 10 */}
        <View
          style={{
            alignItems: 'center',
            paddingTop: 0,
            paddingHorizontal: s(20),
            paddingBottom: s(26),
            gap: s(10),
          }}
        >
          {books.length ? <Fan books={books} /> : null}
          <Text
            variant="display"
            size={28}
            color="onOrg"
            center
            accessibilityRole="header"
            textBreakStrategy="balanced"
            style={{ lineHeight: s(28) * 1.02 }}
          >
            {title}
          </Text>
          {/* max-width 32ch: Inter "0" advance is 0.631em */}
          <Text
            size={14}
            color="onOrg"
            center
            style={{ lineHeight: s(14) * 1.45, maxWidth: s(14 * 0.631 * 32) }}
          >
            {sub}
          </Text>
        </View>
      </View>
    </OnHero.Provider>
  );
}

/** `.pw-badge`: night pill at top -10 / left 12; `--quiet` = tint 2 with a tint ring. */
function Badge({ label, quiet }: { label: string; quiet?: boolean }) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: s(-10),
        left: s(12),
        height: s(22),
        paddingHorizontal: s(10),
        borderRadius: 999,
        backgroundColor: quiet ? c.orgTint2 : c.night,
        justifyContent: 'center',
      }}
    >
      {quiet ? <Ring width={1} color={c.orgTint} radius={999} /> : null}
      <Text size={11.5} weight={700} color={quiet ? 'onOrg' : '#FFFFFF'} oneLine>
        {label}
      </Text>
    </View>
  );
}

/** `.pw-plan`: radius 18, padding 22 14 14; selected = 2.5 main-colour ring on tint 2. */
function PlanCard({ plan, on, onPress }: { plan: Plan; on: boolean; onPress: () => void }) {
  const { c, s, bw } = useTheme();
  const badge = BADGE[plan.id];
  const line = (size: number) => ({ lineHeight: s(size) * 1.45 });
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        flex: 1,
        borderRadius: s(18),
        paddingTop: s(22),
        paddingHorizontal: s(14),
        paddingBottom: s(14),
        backgroundColor: on ? c.orgTint2 : c.white,
        gap: s(2),
      }}
    >
      <Ring width={s(on ? 2.5 : 1.5)} color={on ? c.org : c.line} radius={s(18)} />
      {badge ? <Badge label={badge} quiet={plan.id === 'yearly'} /> : null}
      <Dot on={on} style={{ position: 'absolute', top: s(14), right: s(12) }} />
      <Text size={13} weight={700} color="ink2" oneLine style={line(13)}>
        {plan.name}
      </Text>
      <Text
        family="display"
        weight={800}
        size={28}
        oneLine
        style={{ letterSpacing: s(28) * -0.02, lineHeight: s(28) * 1.05, marginTop: s(4) }}
      >
        {formatNaira(perMonthNaira(plan))}
        <Text family="ui" size={13} weight={600} color="ink2" style={{ letterSpacing: 0 }}>
          {' /month'}
        </Text>
      </Text>
      <Text size={12.5} color="ink2" style={line(12.5)}>
        {`${formatNaira(plan.priceNaira)} ${PERIOD[plan.id].every}`}
      </Text>
      {/* .gets: margin-top 10, padding-top 10, 1px dashed rule */}
      <View style={{ marginTop: s(10), paddingTop: bw(1) + s(10) }}>
        <DashedRule color={c.line} />
        <Text size={13.5} weight={700} style={{ lineHeight: s(13.5) * 1.35 }}>
          {`${n(plan.credits)} credits`}
        </Text>
        <Text size={12.5} style={{ lineHeight: s(12.5) * 1.35 }}>
          {`≈ ${approxBooks(plan.credits)} books every ${PERIOD[plan.id].per}`}
        </Text>
      </View>
    </Press>
  );
}

/**
 * `border-top: 1px dashed` as Chrome draws it: the width floored to whole device pixels, dashes 3×
 * and gaps 2× that width, the gap stretched so the rule starts and ends on a whole dash (Blink's
 * StrokeData::SelectBestDashGap). Android's own dashed border uses 3×/3× of the unrounded width.
 */
function DashedRule({ color }: { color: string }) {
  const { bw } = useTheme();
  const [width, setWidth] = useState(0);
  const dpr = PixelRatio.get();
  const t = bw(1) * dpr;
  const len = width * dpr;
  const dash = 3 * t;
  const gap = 2 * t;
  const fewer = Math.floor((len + gap) / (dash + gap));
  const gapFewer = (len - fewer * dash) / (fewer - 1);
  const gapMore = (len - (fewer + 1) * dash) / fewer;
  const best = gapMore <= 0 || Math.abs(gapFewer - gap) < Math.abs(gapMore - gap) ? gapFewer : gapMore;
  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && len > dash * 2 ? (
        <Svg width={width} height={2}>
          <Line
            x1={0}
            y1={t / dpr / 2}
            x2={width}
            y2={t / dpr / 2}
            stroke={color}
            strokeWidth={t / dpr}
            strokeDasharray={[dash / dpr, best / dpr]}
          />
        </Svg>
      ) : null}
    </View>
  );
}

/** Skeleton price card while store prices load (never show a price before it loads). */
function PlanSkeleton() {
  return <Skeleton height={178} radius={18} style={{ flex: 1 }} />;
}

/** `.pw-step`: 13.5/1.4 ink 2, title 14 ink; marker 16 at left -26, `.on` = accent with a white ring. */
function HowStep({ title, body, on, last }: { title: string; body: string; on?: boolean; last?: boolean }) {
  const { c, s } = useTheme();
  return (
    <View style={{ paddingBottom: last ? 0 : s(14) }}>
      {on ? (
        <View
          style={{
            position: 'absolute',
            left: s(-28),
            top: 0,
            width: s(20),
            height: s(20),
            borderRadius: s(10),
            backgroundColor: c.acc,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: s(16),
              height: s(16),
              borderRadius: s(8),
              borderWidth: s(3),
              borderColor: c.white,
              backgroundColor: c.acc,
            }}
          />
        </View>
      ) : (
        <View
          style={{
            position: 'absolute',
            left: s(-26),
            top: s(2),
            width: s(16),
            height: s(16),
            borderRadius: s(8),
            borderWidth: s(2),
            borderColor: RING_OFF,
            backgroundColor: c.white,
          }}
        />
      )}
      <Text size={14} weight={700} style={{ lineHeight: s(14) * 1.4 }}>
        {title}
      </Text>
      <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.4 }}>
        {body}
      </Text>
    </View>
  );
}

/** `.pw-how`: grey panel, "How it works" and the four-step timeline. */
function HowItWorks({ credits, reminderDay }: { credits: number; reminderDay: number }) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        marginTop: s(22),
        marginHorizontal: s(16),
        padding: s(16),
        borderRadius: s(18),
        backgroundColor: c.surface,
      }}
    >
      <Text family="display" weight={800} size={16} style={{ marginBottom: s(12) }}>
        How it works
      </Text>
      <View style={{ paddingLeft: s(26) }}>
        {/* .pw-steps::before: 2px line, accent for the first 34%, grey after */}
        <View
          style={{
            position: 'absolute',
            left: s(7),
            top: s(6),
            bottom: s(6),
            width: s(2),
            overflow: 'hidden',
          }}
        >
          <View style={{ flex: 34, backgroundColor: c.acc }} />
          <View style={{ flex: 66, backgroundColor: '#D1D5DB' }} />
        </View>
        <HowStep
          on
          title="Today"
          body={`${n(credits)} credits land in your account. Unlock a whole book, or pay as you read, chapter by chapter. Same price either way, and the first 10% is always free.`}
        />
        <HowStep
          title="Every renewal"
          body="Your credits refill. Anything unused rolls over for one more period."
        />
        <HowStep title={`Day ${reminderDay}`} body="We remind you 3 days before your plan renews." />
        <HowStep
          last
          title="Anytime"
          body="Pause or cancel in two taps. Books you unlocked stay in your library for good."
        />
      </View>
    </View>
  );
}

export function PaywallBody({
  plans,
  selected,
  reminderDay,
  onSelect,
  onMore,
}: {
  /** Quarterly and Yearly; null while store prices load. */
  plans: Plan[] | null;
  selected: Plan;
  reminderDay: number;
  onSelect: (id: PlanId) => void;
  onMore: () => void;
}) {
  const { s } = useTheme();
  return (
    // inline padding-bottom 18 on the prototype's .body
    <OnbSheet style={{ paddingBottom: s(18) }}>
      {/* .pw-proof (rating and quote) is hidden until real figures exist (Q90). */}
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', gap: s(10), paddingTop: s(20), paddingHorizontal: s(16) }}
      >
        {plans
          ? plans.map((p) => (
              <PlanCard key={p.id} plan={p} on={p.id === selected.id} onPress={() => onSelect(p.id)} />
            ))
          : [0, 1].map((i) => <PlanSkeleton key={i} />)}
      </View>
      {/* .pw-more: 13.5/700, padding-top 12 */}
      <Press onPress={onMore} accessibilityRole="link" style={{ paddingTop: s(12), alignItems: 'center' }}>
        <Text size={13.5} weight={700} color="orgInk" oneLine>
          See monthly plan
        </Text>
      </Press>
      <HowItWorks credits={selected.credits} reminderDay={reminderDay} />
    </OnbSheet>
  );
}

/** `.pw-foot`: raised white foot, 54px button, the billing line with Terms and Privacy. */
export function PaywallFoot({
  plan,
  disabled,
  busy,
  error,
  offline,
  onContinue,
  onOffline,
  onTerms,
  onPrivacy,
}: {
  plan: Plan | null;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  offline?: boolean;
  onContinue: () => void;
  onOffline: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(18);
  return (
    <View
      style={{
        paddingTop: s(12),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        backgroundColor: c.white,
        gap: s(8),
        zIndex: 3,
        boxShadow: `0 -${s(10)}px ${s(24)}px -${s(18)}px rgba(0,0,0,0.35)`,
      }}
    >
      {offline ? (
        <Btn label="Continue offline" size="lg" block onPress={onOffline} />
      ) : (
        <Btn
          label={plan ? `Continue · ${formatNaira(plan.priceNaira)}` : 'Continue'}
          size="lg"
          block
          disabled={disabled || !plan}
          loading={busy}
          onPress={onContinue}
        />
      )}
      <FormError>{error}</FormError>
      {plan && !offline ? (
        <Text size={12} color="ink3" center style={{ lineHeight: s(12) * 1.45 }}>
          {`${billedLine(plan.id)} `}
          <Text size={12} weight={600} color="ink2" onPress={onTerms} accessibilityRole="link">
            Terms
          </Text>
          {' · '}
          <Text size={12} weight={600} color="ink2" onPress={onPrivacy} accessibilityRole="link">
            Privacy
          </Text>
        </Text>
      ) : null}
    </View>
  );
}

// ─── s-plans-all ────────────────────────────────────────────────────────────
/** `.pw-row`: radius 16, padding 14, gap 12; selected = 2.5 main-colour ring on tint 2. */
function PlanRow({ plan, on, onPress }: { plan: Plan; on: boolean; onPress: () => void }) {
  const { c, s } = useTheme();
  const badge = BADGE[plan.id];
  const books = approxBooks(plan.credits);
  const sub =
    plan.id === 'monthly'
      ? `${n(plan.credits)} credits · ≈ ${books} books a month`
      : `${n(plan.credits)} credits ≈ ${books} books · ${formatNaira(perMonthNaira(plan))} a month`;
  const line = (size: number) => ({ lineHeight: s(size) * 1.45 });
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        padding: s(14),
        borderRadius: s(16),
        backgroundColor: on ? c.orgTint2 : c.white,
      }}
    >
      <Ring width={s(on ? 2.5 : 1.5)} color={on ? c.org : c.line} radius={s(16)} />
      <Dot on={on} />
      <View style={{ flex: 1, minWidth: 0, gap: s(1) }}>
        <Text size={15} weight={700} oneLine style={line(15)}>
          {badge ? `${plan.name} · ${badge}` : plan.name}
        </Text>
        <Text size={12.5} color="ink2" style={line(12.5)}>
          {sub}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text size={15} weight={800} oneLine style={line(15)}>
          {formatNaira(plan.priceNaira)}
        </Text>
        <Text size={12.5} weight={500} color="ink2" oneLine style={line(12.5)}>
          {PERIOD[plan.id].every}
        </Text>
      </View>
    </Press>
  );
}

/** `.pw-list` inside the All plans sheet: padding 16, gap 10. */
export function PlansAllList({
  plans,
  selected,
  onSelect,
}: {
  plans: Plan[];
  selected: PlanId;
  onSelect: (id: PlanId) => void;
}) {
  const { s } = useTheme();
  return (
    // The sheet body pads 16 18; .pw-list pads 16 on every side.
    <View accessibilityRole="radiogroup" style={{ gap: s(10), marginHorizontal: s(-2) }}>
      {plans.map((p) => (
        <PlanRow key={p.id} plan={p} on={p.id === selected} onPress={() => onSelect(p.id)} />
      ))}
    </View>
  );
}

// ─── s-all-set ──────────────────────────────────────────────────────────────
export interface AllSetStep {
  key: string;
  title: string;
  sub: string;
  lead?: ReactNode;
  onPress: () => void;
}

export const BookLead = ({ title }: { title: string }) => <Cover title={title} size={40} tone="c1" />;
export const PersonLead = ({ name }: { name: string }) => <Avatar name={name} tone="m" />;

/** `.hero.hero--low` with the xl title, the credits pill and the plan pill. */
export function AllSetHero({ credits, planLine }: { credits: number | null; planLine: string | null }) {
  const { s } = useTheme();
  return (
    <Hero
      low
      xl
      bar={<View style={{ flex: 1 }} />}
      title="You're all set!"
      sub="Subscription active. Time to find your next read."
    >
      {credits != null || planLine ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s(8) }}>
          {credits != null ? (
            <Pill tone="night" iconName="coin" label={`${n(credits)} credits added`} />
          ) : null}
          {planLine ? <Pill label={planLine} /> : null}
        </View>
      ) : null}
    </Hero>
  );
}

export function AllSetBody({ steps }: { steps: AllSetStep[] }) {
  if (!steps.length) return null;
  return (
    <Section title="Start here">
      <Group>
        {steps.map((st) => (
          <Cell key={st.key} title={st.title} sub={st.sub} lead={st.lead} chevron onPress={st.onPress} />
        ))}
      </Group>
    </Section>
  );
}

/** `.foot.flat`: padding 12 16 26, no top rule; Go to Home. */
export function AllSetFoot({ onHome }: { onHome: () => void }) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(26);
  return (
    <View
      style={{ paddingTop: s(12), paddingHorizontal: s(16), paddingBottom: bottom, backgroundColor: c.white }}
    >
      <Btn label="Go to Home" icon="home" block onPress={onHome} />
    </View>
  );
}

/** "Setting up your credits" while the store webhook is late (Server notes). */
export function AllSetPending({ late, onRefresh }: { late: boolean; onRefresh: () => void }) {
  const { c, s } = useTheme();
  return (
    <View style={{ padding: s(16), gap: s(12), alignItems: 'center' }}>
      <Text size={14.5} weight={600} center>
        Setting up your credits
      </Text>
      {late ? (
        <Btn label="Refresh" variant="s" size="md" onPress={onRefresh} />
      ) : (
        <ActivityIndicator color={c.org} accessibilityLabel="Loading" />
      )}
    </View>
  );
}
