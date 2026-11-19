import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 09 events (Analytics section). Revenue reports come from the database, not PostHog.
export type CreditsEvent =
  | 'checkout_started'
  | 'purchase_completed'
  | 'purchase_failed'
  | 'topup_started'
  | 'topup_completed'
  | 'credits_viewed'
  | 'pause_offered'
  | 'pause_started'
  | 'cancel_started'
  | 'promo_redeemed';

type Track = (event: CreditsEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
