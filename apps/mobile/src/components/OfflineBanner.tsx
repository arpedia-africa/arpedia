import { useNetInfo } from '@react-native-community/netinfo';
import { usePathname } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, useTheme } from '@arpedia/ui';

// Routes that draw their own offline state in place of the banner: kit and parity galleries, the
// reader (flow 04, books on the phone keep opening) and Credits (flow 09, "You're offline. Updated…").
const OWN_OFFLINE = /^\/(kit|parity|gate-preview|read|credits)(\/|$)/;

/** Shown under the status bar whenever the phone has no connection (`.banner.warn` look). */
export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const { c, s } = useTheme();
  const insets = useSafeAreaInsets();
  if (isConnected !== false) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} accessibilityLiveRegion="polite">
      <View
        style={{
          backgroundColor: c.warnT,
          paddingTop: insets.top + s(8),
          paddingBottom: s(8),
          paddingHorizontal: s(16),
        }}
      >
        <Text size={13} color={c.warnInk} oneLine>
          You're offline. Books on your phone still open.
        </Text>
      </View>
    </Animated.View>
  );
}

/** The banner over every screen (tabs and stack), mounted once in the root layout. */
export function RootOfflineBanner() {
  const pathname = usePathname();
  if (OWN_OFFLINE.test(pathname)) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
      <OfflineBanner />
    </View>
  );
}
