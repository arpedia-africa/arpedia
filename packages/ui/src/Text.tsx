import { useState } from 'react';
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
  const maxScale = rest.maxFontSizeMultiplier ?? (oneLine ? 1.6 : undefined);
  const [lineCount, setLineCount] = useState(1);
  const countLines = Platform.OS === 'android' && !oneLine && !ellipsis && rest.numberOfLines !== 1;
  const { onTextLayout } = rest;
  return (
    <RNText
      {...lines}
      {...shrink}
      ellipsizeMode={ellipsis ? 'tail' : undefined}
      maxFontSizeMultiplier={oneLine ? 1.6 : undefined}
      style={[
        merged,
        androidLineBox(merged, !!((oneLine && !ellipsis) || rest.adjustsFontSizeToFit), maxScale),
        androidHeightFix(merged, lineCount, maxScale),
      ]}
      {...rest}
      onTextLayout={
        countLines
          ? (e) => {
              setLineCount(e.nativeEvent.lines.length || 1);
              onTextLayout?.(e);
            }
          : onTextLayout
      }
    />
  );
}

/**
 * Chrome stacks line boxes at their fractional height (2 × 21.025px = 42.05px) and snaps what follows
 * to the nearest device pixel; Android draws every line a whole pixel tall (see androidLineBox), so a
 * paragraph can come out a pixel taller and push everything below it down. Give the difference back
 * as bottom margin.
 */
function androidHeightFix(style: TextStyle, lineCount: number, maxScale?: number): TextStyle | null {
  const { lineHeight, marginBottom, marginVertical, margin } = style;
  if (Platform.OS !== 'android' || lineHeight == null) return null;
  const r = PixelRatio.get() * Math.min(PixelRatio.getFontScale(), maxScale ?? Infinity);
  const drawn = lineCount * Math.max(1, Math.round(lineHeight * r));
  const fix = (lineCount * lineHeight * r - drawn) / PixelRatio.get();
  if (Math.abs(fix) < 0.001) return null;
  const base = [marginBottom, marginVertical, margin].find((v) => v != null);
  if (base != null && typeof base !== 'number') return null;
  return { marginBottom: (base ?? 0) + fix };
}

/**
 * Android places text in its line box differently from Chrome (the prototype), so on Android:
 * - Font size: RN rounds it UP to whole device pixels (TextAttributes), so 15px at 2.88x draws at
 *   44px instead of 43.2 and labels come out ~2% wider. Snap to the nearest device pixel instead, and
 *   give the remainder back as letter spacing (font size difference × the font's typical advance).
 *   With adjustsFontSizeToFit, RN's fit search rescales the size by float ratios and truncates on
 *   every step even when the text fits (TextLayoutManager.adjustSpannableFontToFit), so 37px ends at
 *   32px. Start from the size whose search ends nearest the wanted size (fitStart).
 * - Line height: RN rounds each line box UP to whole device pixels (CustomLineHeightSpan), so a
 *   30.6px line at 2.88x becomes 89px instead of 88.1 and everything below drifts. Snap to the
 *   nearest device pixel (a hair under it, so the ceil lands there).
 * - Baseline: both round ascent and descent to device pixels, but Chrome (subpixel text) moves a
 *   rounded-down descent's pixel over from the ascent and floors the half-leading, while RN ceils
 *   it. Shift the glyphs by the difference so they sit where the prototype draws them.
 */
function androidLineBox(style: TextStyle, fit: boolean, maxScale?: number): TextStyle | null {
  const { lineHeight, fontSize, fontFamily: name } = style;
  if (Platform.OS !== 'android' || lineHeight == null) return null;
  const r = PixelRatio.get() * Math.min(PixelRatio.getFontScale(), maxScale ?? Infinity);
  const lhPx = Math.max(1, Math.round(lineHeight * r)) - 0.01;
  const m = name ? fontMetrics[name] : undefined;
  if (!m || fontSize == null) return { lineHeight: lhPx / r };
  const nearest = Math.max(1, Math.round(fontSize * r));
  const [startPx, sizePx] = fit ? fitStart(fontSize * r) : [nearest, nearest];
  return lineBox(style, m, r, lhPx, startPx, sizePx);
}

/**
 * Font size and letter spacing for text outside `Text` (TextInput) on Android: the nearest device
 * pixel instead of RN's round-up, the remainder as letter spacing (see androidLineBox).
 */
export function androidFontSize(
  fontSize: number,
  family: string,
): Pick<TextStyle, 'fontSize' | 'letterSpacing'> {
  const m = fontMetrics[family];
  if (Platform.OS !== 'android' || !m) return { fontSize };
  const r = PixelRatio.get() * PixelRatio.getFontScale();
  const px = Math.max(1, Math.round(fontSize * r));
  return { fontSize: (px - 0.01) / r, letterSpacing: (fontSize - px / r) * m[2] };
}

/**
 * Vertical shift (dp, + = down) that puts a single-line TextInput's baseline where Chrome draws an
 * input's. Chrome centres a `lineHeight` line box (whole-px ascent/descent, half-leading floored, as
 * in lineBox); Android centres the font's whole-px ascent + descent (includeFontPadding off).
 * Apply as paddingTop + shift / paddingBottom − shift.
 */
export function androidInputShift(fontSize: number, lineHeight: number, family: string): number {
  const m = fontMetrics[family];
  if (Platform.OS !== 'android' || !m) return 0;
  const r = PixelRatio.get() * PixelRatio.getFontScale();
  const px = Math.max(1, Math.round(fontSize * r));
  const android = (Math.ceil(px * m[0]) - Math.ceil(px * m[1])) / 2;
  const d = fontSize * r * m[1];
  let ab = Math.round(fontSize * r * m[0]);
  let db = Math.round(d);
  if (db < d && ab >= 1) {
    db++;
    ab--;
  }
  const lh = lineHeight * r;
  const chrome = ab + Math.floor((lh - ab - db) / 2) - lh / 2;
  return (chrome - android) / PixelRatio.get();
}

/** The size RN's fit search ends at from `start` px when the text fits (float32, like the Kotlin). */
function fitResult(start: number, min: number): number {
  let size = start;
  let low = min;
  let prev = start;
  for (;;) {
    const cur = Math.floor((low + start + 1) / 2);
    size = Math.max(Math.trunc(Math.fround(size * Math.fround(cur / prev))), min);
    if (low === start) return size;
    low = cur;
    prev = cur;
  }
}

/** [start px to ask for, px it is drawn at]: the drawn size nearest `exact` px. */
function fitStart(exact: number): [number, number] {
  const min = Math.trunc(Math.fround(4 * PixelRatio.get()));
  let best: [number, number] = [Math.ceil(exact), Math.ceil(exact)];
  let err = Infinity;
  for (let start = Math.max(min, Math.floor(exact) - 2); start <= Math.ceil(exact) + 6; start++) {
    const drawn = fitResult(start, min);
    if (Math.abs(drawn - exact) < err) {
      err = Math.abs(drawn - exact);
      best = [start, drawn];
    }
  }
  return best;
}

function lineBox(
  style: TextStyle,
  m: readonly [number, number, number],
  r: number,
  lhPx: number,
  startPx: number,
  sizePx: number,
): TextStyle {
  const { lineHeight = 0, fontSize = 0, letterSpacing, transform } = style;
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
    fontSize: (startPx - 0.01) / r,
    letterSpacing: (letterSpacing ?? 0) + (fontSize - sizePx / r) * m[2],
    lineHeight: lhPx / r,
    ...(shift ? { transform: [...(Array.isArray(transform) ? transform : []), { translateY: shift }] } : {}),
  };
}
