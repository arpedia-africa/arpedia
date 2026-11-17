import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { easeIO } from '../motion';
import { Press } from '../Pressable';
import { Text } from '../Text';
import { useTheme } from '../theme';
import { motion, z } from '../tokens';
import { Btn } from './actions';

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Loading placeholder with a shimmer (`.skel`); static under reduced motion. */
export function Skeleton({ width = '100%', height = 14, radius = 8, style }: SkeletonProps) {
  const { c, s, reduceMotion } = useTheme();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(x);
      return;
    }
    x.value = 0;
    x.value = withRepeat(withTiming(1, { duration: motion.shimmer, easing: easeIO }), -1, false);
    return () => cancelAnimation(x);
  }, [x, reduceMotion]);
  // background-size 200%, position -200% → 200%
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: (x.value * 2 - 1) * w * 1.5 - w / 2 }] }));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessibilityLabel="Loading"
      style={[
        { width, height: s(height), borderRadius: s(radius), backgroundColor: c.surface, overflow: 'hidden' },
        style,
      ]}
    >
      {reduceMotion || !w ? null : (
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: w * 2 }, band]}>
          <LinearGradient
            colors={[c.surface, c.shimmer, c.surface]}
            locations={[0, 0.4, 0.8]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

/* ─── Toast ──────────────────────────────────────────────────────────────── */
export interface ToastOptions {
  message: string;
  /** Adds an Undo link; called if tapped before the toast goes. */
  onUndo?: () => void;
  undoLabel?: string;
  /** ms; default 4000, 8000 with Undo. */
  duration?: number;
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});

/** `const toast = useToast(); toast({ message: 'Saved', onUndo })` */
export const useToast = () => useContext(ToastContext);

export function Toast({
  message,
  onUndo,
  undoLabel = 'Undo',
  bottom = 96,
}: ToastOptions & { bottom?: number }) {
  const { c, s, reduceMotion } = useTheme();
  return (
    <Animated.View
      entering={
        reduceMotion
          ? FadeIn.duration(motion.base)
          : FadeInDown.duration(motion.slow).easing(Easing.bezier(...motion.ease).factory())
      }
      exiting={FadeOut.duration(motion.base)}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: s(16),
        right: s(16),
        bottom: s(bottom),
        zIndex: z.toast,
        backgroundColor: c.night,
        borderRadius: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(10),
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: s(15),
        shadowOffset: { width: 0, height: s(12) },
        elevation: 12,
      }}
    >
      <Text size={13.5} color="#FFFFFF" style={{ flex: 1 }}>
        {message}
      </Text>
      {onUndo ? (
        <Press onPress={onUndo} hitSlop={12} pressScale={1} accessibilityRole="button">
          <Text size={13.5} weight={600} color={c.nightOn} oneLine>
            {undoLabel}
          </Text>
        </Press>
      ) : null}
    </Animated.View>
  );
}

export function ToastProvider({ children, bottom }: { children: ReactNode; bottom?: number }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...t, id });
    timer.current = setTimeout(
      () => setToast((cur) => (cur?.id === id ? null : cur)),
      t.duration ?? (t.onUndo ? 8000 : 4000),
    );
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <ToastContext.Provider value={show}>
      <View style={{ flex: 1 }}>
        {children}
        {toast ? (
          <Toast
            key={toast.id}
            {...toast}
            bottom={bottom}
            onUndo={
              toast.onUndo
                ? () => {
                    toast.onUndo?.();
                    setToast(null);
                  }
                : undefined
            }
          />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

/* ─── EmptyState ─────────────────────────────────────────────────────────── */
export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  /** Optional illustration inside the round tint (no icons, DESIGN.md). */
  art?: ReactNode;
}

/** `.empty`: round tint, title, one sentence, one action. */
export function EmptyState({ title, body, action, art }: EmptyStateProps) {
  const { c, s } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: s(10), paddingVertical: s(36), paddingHorizontal: s(28) }}>
      <View
        style={{
          width: s(96),
          height: s(96),
          borderRadius: 999,
          backgroundColor: c.orgTint2,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {art}
      </View>
      {/* `.empty h3`: 19px/800 display, no letter-spacing, inherited line-height 1.45 */}
      <Text
        variant="h3"
        size={19}
        center
        accessibilityRole="header"
        style={{ letterSpacing: 0, lineHeight: s(19) * 1.45 }}
      >
        {title}
      </Text>
      {body ? (
        // max-width 30ch at 13.5px ≈ 226px
        <Text size={13.5} color="ink2" center style={{ maxWidth: s(226) }}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <Btn
          label={action.label}
          onPress={action.onPress}
          size="md"
          style={{ marginTop: s(6), alignSelf: 'center' }}
        />
      ) : null}
    </View>
  );
}

/* ─── Callout ────────────────────────────────────────────────────────────── */
export type CalloutTone = 'info' | 'warn' | 'ok' | 'err' | 'brand' | 'quiet';

/** Inline guidance (`.callout`). Text only: no icons inside callouts (DESIGN.md). */
export function Callout({ tone = 'info', children }: { tone?: CalloutTone; children: ReactNode }) {
  const { c, s } = useTheme();
  const look = {
    info: [c.infoT, c.infoInk],
    warn: [c.warnT, c.warnInk],
    ok: [c.okT, c.okInk],
    err: [c.errT, c.errInk],
    brand: [c.orgTint2, c.ink],
    quiet: [c.surface, c.ink2],
  }[tone];
  return (
    <View
      style={{
        backgroundColor: look[0],
        borderRadius: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
      }}
    >
      {tone === 'brand' ? (
        // `.callout--brand`: inset 1px box-shadow, so the edge must not take layout space.
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: c.brandLine,
          }}
        />
      ) : null}
      <Text size={13.5} color={look[1]}>
        {children}
      </Text>
    </View>
  );
}
