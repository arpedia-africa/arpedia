import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 03 events (Analytics section).
export type BookEvent =
  | 'book_viewed'
  | 'buy_option_tapped'
  | 'unlock_sheet_viewed'
  | 'book_unlocked'
  | 'unlock_failed'
  | 'paygo_started'
  | 'topup_from_unlock'
  | 'gift_sent'
  | 'tip_sent'
  | 'review_posted'
  | 'review_reported'
  | 'reviewer_hidden'
  | 'discussion_locked_tapped'
  | 'download_requested';

type Track = (event: BookEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
