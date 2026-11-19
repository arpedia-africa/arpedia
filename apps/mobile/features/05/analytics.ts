import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 05 events (Analytics section).
export type LibraryEvent =
  | 'library_opened'
  | 'shelf_changed'
  | 'library_view_toggled'
  | 'library_search'
  | 'library_filter_applied'
  | 'library_book_opened'
  | 'pay_rest_viewed'
  | 'pay_rest_confirmed'
  | 'download_removed'
  | 'offline_shelf_refresh'
  | 'library_empty_cta';

type Track = (event: LibraryEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
