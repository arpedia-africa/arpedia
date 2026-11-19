import { useCallback } from 'react';
import { usePostHog } from 'posthog-react-native';

// Flow 01 events (Analytics section). Never send email, phone or birthday.
export type OnboardingEvent =
  | 'signup_started'
  | 'signup_completed'
  | 'login_succeeded'
  | 'login_failed'
  | 'onboarding_step_viewed'
  | 'onboarding_step_skipped'
  | 'genres_selected'
  | 'theme_selected'
  | 'role_selected'
  | 'profile_completed'
  | 'paywall_viewed'
  | 'plan_selected'
  | 'paywall_closed'
  | 'restore_tapped'
  | 'onboarding_completed';

type Track = (event: OnboardingEvent, props?: Record<string, string | number | boolean>) => void;
const noop: Track = () => {};

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}

// The key is fixed at build time, so the hook choice never changes between renders.
// Without a key there is no PostHogProvider, and usePostHog would log an error on every screen.
const useNoTrack = () => noop;

/** No-op when PostHog is off (local builds have no key). */
export const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : useNoTrack;
