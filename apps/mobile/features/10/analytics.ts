import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 10 events (Analytics section). No personal values: field names, never what was typed.
export type ProfileEvent =
  | 'profile_viewed'
  | 'goal_set'
  | 'collection_opened'
  | 'collection_item_opened'
  | 'annotation_deleted'
  | 'settings_row_tapped'
  | 'theme_changed'
  | 'notif_pref_changed'
  | 'profile_saved'
  | 'password_changed'
  | 'device_removed'
  | 'delete_account_started'
  | 'delete_account_confirmed'
  | 'delete_account_cancelled'
  | 'invite_shared';

export type Track = (event: ProfileEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
