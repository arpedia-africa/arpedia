import {
  PixelRatio,
  Platform,
  StyleSheet,
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { fontFamily } from './fonts';
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
  const merged = StyleSheet.flatten([textStyle, style]);
  return (
    <RNText
      {...lines}
      {...shrink}
      ellipsizeMode={ellipsis ? 'tail' : undefined}
      maxFontSizeMultiplier={oneLine ? 1.6 : undefined}
      style={[merged, { lineHeight: snapLineHeight(merged?.lineHeight) }]}
      {...rest}
    />
  );
}

/**
 * Android rounds each line box UP to whole physical pixels (RN CustomLineHeightSpan), so a 30.6px
 * line at 2.88x becomes 89px instead of 88.1 and every text block below drifts down. Snap to the
 * nearest physical pixel (a hair under it, so the ceil lands there) to match CSS line boxes on average.
 */
export function snapLineHeight(lineHeight: number | undefined): number | undefined {
  if (lineHeight == null || Platform.OS !== 'android') return lineHeight;
  const r = PixelRatio.get();
  return (Math.max(1, Math.round(lineHeight * r)) - 0.01) / r;
}
