import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 06 events (Analytics section). Never send message text or names.
export type CommunityEvent =
  | 'community_opened'
  | 'inbox_filter_changed'
  | 'group_joined'
  | 'group_left'
  | 'message_sent'
  | 'message_reacted'
  | 'message_pinned'
  | 'message_deleted'
  | 'discover_searched'
  | 'report_started'
  | 'report_sent'
  | 'user_blocked'
  | 'user_unblocked';

export type Track = (event: CommunityEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
