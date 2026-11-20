import { View } from 'react-native';
import { Btn, Callout, Cell, Group, Hero, Screen, Section, useBottomInset, useTheme } from '@arpedia/ui';
import type { PendingPolicy } from './config';

// No prototype screen exists for these three notices (flow 16 rules 26, 25, 38). They are built
// only from prototype parts, in the `s-all-set` / `s-apply-sent` layout: low hero with title and
// sub, a body section, one full-width button in a flat foot.

function Foot({ children }: { children: React.ReactNode }) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(26);
  return (
    <View
      style={{
        paddingTop: s(12),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        backgroundColor: c.white,
        gap: s(8),
      }}
    >
      {children}
    </View>
  );
}

const bar = <View style={{ flex: 1 }} />;

/** Maintenance mode (rule 26): staff message; books on the phone still open. */
export function MaintenanceView({
  message,
  checking,
  onRetry,
}: {
  message: string | null;
  checking: boolean;
  onRetry: () => void;
}) {
  const { s } = useTheme();
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <Foot>
          <Btn label="Try again" variant="s" block loading={checking} onPress={onRetry} />
        </Foot>
      }
    >
      <Hero
        low
        bar={bar}
        title="We'll be back soon"
        sub={message?.trim() || 'Arpedia is having a short break for maintenance.'}
      />
      <View style={{ padding: s(16) }}>
        <Callout tone="info">Books you downloaded still open. Your credits and progress are safe.</Callout>
      </View>
    </Screen>
  );
}

/** Force update (rule 25): this app version is below the minimum. */
export function ForceUpdateView({
  minVersion,
  onUpdate,
}: {
  minVersion: string | null;
  onUpdate: () => void;
}) {
  const { s } = useTheme();
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <Foot>
          <Btn label="Update Arpedia" block onPress={onUpdate} />
        </Foot>
      }
    >
      <Hero
        low
        bar={bar}
        title="Time to update"
        sub={
          minVersion
            ? `This version of Arpedia is no longer supported. Update to ${minVersion} or newer to keep reading.`
            : 'This version of Arpedia is no longer supported. Update to keep reading.'
        }
      />
      <View style={{ padding: s(16) }}>
        <Callout tone="quiet">Your library, credits and progress are kept. It takes about a minute.</Callout>
      </View>
    </Screen>
  );
}

/** Accept again (rule 38): full-screen notice on next open; Accept keeps the app usable. */
export function PolicyAcceptView({
  policies,
  accepting,
  error,
  onOpen,
  onAccept,
}: {
  policies: PendingPolicy[];
  accepting: boolean;
  error: string | null;
  onOpen: (p: PendingPolicy) => void;
  onAccept: () => void;
}) {
  const { s } = useTheme();
  const one = policies.length === 1 ? policies[0] : null;
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <Foot>
          <Btn label="Accept and continue" block loading={accepting} onPress={onAccept} />
        </Foot>
      }
    >
      <Hero
        low
        bar={bar}
        title={one ? `We've updated our ${one.title}` : "We've updated our policies"}
        sub="Please read what changed. Tap Accept to keep using Arpedia."
      />
      <Section title="What changed">
        <Group>
          {policies.map((p) => (
            <Cell
              key={p.id}
              top
              title={`${p.title} · version ${p.version}`}
              sub={p.change_summary ?? undefined}
              chevron
              onPress={() => onOpen(p)}
            />
          ))}
        </Group>
      </Section>
      {error ? (
        <View style={{ paddingHorizontal: s(16), paddingBottom: s(16) }}>
          <Callout tone="err">{error}</Callout>
        </View>
      ) : null}
    </Screen>
  );
}
