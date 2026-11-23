import { Redirect, useLocalSearchParams } from 'expo-router';
import { ThemeProvider, THEMES, type ThemeName } from '@arpedia/ui';
import { kitEnabled } from '@/lib/kit';
import { ForceUpdateView, MaintenanceView, PolicyAcceptView } from '../features/16/GateViews';

// Kit-only preview of the flow 16 notices (no prototype screen to compare): /gate-preview?v=maintenance|update|policy&theme=palm
export default function GatePreview() {
  const { v, theme } = useLocalSearchParams<{ v?: string; theme?: string }>();
  if (!kitEnabled) return <Redirect href="/" />;
  const name = (THEMES as string[]).includes(theme ?? '') ? (theme as ThemeName) : undefined;
  if (!name) return <Notice v={v} />;
  return (
    <ThemeProvider key={name} theme={name}>
      <Notice v={v} />
    </ThemeProvider>
  );
}

function Notice({ v }: { v?: string }) {
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
      message="We're moving to faster servers. We'll be back by 3 pm today."
      checking={false}
      onRetry={noop}
    />
  );
}
