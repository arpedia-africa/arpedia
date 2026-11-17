import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Literata_400Regular,
  Literata_400Regular_Italic,
  Literata_600SemiBold,
} from '@expo-google-fonts/literata';
import { ThemeProvider, ToastProvider } from '@arpedia/ui';
import { QueryProvider } from '@/lib/query';
import { Telemetry, initSentry, wrapRoot } from '@/lib/telemetry';
import { useUi } from '@/lib/ui-store';

initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    Literata_400Regular,
    Literata_400Regular_Italic,
    Literata_600SemiBold,
  });
  const theme = useUi((st) => st.theme);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return <View style={{ flex: 1 }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Telemetry>
          <QueryProvider>
            <ThemeProvider theme={theme}>
              <ToastProvider>
                <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }} />
              </ToastProvider>
            </ThemeProvider>
          </QueryProvider>
        </Telemetry>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
