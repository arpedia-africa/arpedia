import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 11 events (Analytics section). Never send names, email, phone, birthday or sample text.
export type AuthorEvent =
  | 'author_cta_viewed'
  | 'application_started'
  | 'application_step_completed'
  | 'application_draft_saved'
  | 'application_sent'
  | 'studio_opened'
  | 'book_submit_started'
  | 'book_processing_done'
  | 'chapters_confirmed'
  | 'book_submitted'
  | 'book_update_submitted'
  | 'studio_earnings_viewed'
  | 'author_post_created';

type Track = (event: AuthorEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

// The key is fixed at build time, so the hook choice never changes between renders.
const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
