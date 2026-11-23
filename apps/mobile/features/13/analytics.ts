import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 13 events (Analytics section). Never send account numbers or account names.
export type EarningsEvent = 'earnings_viewed' | 'payout_account_viewed' | 'bank_account_submitted';

type Track = (event: EarningsEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useEarningsTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY
  ? usePostHogTrack
  : useNoTrack;
