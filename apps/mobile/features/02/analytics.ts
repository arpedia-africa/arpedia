import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 02 events (Analytics section). Query text is never sent: it goes only to `search_events`.
export type DiscoveryEvent =
  | 'home_viewed'
  | 'shelf_card_tapped'
  | 'see_all_tapped'
  | 'explore_opened'
  | 'filter_applied'
  | 'search_opened'
  | 'search_suggestion_tapped'
  | 'search_submitted'
  | 'search_result_tapped'
  | 'search_no_results'
  | 'book_requested'
  | 'notification_opened'
  | 'notifications_marked_all';

type Track = (event: DiscoveryEvent, props?: Record<string, string | number | boolean | null>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
