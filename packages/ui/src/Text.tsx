import {
  PixelRatio,
  Platform,
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { fontFamily } from './fonts';
import { fontMetrics } from './fonts/metrics';
import { useTheme, type Colors } from './theme';
import {
  type as typeScale,
  type FontFamily,
  type FontWeight,
  type TypeStyle,
  type TypeVariant,
} from './tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Override the size in design px (scaled for small screens). */
  size?: number;
  weight?: FontWeight;
  family?: FontFamily;
  /** Colour token name (ink, ink2, ink3, orgInk, onOrg …) or a literal colour. */
  color?: keyof Colors | (string & {});
  /** Single-line text: never wraps; shrinks to 85% before it would (CLAUDE.md). */
  oneLine?: boolean;
  /** Ellipsis instead of shrinking; only for user-generated text (names, titles in rows). */
  ellipsis?: boolean;
  center?: boolean;
  tabular?: boolean;
  italic?: boolean;
}

export function Text({
  variant = 'base',
  size,
  weight,
  family,
  color = 'ink',
  oneLine,
  ellipsis,
  center,
  tabular,
  italic,
  style,
  ...rest
}: TextProps) {
  const { c, s } = useTheme();
  const t: TypeStyle = typeScale[variant];
  const fs = s(size ?? t.size);
  const f = family ?? t.family;
  const w = weight ?? t.weight;
  const textStyle: TextStyle = {
    fontFamily: fontFamily(f, w, italic ?? t.italic, size ?? t.size),
    fontSize: fs,
    lineHeight: Math.round(fs * t.lineHeight * 100) / 100,
    letterSpacing: t.letterSpacing ? fs * t.letterSpacing : 0,
    color: color in c ? String(c[color as keyof Colors]) : color,
    textAlign: center ? 'center' : undefined,
    fontVariant: tabular ? ['tabular-nums'] : undefined,
    includeFontPadding: false,
  };
  const lines = oneLine || ellipsis ? { numberOfLines: 1 } : {};
  const shrink = oneLine && !ellipsis ? { adjustsFontSizeToFit: true, minimumFontScale: 0.85 } : {};
  const merged = StyleSheet.flatten([textStyle, style]) ?? {};
  return (
    <RNText
      {...lines}
      {...shrink}
      ellipsizeMode={ellipsis ? 'tail' : undefined}
      maxFontSizeMultiplier={oneLine ? 1.6 : undefined}
      style={[merged, androidLineBox(merged)]}
      {...rest}
    />
  );
}

/**
 * Android places text in its line box differently from Chrome (the prototype), so on Android:
 * - Font size: RN rounds it UP to whole device pixels (TextAttributes), so 15px at 2.88x draws at
 *   44px instead of 43.2 and labels come out ~2% wider. Snap to the nearest device pixel instead, and
 *   give the remainder back as letter spacing (font size difference × the font's typical advance).
 * - Line height: RN rounds each line box UP to whole device pixels (CustomLineHeightSpan), so a
 *   30.6px line at 2.88x becomes 89px instead of 88.1 and everything below drifts. Snap to the
 *   nearest device pixel (a hair under it, so the ceil lands there).
 * - Baseline: both round ascent and descent to device pixels, but Chrome (subpixel text) moves a
 *   rounded-down descent's pixel over from the ascent and floors the half-leading, while RN ceils
 *   it. Shift the glyphs by the difference so they sit where the prototype draws them.
 */
function androidLineBox(style: TextStyle): TextStyle | null {
  const { lineHeight, fontSize, letterSpacing, fontFamily: name, transform } = style;
  if (Platform.OS !== 'android' || lineHeight == null) return null;
  const r = PixelRatio.get() * PixelRatio.getFontScale();
  const lhPx = Math.max(1, Math.round(lineHeight * r)) - 0.01;
  const m = name ? fontMetrics[name] : undefined;
  if (!m || fontSize == null) return { lineHeight: lhPx / r };
  const sizePx = Math.max(1, Math.round(fontSize * r));
  const ai = Math.round(sizePx * m[0]);
  const di = Math.round(sizePx * m[1]);
  const android = ai + Math.ceil((Math.ceil(lhPx) - ai - di) / 2);
  // Chrome draws at the exact (fractional) size.
  const d = fontSize * r * m[1];
  let ab = Math.round(fontSize * r * m[0]);
  let db = Math.round(d);
  if (db < d && ab >= 1) {
    db++;
    ab--;
  }
  const chrome = ab + Math.floor((lineHeight * r - ab - db) / 2);
  const shift = (chrome - android) / PixelRatio.get();
  return {
    fontSize: (sizePx - 0.01) / r,
    letterSpacing: (letterSpacing ?? 0) + (fontSize - sizePx / r) * m[2],
    lineHeight: lhPx / r,
    ...(shift ? { transform: [...(Array.isArray(transform) ? transform : []), { translateY: shift }] } : {}),
  };
}
