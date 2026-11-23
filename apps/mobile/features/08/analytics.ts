import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 08 events (Analytics section).
export type AuthorEvent =
  | 'author_profile_viewed'
  | 'author_followed'
  | 'author_unfollowed'
  | 'author_tab_opened'
  | 'post_opened'
  | 'post_liked'
  | 'comment_added'
  | 'author_community_joined'
  | 'dm_cost_notice_viewed'
  | 'dm_started'
  | 'dm_message_sent'
  | 'dm_blocked_by_balance'
  | 'tip_started_from_profile';

type Track = (event: AuthorEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
