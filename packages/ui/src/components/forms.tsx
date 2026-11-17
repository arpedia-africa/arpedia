import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { fontFamily } from '../fonts';
import { Icon, type IconName } from '../Icon';
import { ease } from '../motion';
import { Press } from '../Pressable';
import { Text } from '../Text';
import { useTheme } from '../theme';
import { motion, rgba } from '../tokens';

/* ─── Field ──────────────────────────────────────────────────────────────── */
export interface FieldProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: string;
  hint?: string;
  error?: string;
  /** Icon inside the field, before the text (search, mail). */
  icon?: IconName;
  trailing?: ReactNode;
  /** Show the focused look without focus (`.field.focus` specimen). */
  focusedLook?: boolean;
}

/** Text box: grey at rest; white with a main-colour border and soft halo on focus; red on error. */
export function Field({
  label,
  hint,
  error,
  icon,
  trailing,
  focusedLook,
  onFocus,
  onBlur,
  ...input
}: FieldProps) {
  const { c, s } = useTheme();
  const [focused, setFocus] = useState(false);
  // `focusedLook` pins the focused look (the Design system's static "Focused" specimen).
  const focus = focusedLook || focused;
  const f = useSharedValue(0);
  useEffect(() => {
    f.value = withTiming(focus ? 1 : 0, { duration: 150, easing: ease });
  }, [focus, f]);
  const border = error ? c.err : c.org;
  const box = useAnimatedStyle(() => ({
    backgroundColor: error ? c.white : interpolateColor(f.value, [0, 1], [c.surface, c.white]),
    borderColor: error ? c.err : interpolateColor(f.value, [0, 1], ['rgba(0,0,0,0)', border]),
  }));
  const halo = useAnimatedStyle(() => ({ opacity: f.value }));
  const fs = s(14);
  return (
    <View style={{ gap: s(6) }}>
      {label ? (
        <Text variant="label" oneLine>
          {label}
        </Text>
      ) : null}
      <View>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: -s(4),
              left: -s(4),
              right: -s(4),
              bottom: -s(4),
              borderRadius: s(16),
              backgroundColor: error ? 'rgba(185,28,28,0.12)' : rgba(c.orgRgb, 0.16),
            },
            halo,
          ]}
        />
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(10),
              borderRadius: s(12),
              minHeight: s(50),
              paddingHorizontal: s(14),
              borderWidth: s(1.5),
            },
            box,
          ]}
        >
          {icon ? <Icon name={icon} size="s" color={c.ink3} /> : null}
          <TextInput
            {...input}
            onFocus={(e) => {
              setFocus(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocus(false);
              onBlur?.(e);
            }}
            placeholderTextColor={c.ink3}
            selectionColor={c.org}
            cursorColor={c.org}
            accessibilityLabel={input.accessibilityLabel ?? label}
            style={{
              flex: 1,
              minWidth: 0,
              paddingVertical: s(12),
              fontFamily: fontFamily('ui', 400),
              fontSize: fs,
              color: c.ink,
            }}
          />
          {trailing}
        </Animated.View>
      </View>
      {error || hint ? (
        <Text size={12} weight={error ? 500 : 400} color={error ? 'err' : 'ink3'}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ─── Toggle ─────────────────────────────────────────────────────────────── */
export interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** 46×28 switch; the knob slides 18px (`.toggle`). */
export function Toggle({ value, onChange, label, disabled }: ToggleProps) {
  const { c, s } = useTheme();
  const t = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(value ? 1 : 0, { duration: motion.base, easing: ease });
  }, [value, t]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], [c.control, c.org]),
  }));
  // s() is a JS function: worklets can't call it on the UI thread, so pass the number in.
  const travel = s(18);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * travel }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
    >
      <Animated.View
        style={[{ width: s(46), height: s(28), borderRadius: 999, opacity: disabled ? 0.5 : 1 }, track]}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: s(3),
              top: s(3),
              width: s(22),
              height: s(22),
              borderRadius: 999,
              backgroundColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: s(3),
              shadowOffset: { width: 0, height: s(1) },
              elevation: 2,
            },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

/* ─── Chip ───────────────────────────────────────────────────────────────── */
export interface ChipProps {
  label: string;
  onPress?: () => void;
  /** 'on' = current filter (night), 'sel' = selected option (tint + border). */
  state?: 'off' | 'on' | 'sel';
  icon?: IconName;
}

/** `.chip`: 36px pill, one line. */
export function Chip({ label, onPress, state = 'off', icon }: ChipProps) {
  const { c, s } = useTheme();
  const look = {
    off: { bg: c.surface, fg: c.ink, border: undefined },
    on: { bg: c.night, fg: '#FFFFFF', border: undefined },
    sel: { bg: c.orgTint, fg: c.orgInk, border: c.org },
  }[state];
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: state !== 'off' }}
      accessibilityLabel={label}
      hitSlop={4}
      style={{
        minHeight: s(36),
        // .chip.sel's ring is an inset box-shadow (no space): subtract it from the padding
        paddingHorizontal: s(look.border ? 14 - 1.5 : 14),
        borderRadius: 999,
        backgroundColor: look.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(6),
        borderWidth: look.border ? s(1.5) : 0,
        borderColor: look.border,
      }}
    >
      {icon ? <Icon name={icon} size="s" color={look.fg} /> : null}
      <Text size={13} weight={600} color={look.fg} oneLine>
        {label}
      </Text>
    </Press>
  );
}

/* ─── Segmented ──────────────────────────────────────────────────────────── */
export interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

/** `.seg`: equal-width options on a grey track; the selected one is a white tile. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const { c, s } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface,
        borderRadius: s(12),
        padding: s(4),
        gap: s(4),
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: s(36),
              borderRadius: s(9),
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: s(4),
              backgroundColor: on ? c.white : 'transparent',
              ...(on
                ? {
                    shadowColor: '#111827',
                    shadowOpacity: 0.12,
                    shadowRadius: s(3),
                    shadowOffset: { width: 0, height: s(1) },
                    elevation: 1,
                  }
                : null),
            }}
          >
            <Text size={13} weight={600} color={on ? c.ink : c.ink2} oneLine>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
