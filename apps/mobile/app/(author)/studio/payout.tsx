import { router } from 'expo-router';
import { Screen, useToast } from '@arpedia/ui';
import { STUDIO } from '../../../features/11/application';
import { StudioPayoutView } from '../../../features/11/StudioSettingsViews';

/**
 * s-studio-payout: bank, masked account, verified name, payout day, method, minimum (rule 29).
 * Bank records and verification are flow 13; until it lands every author shows "Not set".
 */
export default function StudioPayout() {
  const toast = useToast();
  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioPayoutView
        account={{ bank: null, name: null, status: { label: 'Not set', tone: 'grey' } }}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(STUDIO))}
        onChange={() =>
          toast({ message: 'Adding a bank account is coming soon. Your earnings keep adding up until then.' })
        }
      />
    </Screen>
  );
}
