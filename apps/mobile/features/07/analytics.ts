import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 07 events (Analytics section).
export type RoomsEvent =
  | 'rooms_opened'
  | 'room_created'
  | 'room_join_attempted'
  | 'room_joined'
  | 'room_left'
  | 'room_ended'
  | 'room_spoiler_revealed'
  | 'room_annotations_unlocked'
  | 'room_message_sent'
  | 'room_finished_by_member';

type Track = (event: RoomsEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
