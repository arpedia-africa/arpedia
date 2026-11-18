import type { ReactNode } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { nightOnHero, useOnHero } from '../hero';
import { Icon, type IconName } from '../Icon';
import { useFill } from '../motion';
import { Text } from '../Text';
import { useTheme } from '../theme';
import { avatarTones, covers, type AvatarTone, type CoverTone } from '../tokens';

/* ─── Cover ──────────────────────────────────────────────────────────────── */
export type CoverSize = 40 | 48 | 64 | 88 | 104 | 128 | 150;
const coverH: Record<CoverSize, number> = { 40: 60, 48: 72, 64: 96, 88: 130, 104: 154, 128: 190, 150: 222 };

/** CSS gradient angle (deg) → expo-linear-gradient start/end points. */
function gradientPoints(deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  const x = Math.cos(a) / 2;
  const y = Math.sin(a) / 2;
  return { start: { x: 0.5 - x, y: 0.5 - y }, end: { x: 0.5 + x, y: 0.5 + y } };
}

function CoverArt({ tone, w, h, s }: { tone: CoverTone; w: number; h: number; s: (n: number) => number }) {
  // Sample-cover decorations from the prototype (.cv.cN::before). Real books use their cover image.
  const white = (a: number) => `rgba(255,255,255,${a})`;
  switch (tone) {
    case 'c1':
    case 'c6': {
      // ::before: right -22%, top -14%, width 80%, round; 12° petals every 30°, centre disc at 28% of
      // the farthest-corner radius.
      const r = w * 0.4;
      const cx = w * 0.82;
      const cy = -h * 0.14 + r;
      const p = (deg: number) => {
        const t = (deg * Math.PI) / 180;
        return `${(cx + r * Math.sin(t)).toFixed(1)} ${(cy - r * Math.cos(t)).toFixed(1)}`;
      };
      let path = '';
      for (let a = 0; a < 360; a += 30) path += `M${cx} ${cy}L${p(a)}A${r} ${r} 0 0 1 ${p(a + 12)}Z`;
      return (
        <Svg width={w} height={h} style={{ position: 'absolute' }}>
          <Path d={path} fill={white(0.22)} />
          <Circle cx={cx} cy={cy} r={r * Math.SQRT2 * 0.28} fill={white(0.35)} />
        </Svg>
      );
    }
    case 'c2':
      return (
        <View style={{ position: 'absolute', left: s(8), right: s(8), top: h * 0.14 }}>
          <View style={{ height: 1, backgroundColor: white(0.5) }} />
          <View style={{ height: 1, marginTop: s(5), backgroundColor: white(0.3) }} />
        </View>
      );
    case 'c3': {
      // ::before: left 22%, top 8%, 56% × 52%; two 8%-wide #111 bands across the 135° and 45° gradients.
      const bw = w * 0.56;
      const bh = h * 0.52;
      const band = ((bw + bh) / Math.SQRT2) * 0.08;
      const cx = bw / 2;
      const cy = bh / 2;
      const far = bw + bh;
      return (
        <View
          style={{
            position: 'absolute',
            left: w * 0.22,
            top: h * 0.08,
            width: bw,
            height: bh,
            overflow: 'hidden',
          }}
        >
          <Svg width={bw} height={bh}>
            <Line x1={cx - far} y1={cy + far} x2={cx + far} y2={cy - far} stroke="#111" strokeWidth={band} />
            <Line x1={cx - far} y1={cy - far} x2={cx + far} y2={cy + far} stroke="#111" strokeWidth={band} />
          </Svg>
        </View>
      );
    }
    case 'c5': {
      // ::before: inset auto -10px 42% -10px, height 22%; 6px stripes every 12px.
      const bh = h * 0.22;
      const n = Math.ceil((w + s(20)) / s(12));
      return (
        <Svg
          width={w}
          height={bh}
          style={{ position: 'absolute', left: 0, top: h - h * 0.42 - bh, overflow: 'visible' }}
        >
          {Array.from({ length: n }, (_, i) => (
            <Rect key={i} x={-s(10) + i * s(12)} y={0} width={s(6)} height={bh} fill={white(0.12)} />
          ))}
        </Svg>
      );
    }
    case 'c8': {
      // ::before: top 18%, height 30%; 45° stripes, 4px on / 6px off.
      const bh = h * 0.3;
      const n = Math.ceil((w + bh) / Math.SQRT2 / s(10)) + 1;
      return (
        <View
          style={{ position: 'absolute', left: 0, top: h * 0.18, width: w, height: bh, overflow: 'hidden' }}
        >
          <Svg width={w} height={bh}>
            {Array.from({ length: n }, (_, k) => {
              const cc = Math.SQRT2 * s(10) * k + Math.SQRT2 * s(2);
              return (
                <Line
                  key={k}
                  x1={0}
                  y1={bh - cc}
                  x2={w + bh}
                  y2={w + bh + bh - cc}
                  stroke={white(0.14)}
                  strokeWidth={s(4)}
                />
              );
            })}
          </Svg>
        </View>
      );
    }
    case 'c4':
      return (
        <View
          style={{
            position: 'absolute',
            left: w / 2 - w * 0.23,
            top: h * 0.2,
            width: w * 0.46,
            height: w * 0.46,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: white(0.5),
          }}
        />
      );
    case 'c7': {
      // inset 12% 12% auto, height 34%, radius 50% 50% 0 0 (elliptical), 1.5px border, no bottom edge.
      const bw = w * 0.76;
      const bh = h * 0.34;
      const sw = 1.5;
      return (
        <Svg
          width={bw}
          height={bh}
          style={{ position: 'absolute', left: w * 0.12, top: h * 0.12, overflow: 'visible' }}
        >
          <Path
            d={`M${sw / 2} ${bh}L${sw / 2} ${bh / 2}A${bw / 2 - sw / 2} ${bh / 2 - sw / 2} 0 0 1 ${bw - sw / 2} ${bh / 2}L${bw - sw / 2} ${bh}`}
            fill="none"
            stroke={white(0.45)}
            strokeWidth={sw}
          />
        </Svg>
      );
    }
    default:
      return null;
  }
}

