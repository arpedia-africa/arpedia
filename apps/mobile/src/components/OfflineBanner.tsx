import { useNetInfo } from '@react-native-community/netinfo';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text, useTheme } from '@arpedia/ui';

/** Shown under the status bar whenever the phone has no connection (`.banner.warn` look). */
export function OfflineBanner() {
  const { isConnected } = useNetInfo();
  const { c, s } = useTheme();
  if (isConnected !== false) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} accessibilityLiveRegion="polite">
      <View style={{ backgroundColor: c.warnT, paddingVertical: s(8), paddingHorizontal: s(16) }}>
        <Text size={13} color={c.warnInk} oneLine>
          You're offline. Books on your phone still open.
        </Text>
      </View>
    </Animated.View>
  );
}
