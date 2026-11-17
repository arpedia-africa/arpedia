import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from './theme';
import { motion } from './tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const ease = Easing.bezier(...motion.ease);

export interface PressProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Scale while pressed (motion.press.*). Buttons 0.97, icon buttons 0.9, rows 0.99, covers 0.96. */
  pressScale?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/** Tappable surface that sinks slightly while pressed (DESIGN.md "Press"); still under reduced motion. */
export function Press({ pressScale = motion.press.button, style, onPressIn, onPressOut, children, ...rest }: PressProps) {
  const { reduceMotion } = useTheme();
  const k = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPressIn={e => {
        if (!reduceMotion) k.value = withTiming(pressScale, { duration: motion.fast, easing: ease });
        onPressIn?.(e);
      }}
      onPressOut={e => {
        k.value = withTiming(1, { duration: motion.fast, easing: ease });
        onPressOut?.(e);
      }}
      style={[style, anim]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