export interface CoverProps {
  title: string;
  author?: string;
  /** Design width: 40 · 48 · 64 · 88 · 104 · 128 · 150 (2:3). */
  size?: CoverSize;
  /** Real cover image; without it a sample gradient cover is drawn. */
  uri?: string;
  tone?: CoverTone;
  /** Fill the parent's width (cover grids) instead of a fixed size. */
  fluid?: boolean;
  /** Centred title and author (a parent with `text-align:center`, e.g. `.pw-hero`). */
  center?: boolean;
  /** CSS box-shadow that replaces `.cv`'s (drop shadow and the inset spine), e.g. `.pw-fan .cv`. */
  boxShadow?: string;
}

/** `.cv`: 2:3 book cover with a soft drop shadow and a spine highlight. */
export function Cover({ title, author, size = 104, uri, tone = 'c1', fluid, center, boxShadow }: CoverProps) {
  const { s } = useTheme();
  const w = s(size);
  const h = s(coverH[size]);
  const [from, to, deg, fg] = covers[tone];
  const tiny = size <= 48;
  const titleSize = size === 150 ? 17 : size === 128 ? 15 : tiny ? 7.5 : 12;
  const frame: ViewStyle = {
    width: fluid ? '100%' : w,
    height: fluid ? undefined : h,
    aspectRatio: fluid ? 2 / 3 : undefined,
    borderRadius: s(6),
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: s(8),
  };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={author ? `${title} by ${author}` : title}
      style={{
        borderRadius: s(6),
        ...(boxShadow
          ? { boxShadow }
          : {
              shadowColor: '#000',
              shadowOpacity: 0.5,
              shadowRadius: s(8),
              shadowOffset: { width: 0, height: s(8) },
              elevation: 6,
            }),
        width: fluid ? '100%' : w,
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: frame.width,
            height: frame.height,
            aspectRatio: frame.aspectRatio,
            borderRadius: frame.borderRadius,
          }}
          resizeMode="cover"
        />
      ) : (
        <View style={frame}>
          <LinearGradient
            colors={[from, to]}
            {...gradientPoints(deg)}
            style={{ position: 'absolute', inset: 0 }}
          />
          <CoverArt tone={tone} w={w} h={h} s={s} />
          {boxShadow ? null : (
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: s(3),
                backgroundColor: 'rgba(255,255,255,0.18)',
              }}
            />
          )}
          {/* Word by word, like the browser: lines break at spaces only, and a word wider than
              the cover is clipped (Android would otherwise split it, "Harm/attan"). */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: center ? 'center' : undefined,
              columnGap: s(titleSize) * 0.25,
            }}
          >
            {title.split(/\s+/).map((word, i) => (
              <Text
                key={i}
                family="reading"
                weight={600}
                size={titleSize}
                color={fg}
                numberOfLines={1}
                ellipsizeMode="clip"
                style={{ lineHeight: s(titleSize) * 1.15 }}
              >
                {word}
              </Text>
            ))}
          </View>
          {author && !tiny ? (
            <Text
              size={7.5}
              color={tone === 'c3' ? '#222222' : fg}
              center={center}
              style={{
                opacity: 0.85,
                letterSpacing: s(7.5) * 0.05,
                marginTop: s(3),
                textTransform: 'uppercase',
              }}
            >
              {author}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ─── Avatar ─────────────────────────────────────────────────────────────── */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const avatarDims: Record<AvatarSize, [number, number]> = {
  xs: [20, 8],
  sm: [26, 10],
  md: [36, 12],
  lg: [52, 17],
  xl: [88, 28],
};

export interface AvatarProps {
  name: string;
  uri?: string;
  size?: AvatarSize;
  tone?: AvatarTone;
  square?: boolean;
  /** White ring (AvatarStack). */
  ring?: boolean;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** `.av`: photo or initials on a tone. */
export function Avatar({ name, uri, size = 'md', tone = 'm', square, ring }: AvatarProps) {
  const { c, s } = useTheme();
  const [d, fs] = avatarDims[size];
  const style: ViewStyle = {
    width: s(d),
    height: s(d),
    borderRadius: square ? s(14) : 999,
    backgroundColor: avatarTones[tone],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };
  const face = (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel={name}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text size={fs} weight={700} color="#FFFFFF" oneLine>
          {initials(name)}
        </Text>
      )}
    </View>
  );
  if (!ring) return face;
  // `.stack .av`: box-shadow 0 0 0 2px white, drawn outside the avatar without taking layout space.
  const r = s(2);
  return (
    <View
      style={{
        margin: -r,
        padding: r,
        borderRadius: square ? s(14) + r : 999,
        backgroundColor: c.white,
      }}
    >
      {face}
    </View>
  );
}

/** Overlapping avatars (`.stack`). */
export function AvatarStack({ people, size = 'sm' }: { people: AvatarProps[]; size?: AvatarSize }) {
  const { s } = useTheme();
  return (
    <View style={{ flexDirection: 'row' }}>
      {people.map((p, i) => (
        <View key={p.name + i} style={{ marginLeft: i === 0 ? 0 : -s(8) }}>
          <Avatar {...p} size={size} ring />
        </View>
      ))}
    </View>
  );
}

/* ─── Pill, Count, Unread ────────────────────────────────────────────────── */
export type PillTone = 'brand' | 'night' | 'ok' | 'warn' | 'err' | 'info' | 'grey';

export function Pill({
  label,
  tone = 'brand',
  icon,
  iconName,
}: {
  label: string;
  tone?: PillTone;
  icon?: ReactNode;
  /** Sprite icon (`.ico.xs`) drawn in the pill's text colour. */
  iconName?: IconName;
}) {
  const { c, s, name } = useTheme();
  const onHero = useOnHero();
  const look = {
    brand: [c.orgTint, c.orgInk],
    night: name === 'night' && onHero ? [nightOnHero.bg, nightOnHero.fg] : [c.night, c.nightOn],
    ok: [c.okT, c.ok],
    warn: [c.warnT, c.warn],
    err: [c.errT, c.err],
    info: [c.infoT, c.info],
    grey: [c.surface, c.ink2],
  }[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(5),
        borderRadius: 999,
        paddingVertical: s(5),
        paddingHorizontal: s(10),
        backgroundColor: look[0],
      }}
    >
      {icon}
      {iconName ? <Icon name={iconName} size="xs" color={look[1]} /> : null}
      <Text size={12} weight={600} color={look[1]} oneLine>
        {label}
      </Text>
    </View>
  );
}

