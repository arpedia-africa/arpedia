import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { TabBar } from '@arpedia/ui';
import { usePushHandling } from '../../features/15/push';

// Main tabs. Each product flow owns its tab's screens (BUILD-PLAN ownership).
export default function TabsLayout() {
  usePushHandling();
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigateToTab }) => (
          <TabBar
            active={state.routes[state.index]?.name ?? 'home'}
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
