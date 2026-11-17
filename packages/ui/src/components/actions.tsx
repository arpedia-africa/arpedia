import type { ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName, type IconSize } from '../Icon';
import { Press } from '../Pressable';
import { Text } from '../Text';
import { useTheme } from '../theme';
import { motion } from '../tokens';

export type BtnVariant = 'p' | 's' | 'n' | 'g' | 'x';
export type BtnSize = 'sm' | 'md';

export interface BtnProps {
  label: string;
  onPress?: () => void;
  /** p (.btn-p primary) · s (.btn-s secondary) · n (.btn-n night) · g (.btn-g outline) · x (.btn-x destructive) */
  variant?: BtnVariant;
  /** `.btn.sm` 36 · `.btn.md` 42 · omitted = `.btn` base 48 */
  size?: BtnSize;
  /** `.btn.block`: width 100% */
  block?: boolean;
  icon?: IconName;
  /** Prototype icon size class (`ico xs|s`); default s (xs on sm buttons). */
  iconSize?: IconSize;
  /** `.btn.dis` */
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/** `.btn`: one line, never wraps (shrinks to 85% at most). */
export function Btn({
  label,
  onPress,
  variant = 'p',
  size,
  block,
  icon,
  iconSize,
  disabled,
  loading,
  style,
  accessibilityHint,
}: BtnProps) {
  const { c, s } = useTheme();
  const palette: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    p: { bg: c.org, fg: c.onOrg },
    s: { bg: c.orgTint, fg: c.orgInk },
    // prototype hard-codes #fff on .btn-n
    n: { bg: c.night, fg: '#FFFFFF' },
    g: { bg: c.white, fg: c.ink, border: c.line },
    x: { bg: c.errT, fg: c.err },
  };
  const off = disabled || loading;
  // .btn.dis wins over every variant, including the .btn-g inset border
  const p = disabled ? { bg: c.surface, fg: c.ink3 } : palette[variant];
  const dims =
    size === 'sm'
      ? { h: 36, px: 12, fs: 13, r: 10 }
      : size === 'md'
        ? { h: 42, px: 18, fs: 14, r: 12 }
        : { h: 48, px: 18, fs: 15, r: 12 };
  const bw = 'border' in p && p.border ? 1.5 : 0;
  return (
    <Press
      onPress={off ? undefined : onPress}
      disabled={off}
      pressScale={motion.press.button}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={[
        {
          minHeight: s(dims.h),
          // .btn-g's line is an inset box-shadow (takes no space): RN border sits inside the
          // box, so take it off the padding to keep the content where CSS puts it.
          paddingHorizontal: s(dims.px - bw),
          borderRadius: s(dims.r),
          backgroundColor: p.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(8),
          // inline-flex: follows the parent's align-items (rows centre it); in a column, pass
          // style={{ alignSelf: 'flex-start' }} so it keeps its own width
          ...(block ? { width: '100%' } : null),
        },
        bw ? { borderWidth: s(bw), borderColor: 'border' in p ? p.border : undefined } : null,
        style,
      ]}
      hitSlop={dims.h < 44 ? (44 - dims.h) / 2 : undefined}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={iconSize ?? (size === 'sm' ? 'xs' : 's')} color={p.fg} /> : null}
          <Text size={dims.fs} weight={600} color={p.fg} oneLine style={{ flexShrink: 1 }}>
            {label}
          </Text>
        </>
      )}
    </Press>
  );
}

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon buttons have no visible text. */
  label: string;
  onPress?: () => void;
  color?: string;
  /** Small dot for unread state (`.ib.has-dot`). */
  dot?: boolean;
  pressed?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** `.ib`: 44×44 icon button, sinks to 90% when pressed. */
export function IconButton({ icon, label, onPress, color, dot, pressed, style }: IconButtonProps) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      pressScale={motion.press.icon}
      accessibilityLabel={label}
      accessibilityState={pressed === undefined ? undefined : { selected: pressed }}
      style={[
        { width: s(44), height: s(44), borderRadius: s(12), alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Icon name={icon} color={color ?? c.ink} />
      {dot ? (
        <View
          style={{
            position: 'absolute',
            // 9px dot with a 2px accent ring outside it
            top: s(8),
            right: s(8),
            width: s(13),
            height: s(13),
            borderRadius: 999,
            backgroundColor: c.night,
            borderWidth: s(2),
            borderColor: c.acc,
          }}
        />
      ) : null}
    </Press>
  );
}

/** Text link in the main ink colour (`.link`). */
export function Link({ label, onPress }: { label: string; onPress?: () => void; children?: ReactNode }) {
  return (
    <Press onPress={onPress} accessibilityRole="link" hitSlop={12} pressScale={1}>
      <Text weight={600} color="orgInk" oneLine>
        {label}
      </Text>
    </Press>
  );
}
