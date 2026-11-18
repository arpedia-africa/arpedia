import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Btn, Screen } from '@arpedia/ui';
import { Foot, RoleView, type Intent } from '../../features/01/StepViews';
import { useTrack } from '../../features/01/analytics';
import { saveStep } from '../../features/01/steps';

export default function Role() {
  const track = useTrack();
  // No pre-selection: Continue stays off until one is picked (rule 18).
  const [intent, setIntent] = useState<Intent | null>(null);
  useEffect(() => track('onboarding_step_viewed', { step: 'role' }), [track]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/theme'));
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <Foot>
          <Btn
            label="Continue"
            iconAfter="arrow"
            block
            disabled={!intent}
            onPress={() => {
              if (!intent) return;
              track('role_selected', { intent });
              void saveStep('role', { intent });
              router.push('/(onboarding)/profile');
            }}
          />
        </Foot>
      }
    >
      <RoleView value={intent} onPick={setIntent} onBack={back} />
    </Screen>
  );
}
