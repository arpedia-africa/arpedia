import type { ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path } from 'react-native-svg';
import { OnHero } from '../hero';
import { Press } from '../Pressable';
import { Text } from '../Text';
import { useDrift } from '../motion';
import { useTheme } from '../theme';
import { rgba } from '../tokens';

/* ─── Screen ─────────────────────────────────────────────────────────────── */
export interface ScreenProps {
  /** 'org' when the screen opens with a hero band (status bar sits on the main colour). */
  top?: 'white' | 'org';
  scroll?: boolean;
  /** Pinned below the scroll area (tab bar, footer, composer). */
  footer?: ReactNode;
  /** Pinned above the scroll area (app bar). */
  header?: ReactNode;
  children?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Safe-area screen: status bar colour, optional fixed header and footer, scrolling body. */
export function Screen({
  top = 'white',
  scroll = true,
  footer,
  header,
  children,
  contentStyle,
}: ScreenProps) {
  const { c, name } = useTheme();
  const onOrg = top === 'org';
  const lightIcons = onOrg && name !== 'sunflower';
  const Body = scroll ? ScrollView : View;
  return (
    <View style={{ flex: 1, backgroundColor: onOrg ? c.org : c.white }}>
      <StatusBar style={lightIcons ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {header}
        <Body
          style={{ flex: 1, backgroundColor: c.white }}
          {...(scroll
            ? { contentContainerStyle: contentStyle, showsVerticalScrollIndicator: false }
            : { style: [{ flex: 1, backgroundColor: c.white }, contentStyle] })}
        >
          {children}
        </Body>
        {footer}
      </SafeAreaView>
    </View>
  );
}

/* ─── Petals ─────────────────────────────────────────────────────────────── */
// The prototype draws petals as repeating-conic-gradient(14° on, 16° off) masked to a ring
// (inner edge at 22–23% of the farthest-corner radius), clipped to a circle.
function petalPath(size: number) {
  const c = size / 2;
  const outer = c;
  const inner = Math.hypot(c, c) * 0.225;
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
  };
  let d = '';
  for (let a = 0; a < 360; a += 30) {
    const b = a + 14;
    d += `M${pt(inner, a)}L${pt(outer, a)}A${outer} ${outer} 0 0 1 ${pt(outer, b)}L${pt(inner, b)}A${inner} ${inner} 0 0 0 ${pt(inner, a)}Z`;
  }
  return d;
}

export interface PetalsProps {
  size: number;
  /** Petal alpha before the theme's petal-k (hero .72, promo .78). */
  alpha?: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
  reverse?: boolean;
}

/** Sunflower petal ring that drifts (one turn per 140 s; still under reduced motion). */
export function Petals({ size, alpha = 0.72, opacity = 0.55, style, reverse }: PetalsProps) {
  const { c } = useTheme();
  const drift = useDrift(undefined, reverse);
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, opacity }, style, drift]}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Path d={petalPath(size)} fill={rgba(c.petalRgb, alpha * c.petalK)} />
      </Svg>
    </Animated.View>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────── */
export interface HeroProps {
  /** Top bar contents (wordmark, back button, icon buttons). */
  bar?: ReactNode;
  /** Back button variant of the bar: tighter left padding. */
  barBack?: boolean;
  title?: string;
  /** Keep the title on one line (shrinks to fit on narrow phones instead of wrapping). */
  titleOneLine?: boolean;
  xl?: boolean;
  sub?: string;
  /** Petals at the bottom-left instead of the top-right. */
  low?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Overrides for `.hero__body` (e.g. `.bk-hero .hero__body`: centred, padding 0 16 46). */
  bodyStyle?: StyleProp<ViewStyle>;
}

/** Full-width main-colour band with drifting sunflower petals (`.hero`). */
export function Hero({
  bar,
  barBack,
  title,
  titleOneLine,
  xl,
  sub,
  low,
  children,
  style,
  bodyStyle,
}: HeroProps) {
  const { c, s } = useTheme();
  const size = s(260);
  return (
    <OnHero.Provider value>
      <View style={[{ backgroundColor: c.org, overflow: 'hidden' }, style]}>
        <Petals
          size={size}
          style={low ? { left: s(-110), bottom: s(-130) } : { right: s(-110), top: s(-90) }}
        />
        {bar ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(2),
              minHeight: s(52),
              paddingLeft: s(barBack ? 6 : 16),
              paddingRight: s(6),
            }}
          >
            {bar}
          </View>
        ) : null}
        {title || sub || children ? (
          <View
            style={[
              { paddingTop: s(4), paddingHorizontal: s(16), paddingBottom: s(20), gap: s(12) },
              bodyStyle,
            ]}
          >
            {title ? (
              <Text
                variant="display"
                size={xl ? 36 : 30}
                color="onOrg"
                oneLine={titleOneLine}
                // text-wrap: balance
                textBreakStrategy="balanced"
                style={{ lineHeight: s(xl ? 36 : 30) * 1.02 }}
              >
                {title}
              </Text>
            ) : null}
            {sub ? (
              // max-width: 32ch (Inter "0" advance 0.631em at 14.5px ≈ 292.7px)
              <Text size={14.5} color="onOrg" style={{ lineHeight: s(14.5) * 1.45, maxWidth: s(292.7) }}>
                {sub}
              </Text>
            ) : null}
            {children}
          </View>
        ) : null}
      </View>
    </OnHero.Provider>
  );
}

/* ─── Section ────────────────────────────────────────────────────────────── */
export interface SectionProps {
  title?: string;
  sub?: string;
  link?: string;
  onLink?: () => void;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Content block with the 24px rhythm (`.section`). */
export function Section({ title, sub, link, onLink, children, style }: SectionProps) {
  const { s } = useTheme();
  return (
    <View style={[{ paddingTop: s(24) }, style]}>
      {title ? (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: s(12),
            paddingHorizontal: s(16),
            paddingBottom: s(12),
          }}
        >
          <View style={{ flex: 1, gap: s(2) }}>
            {/* .section__title inherits the device line-height 1.45 (not the h3 scale's 1.2) */}
            <Text variant="h3" oneLine style={{ lineHeight: s(18) * 1.45 }}>
              {title}
            </Text>
            {sub ? (
              <Text size={12.5} color="ink3" oneLine>
                {sub}
              </Text>
            ) : null}
          </View>
          {link ? (
            <Press onPress={onLink} hitSlop={12} accessibilityRole="link">
              <Text variant="label" color="orgInk" oneLine>
                {link}
              </Text>
            </Press>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Small grey label above a group (`.group-label`). */
export function GroupLabel({ children }: { children: string }) {
  const { s } = useTheme();
  return (
    <Text
      size={12}
      weight={700}
      color="ink3"
      oneLine
      style={{ paddingHorizontal: s(16), paddingBottom: s(8) }}
    >
      {children}
    </Text>
  );
}

/** 1px rule (`.divider`). */
export function Divider({ inset = false }: { inset?: boolean }) {
  const { c, s } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.line, marginHorizontal: inset ? s(16) : 0 }} />;
}

/** Bottom inset helper for footers. */
export function useBottomInset(min: number) {
  const insets = useSafeAreaInsets();
  const { s } = useTheme();
  return Math.max(s(min), insets.bottom + s(6));
}
