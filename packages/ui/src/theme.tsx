import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { scaleFor, scaled, snapBorder } from './scale';
import { base, themes, type ThemeColors, type ThemeName } from './tokens';

export type Colors = typeof base & ThemeColors;

export interface ThemeValue {
  name: ThemeName;
  c: Colors;
  /** Current scale factor (0.85–1). */
  scale: number;
  /** Scale a design size: s(16) → 16 at 375dp, 13.6 at 320dp. */
  s: (n: number) => number;
  /** Scale a border width, then snap it to whole device pixels like Chrome: bw(1), bw(1.5). */
  bw: (n: number) => number;
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export interface ThemeProviderProps {
  theme?: ThemeName;
  /** Override the width used for scaling (kit gallery width switcher). */
  width?: number;
  /** Force reduced motion on or off (kit gallery, tests). Defaults to the OS setting. */
  reduceMotion?: boolean;
  children: ReactNode;
}

export function ThemeProvider({ theme = 'sunflower', width, reduceMotion, children }: ThemeProviderProps) {
  const window = useWindowDimensions();
  const osReduce = useReducedMotion();
  const w = width ?? window.width;
  const value = useMemo<ThemeValue>(() => {
    const scale = scaleFor(w);
    return {
      name: theme,
      c: { ...base, ...themes[theme] },
      scale,
      s: (n: number) => scaled(n, scale),
      bw: (n: number) => snapBorder(scaled(n, scale), PixelRatio.get()),
      reduceMotion: reduceMotion ?? osReduce,
    };
  }, [theme, w, reduceMotion, osReduce]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}

/** `const { s, scale } = useScale()` */
export function useScale() {
  const { s, scale } = useTheme();
  return { s, scale };
}
