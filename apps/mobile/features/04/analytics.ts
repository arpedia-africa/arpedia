import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';
import { offlineBooks } from './bookfiles';

// Flow 04 events (Analytics section). Never sends book text, quotes or notes.
export type ReaderEvent =
  | 'reader_opened'
  | 'reader_ready_ms'
  | 'reader_error'
  | 'page_turn_held'
  | 'preview_end_seen'
  | 'chapter_card_seen'
  | 'chapter_unlocked'
  | 'chapter_unlock_failed'
  | 'chapter_undo'
  | 'low_balance_in_reader'
  | 'pay_rest'
  | 'highlight_created'
  | 'selection_toolbar_shown'
  | 'note_saved'
  | 'discussion_opened'
  | 'passage_comment_posted'
  | 'settings_changed'
  | 'book_finished'
  | 'download_started'
  | 'download_completed'
  | 'download_failed'
  | 'license_expired_open_attempt';

export type Track = (event: ReaderEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;

/** Wraps a download in `download_started|completed|failed {scope, bytes}`; bytes are what is on disk. */
export async function trackedDownload<T>(
  track: Track | undefined,
  bookId: string,
  scope: string,
  run: () => Promise<T>,
): Promise<T> {
  if (!track) return run();
  track('download_started', { scope });
  const bytes = async () =>
    (await offlineBooks().catch(() => [])).find((b) => b.bookId === bookId)?.bytes ?? 0;
  try {
    const out = await run();
    track('download_completed', { scope, bytes: await bytes() });
    return out;
  } catch (e) {
    track('download_failed', { scope, bytes: await bytes() });
    throw e;
  }
}
