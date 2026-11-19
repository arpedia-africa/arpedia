import { useEffect } from 'react';
import { router } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { useUi } from '@/lib/ui-store';
import { ThemeView } from '../../features/01/StepViews';
import { useTrack } from '../../features/01/analytics';
import { saveStep } from '../../features/01/steps';

export default function ThemePick() {
  const track = useTrack();
  const theme = useUi((st) => st.theme);
  const setTheme = useUi((st) => st.setTheme);
  useEffect(() => track('onboarding_step_viewed', { step: 'theme' }), [track]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/interests'));
  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <ThemeView
        value={theme}
        // Recolours at once (tokens only); kept on the device first so it applies offline (rule 17).
        onPick={setTheme}
        onBack={back}
        onSkip={() => {
          track('onboarding_step_skipped', { step: 'theme' });
          setTheme('sunflower');
          void saveStep('theme', { theme: 'sunflower' });
          router.push('/(onboarding)/role');
        }}
        onContinue={() => {
          track('theme_selected', { theme });
          void saveStep('theme', { theme });
          router.push('/(onboarding)/role');
        }}
      />
    </Screen>
  );
}
