import { useCallback, useRef } from 'react';
import { usePostHog } from 'posthog-react-native';
import { dmReplyHours, type ChatMessage } from '@arpedia/core';

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
  | 'dm_author_replied'
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

/**
 * In a DM thread (kind 'dm', owner = the author), call the returned function after the author sends:
 * fires `dm_author_replied` with `hours_to_reply` when a reader message was waiting. No-op elsewhere.
 */
export function useTrackAuthorReply(
  group: { kind: string; owner_id: string } | undefined,
  history: readonly ChatMessage[] | undefined,
  me: string | undefined,
) {
  const track = useTrack();
  // A second send before the first is acknowledged sees the same history: count the reply once.
  const counted = useRef<string | null>(null);
  return useCallback(() => {
    if (!group || group.kind !== 'dm' || !me || group.owner_id !== me) return;
    const last = history?.[history.length - 1]?.id ?? null;
    if (last !== null && counted.current === last) return;
    const hours = dmReplyHours(history ?? [], me);
    if (hours === null) return;
    counted.current = last;
    track('dm_author_replied', { hours_to_reply: hours });
  }, [group, history, me, track]);
}