/** Accent count badge (`.count`). */
export function Count({ value }: { value: number }) {
  const { c, s } = useTheme();
  return (
    <View
      accessibilityLabel={`${value}`}
      style={{
        minWidth: s(22),
        height: s(22),
        paddingHorizontal: s(7),
        borderRadius: 999,
        backgroundColor: c.acc,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text size={11.5} weight={700} color={c.accOn} tabular oneLine>
        {value > 99 ? '99+' : String(value)}
      </Text>
    </View>
  );
}

/** Unread dot (`.unread`). */
export function Unread() {
  const { c, s } = useTheme();
  return <View style={{ width: s(9), height: s(9), borderRadius: 999, backgroundColor: c.acc }} />;
}

/* ─── Meter and Ring ─────────────────────────────────────────────────────── */
/** Progress bar (`.bar`), 0–1. Grows from zero when it appears. */
export function Meter({
  value,
  thin,
  style,
}: {
  value: number;
  thin?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, s } = useTheme();
  const f = useFill();
  const h = s(thin ? 3 : 5);
  const pct = Math.max(0, Math.min(1, value));
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: f.value }] }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={[{ height: h, borderRadius: h, backgroundColor: c.surface, overflow: 'hidden' }, style]}
    >
      <Animated.View
        style={[
          {
            width: `${pct * 100}%`,
            height: '100%',
            borderRadius: h,
            backgroundColor: c.acc,
            transformOrigin: 'left',
          },
          fill,
        ]}
      />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Progress ring (`.ring`), 0–1, 44px with a 4px track; content sits in the middle. */
export function Ring({
  value,
  size = 44,
  inner,
  children,
}: {
  value: number;
  size?: number;
  inner?: number;
  children?: ReactNode;
}) {
  const { c, s } = useTheme();
  const f = useFill();
  const d = s(size);
  const stroke = (d - s(inner ?? size - 8)) / 2;
  const r = (d - stroke) / 2;
  const len = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - pct * f.value) }));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={d} height={d} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {/* `.ring::before`: white disc inside the track */}
        <Circle cx={d / 2} cy={d / 2} r={r + stroke / 2} fill={c.surface} />
        <Circle cx={d / 2} cy={d / 2} r={r - stroke / 2} fill={c.white} />
        <AnimatedCircle
          cx={d / 2}
          cy={d / 2}
          r={r}
          stroke={c.acc}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${len} ${len}`}
          animatedProps={props}
        />
      </Svg>
      {children}
    </View>
  );
}
