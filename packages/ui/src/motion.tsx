import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from './theme';
import { motion } from './tokens';

export const ease = Easing.bezier(...motion.ease);
export const easeIO = Easing.bezier(...motion.easeIO);

/**
 * Arrive / Ripple: content rises 8px and fades in, `index` × 45ms after the screen opens.
 * Reduced motion keeps a short fade and drops the travel.
 */
export function Arrive({
  index = 0,
  stagger = motion.stagger,
  style,
  children,
}: {
  index?: number;
  stagger?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { reduceMotion, s } = useTheme();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(Math.min(index, 5) * stagger, withTiming(1, { duration: motion.slow, easing: ease }));
  }, [t, index, stagger]);
  const rise = reduceMotion ? 0 : s(motion.rise);
  const anim = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * rise }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Drift: one slow turn every 140 s. Stops under reduced motion. Returns an animated rotate style. */
export function useDrift(duration: number = motion.drift, reverse = false) {
  const { reduceMotion } = useTheme();
  const r = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(r);
      r.value = 0;
      return;
    }
    r.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(r);
  }, [r, duration, reduceMotion]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${(reverse ? -360 : 360) * r.value}deg` }] }));
}

/** Fill: 0 → 1 over 700 ms after 120 ms, when the element appears. Instant under reduced motion. */
export function useFill() {
  const { reduceMotion } = useTheme();
  const f = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) f.value = withDelay(120, withTiming(1, { duration: motion.fill, easing: ease }));
  }, [f, reduceMotion]);
  return f;
}
