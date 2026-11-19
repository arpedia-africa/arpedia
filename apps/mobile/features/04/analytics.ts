import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 04 events (Analytics section).
export type ReaderEvent =
  | 'reader_opened'
  | 'chapter_unlocked'
  | 'chapter_undo'
  | 'low_balance_in_reader'
  | 'pay_rest'
  | 'highlight_created'
  | 'book_finished';

type Track = (event: ReaderEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
