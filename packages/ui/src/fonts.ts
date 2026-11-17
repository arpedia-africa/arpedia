import { displayOpsz } from './fonts/display';
import type { FontFamily, FontWeight } from './tokens';

export { displayFonts } from './fonts/display';

// Android needs one family name per weight. Names match @expo-google-fonts exports (and, for display,
// tools/gen-display-fonts.mjs), loaded in the app's root layout with useFonts.
const families: Record<FontFamily, Partial<Record<FontWeight, string>>> = {
  ui: {
    400: 'Inter_400Regular',
    500: 'Inter_500Medium',
    600: 'Inter_600SemiBold',
    700: 'Inter_700Bold',
    800: 'Inter_800ExtraBold',
  },
  display: { 600: 'Bricolage_600', 800: 'Bricolage_800' },
  reading: { 400: 'Literata_400Regular', 600: 'Literata_600SemiBold' },
};

/**
 * Font family name for a weight. `size` (design px) picks Bricolage's optical size: the prototype
 * draws display text with opsz = font size, so we use the nearest shipped instance.
 */
export function fontFamily(family: FontFamily, weight: FontWeight, italic = false, size = 16): string {
  if (family === 'reading' && italic) return 'Literata_400Regular_Italic';
  const table = families[family];
  // nearest loaded weight
  const w =
    table[weight] ??
    table[
      (Object.keys(table).map(Number) as FontWeight[]).sort(
        (a, b) => Math.abs(a - weight) - Math.abs(b - weight),
      )[0]!
    ]!;
  if (family !== 'display') return w;
  const o = [...displayOpsz].sort((a, b) => Math.abs(a - size) - Math.abs(b - size))[0]!;
  return `${w}_${o}`;
}
