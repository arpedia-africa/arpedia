import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { TabBar } from '@arpedia/ui';
import { OfflineBanner } from '@/components/OfflineBanner';

// Main tabs. Each product flow owns its tab's screens (BUILD-PLAN ownership).
export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigateToTab }) => (
          <TabBar
            active={state.routes[state.index]?.name ?? 'home'}
            onChange={name => {
              const route = state.routes.find(r => r.name === name);
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
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0 }}>
        <OfflineBanner />
      </View>
    </View>
  );
}
