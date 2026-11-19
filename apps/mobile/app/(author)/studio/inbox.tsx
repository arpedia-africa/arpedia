import { useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { STUDIO } from '../../../features/11/application';
import { StudioInboxView, type InboxFilter } from '../../../features/11/StudioCommsViews';

/**
 * s-studio-inbox: waiting messages first, oldest first; replying is free for the author (rule 32).
 * Paid private messages are flow 08's; until it lands there is nothing to list, so the inbox shows
 * its empty state.
 */
export default function StudioInbox() {
  const [filter, setFilter] = useState<InboxFilter>('waiting');
  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioInboxView
        filter={filter}
        waiting={0}
        rows={[]}
        state="ready"
        onFilter={setFilter}
        onRow={() => {}}
        onRetry={() => {}}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(STUDIO))}
      />
    </Screen>
  );
}
