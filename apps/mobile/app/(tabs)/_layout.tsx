import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { TabBar } from '@arpedia/ui';
import { useSyncTimeZone } from '../../features/10/timezone';
import { useCommunityBadge } from '../../features/06/data';
import { useBackgroundLicenceRefresh } from '../../features/05/library';
import { usePushHandling } from '../../features/15/push';

// Main tabs. Each product flow owns its tab's screens (BUILD-PLAN ownership).
export default function TabsLayout() {
  usePushHandling();
  useSyncTimeZone();
  useBackgroundLicenceRefresh();
  const communityBadge = useCommunityBadge();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigateToTab }) => (
          <TabBar
            active={state.routes[state.index]?.name ?? 'home'}
            badges={{ community: communityBadge }}
            onChange={(name) => {
              const route = state.routes.find((r) => r.name === name);
              if (route) navigateToTab(route.key);
            }}
          />
        )}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="library" />
        <Tabs.Screen name="community" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </View>
  );
}
