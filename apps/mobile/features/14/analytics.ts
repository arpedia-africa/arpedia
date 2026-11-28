import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 14 events the app sends (Analytics section). appeal_created and ticket_created
// come from table triggers on the server (20261128031500_14_trust_events.sql), so the app
// never sends them: that would count each one twice.
export type TrustEvent =
  'report_started' | 'report_sent' | 'help_article_viewed' | 'help_vote' | 'contact_support_opened';

type Track = (event: TrustEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
