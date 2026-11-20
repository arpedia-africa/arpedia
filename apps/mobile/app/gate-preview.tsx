import { Redirect, useLocalSearchParams } from 'expo-router';
import { kitEnabled } from '@/lib/kit';
import { ForceUpdateView, MaintenanceView, PolicyAcceptView } from '../features/16/GateViews';

// Kit-only preview of the flow 16 notices (no prototype screen to compare): /gate-preview?v=maintenance|update|policy
export default function GatePreview() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  if (!kitEnabled) return <Redirect href="/" />;
  const noop = () => {};
  if (v === 'update') return <ForceUpdateView minVersion="26.2" onUpdate={noop} />;
  if (v === 'policy')
    return (
      <PolicyAcceptView
        policies={[
          {
            id: 'a',
            slug: 'terms',
            title: 'Terms of service',
            version: 2,
            change_summary: 'Credits bought on the web now last 24 months. We explain how refunds work.',
          },
          {
            id: 'b',
            slug: 'privacy',
            title: 'Privacy policy',
            version: 3,
            change_summary: 'We added Firebase Cloud Messaging to the list of services we use.',
          },
        ]}
        accepting={false}
        error={null}
        onOpen={noop}
        onAccept={noop}
      />
    );
  return (
    <MaintenanceView
      message="We're moving to faster servers. Back by 3 pm. Books you downloaded still open."
      checking={false}
      onRetry={noop}
    />
  );
}
