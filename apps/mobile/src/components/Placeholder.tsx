import { EmptyState, Screen } from '@arpedia/ui';

/** Holds a route until its flow builds the real screen. */
export function Placeholder({ title, flow }: { title: string; flow: string }) {
  return (
    <Screen>
      <EmptyState title={title} body={`This screen comes in flow ${flow}.`} />
    </Screen>
  );
}
