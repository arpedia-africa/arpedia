import { Image } from 'react-native';
import { useTheme } from '../theme';
// The prototype's own brand bitmaps, extracted byte for byte by tools/gen-brand.mjs.
import APP_ICON from '../brand/appicon.png';
import WORDMARK_NIGHT from '../brand/wordmark-night.png';
import WORDMARK from '../brand/wordmark.png';

export interface WordmarkProps {
  /** CSS height in px (`.wmk` default 24); width follows the 344:96 artwork. */
  height?: number;
  /** `.wmk--night`: the wordmark on the main-colour hero. */
  night?: boolean;
}

/**
 * Arpedia wordmark (`.wmk`, `.wmk--night`). On Palm, Plum and Night the hero is dark, so the night
 * wordmark turns white, as the prototype's `filter:brightness(0) invert(1)` does.
 */
export function Wordmark({ height = 24, night }: WordmarkProps) {
  const { s, name } = useTheme();
  const h = s(height);
  const white = night && name !== 'sunflower';
  return (
    <Image
      source={night ? WORDMARK_NIGHT : WORDMARK}
      accessibilityRole="image"
      accessibilityLabel="arpedia"
      style={{ height: h, width: (h * 344) / 96, tintColor: white ? '#FFFFFF' : undefined }}
      resizeMode="contain"
    />
  );
}

/** App icon (`#i-appicon` in the prototype sprite), drawn at `size` px square. */
export function AppIcon({ size = 26 }: { size?: number }) {
  const { s } = useTheme();
  return (
    <Image
      source={APP_ICON}
      style={{ width: s(size), height: s(size) }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
