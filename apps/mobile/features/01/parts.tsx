import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppIcon, IconButton, OnHero, Petals, Press, Text, useTheme } from '@arpedia/ui';

// Flow 01 pieces that mirror prototype elements one to one (`node tools/screen.mjs s-login --css`).

/** `.hero__title` (Bricolage 800, 1.02, text-wrap balance) and `.hero__sub` (14.5/1.45, max 32ch). */
export function HeroTitle({ children, size = 30 }: { children: string; size?: number }) {
  const { s } = useTheme();
  return (
    <Text
      variant="display"
      size={size}
      color="onOrg"
      textBreakStrategy="balanced"
      style={{ lineHeight: s(size) * 1.02 }}
    >
      {children}
    </Text>
  );
}
export function HeroSub({
  children,
  size = 14.5,
  center,
}: {
  children: string;
  size?: number;
  center?: boolean;
}) {
  const { s } = useTheme();
  // 32ch: Inter "0" advance is 1292/2048 = 0.631em
  return (
    <Text
      size={size}
      color="onOrg"
      center={center}
      style={{ lineHeight: s(size) * 1.45, maxWidth: s(size * 0.631 * 32) }}
    >
      {children}
    </Text>
  );
}

/** `.hero.onb-hero`: app icon, title and sub; petals 300px at right -96 / top -60. */
export function OnbHero({ title, sub }: { title: string; sub: string }) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        <Petals size={s(300)} style={{ right: s(-96), top: s(-60) }} />
        <View style={{ paddingTop: s(44), paddingHorizontal: s(20), paddingBottom: s(52), gap: s(10) }}>
          {/* .onb-logo: 56×56, radius 14, white 3px ring and soft drop shadow, margin-bottom 10 */}
          <View
            style={{
              width: s(56),
              height: s(56),
              borderRadius: s(14),
              marginBottom: s(10),
              boxShadow: `0 0 0 ${s(3)}px rgba(255,255,255,0.9), 0 ${s(8)}px ${s(20)}px rgba(26,17,0,0.18)`,
            }}
          >
            <View style={{ borderRadius: s(14), overflow: 'hidden' }}>
              <AppIcon size={56} />
            </View>
          </View>
          <HeroTitle>{title}</HeroTitle>
          <HeroSub>{sub}</HeroSub>
        </View>
      </View>
    </OnHero.Provider>
  );
}

/** `.hero.onb-step`: bar (back + progress or Skip) and title/sub; body padding 2 20 40, gap 8. */
export function OnbStepHero({
  title,
  sub,
  onBack,
  step,
  onSkip,
}: {
  title: string;
  sub: string;
  onBack?: () => void;
  /** 1–3: the progress track and "N of 3". */
  step?: number;
  /** A "Skip" text button on the right instead of the progress (s-theme). */
  onSkip?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <OnHero.Provider value>
      <View style={{ backgroundColor: c.org, overflow: 'hidden' }}>
        {/* .onb-step::after: right -120, top -110 */}
        <Petals size={s(260)} style={{ right: s(-120), top: s(-110) }} />
        {/* .hero__bar.hero__bar--back: min-height 52, padding 0 6 0 6, gap 2 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(2),
            minHeight: s(52),
            paddingLeft: s(6),
            paddingRight: s(6),
          }}
        >
          {onBack ? (
            <IconButton icon="back" label="Back" onPress={onBack} color={c.onOrg} />
          ) : (
            <View style={{ width: s(44), height: s(44) }} />
          )}
          {step ? <OnbProgress step={step} /> : <View style={{ flex: 1 }} />}
          {step ? <OnbCount step={step} /> : null}
          {onSkip ? <OnbSkip onPress={onSkip} /> : null}
        </View>
        <View style={{ paddingTop: s(2), paddingHorizontal: s(20), paddingBottom: s(40), gap: s(8) }}>
          <HeroTitle>{title}</HeroTitle>
          <HeroSub>{sub}</HeroSub>
        </View>
      </View>
    </OnHero.Provider>
  );
}

/** `.onb-progress`: flex 1, 6px track (rgba(26,17,0,.14) in every theme), night fill = step/3. */
function OnbProgress({ step }: { step: number }) {
  const { c, s } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step }}
      style={{
        flex: 1,
        height: s(6),
        borderRadius: s(6),
        backgroundColor: 'rgba(26,17,0,0.14)',
        marginHorizontal: s(4),
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${(step / 3) * 100}%`,
          height: '100%',
          borderRadius: s(6),
          backgroundColor: c.night,
        }}
      />
    </View>
  );
}

/** `.onb-count`: "1 of 3", 12.5/700, padding 0 10 0 6. */
function OnbCount({ step }: { step: number }) {
  const { s } = useTheme();
  return (
    <Text
      size={12.5}
      weight={700}
      color="onOrg"
      tabular
      oneLine
      style={{ paddingLeft: s(6), paddingRight: s(10) }}
    >
      {`${step} of 3`}
    </Text>
  );
}

/** `.onb-skip` in the bar: 14/700, padding 8px 10px (the later rule wins; 44px target via hitSlop). */
function OnbSkip({ onPress }: { onPress: () => void }) {
  const { s } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      hitSlop={s(6)}
      style={{ paddingVertical: s(8), paddingHorizontal: s(10) }}
    >
      <Text size={14} weight={700} color="onOrg" oneLine>
        Skip
      </Text>
    </Press>
  );
}

/** `.body.onb-sheet`: white sheet with 24px top corners, pulled 22px over the band. */
export function OnbSheet({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c, s } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.white,
          borderTopLeftRadius: s(24),
          borderTopRightRadius: s(24),
          marginTop: s(-22),
          zIndex: 2,
          flexGrow: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** `.divider-or`: line · "or" · line. */
export function DividerOr() {
  const { c, s } = useTheme();
  const line = <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
      {line}
      <Text size={12} color="ink3" oneLine>
        or
      </Text>
      {line}
    </View>
  );
}

/** Message under a button (network errors, rule "no popups"). */
export function FormError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <Text size={12} weight={500} color="err" accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}
