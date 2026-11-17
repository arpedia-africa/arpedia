import type { FontFamily, FontWeight } from './tokens';

// Android needs one family name per weight. Names match @expo-google-fonts exports, loaded in the app's
// root layout with useFonts({ ...fontAssets }).
const families: Record<FontFamily, Partial<Record<FontWeight, string>>> = {
  ui: {
    400: 'Inter_400Regular',
    500: 'Inter_500Medium',
    600: 'Inter_600SemiBold',
    700: 'Inter_700Bold',
    800: 'Inter_800ExtraBold',
  },
  display: { 600: 'BricolageGrotesque_600SemiBold', 800: 'BricolageGrotesque_800ExtraBold' },
  reading: { 400: 'Literata_400Regular', 600: 'Literata_600SemiBold' },
};

export function fontFamily(family: FontFamily, weight: FontWeight, italic = false): string {
  if (family === 'reading' && italic) return 'Literata_400Regular_Italic';
  const table = families[family];
  if (table[weight]) return table[weight]!;
  // nearest loaded weight
  const loaded = (Object.keys(table).map(Number) as FontWeight[]).sort(
    (a, b) => Math.abs(a - weight) - Math.abs(b - weight),
  );
  return table[loaded[0]!]!;
}
