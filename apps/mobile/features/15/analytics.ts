import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 15 app events (Analytics section; they feed analytics_daily). No message text or names.
export type EngageEvent =
  | 'push_permission_prompted'
  | 'push_permission_result'
  | 'push_received'
  | 'push_opened'
  | 'notification_feed_opened'
  | 'notification_item_opened'
  | 'notif_prefs_changed'
  | 'quiet_hours_changed'
  | 'banner_shown'
  | 'banner_tapped'
  | 'banner_dismissed'
  | 'session_start'
  | 'paragraph_comment_created';

export type Track = (event: EngageEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
