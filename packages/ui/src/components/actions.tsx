import type { ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../Icon';
import { Press } from '../Pressable';
import { Text } from '../Text';
import { useTheme } from '../theme';
import { motion } from '../tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'night' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  /** primary (.btn-p) · secondary (.btn-s) · ghost (.btn-g) · night (.btn-n) · danger (.btn-x) */
  variant?: ButtonVariant;
  /** sm 36 · md 42 · lg 48 (default) */
  size?: ButtonSize;
  block?: boolean;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

/** `.btn`: one line, never wraps (shrinks to 85% at most). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  block,
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: ButtonProps) {
  const { c, s } = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.org, fg: c.onOrg },
    secondary: { bg: c.orgTint, fg: c.orgInk },
    ghost: { bg: c.white, fg: c.ink, border: c.line },
    night: { bg: c.night, fg: '#FFFFFF' },
    danger: { bg: c.errT, fg: c.err },
  };
  const off = disabled || loading;
  const p = disabled ? { bg: c.surface, fg: c.ink3 } : palette[variant];
  const dims = {
    sm: { h: 36, px: 12, fs: 13, r: 10 },
    md: { h: 42, px: 18, fs: 14, r: 12 },
    lg: { h: 48, px: 18, fs: 15, r: 12 },
  }[size];
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
          paddingHorizontal: s(dims.px),
          borderRadius: s(dims.r),
          backgroundColor: p.bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(8),
          alignSelf: block ? 'stretch' : 'flex-start',
        },
        'border' in p && p.border ? { borderWidth: s(1.5), borderColor: p.border } : null,
        style,
      ]}
      hitSlop={dims.h < 44 ? (44 - dims.h) / 2 : undefined}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 's' : 'm'} color={p.fg} /> : null}
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
