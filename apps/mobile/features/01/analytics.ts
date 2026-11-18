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

/** No-op when PostHog is off (local builds have no key). */
export function useTrack() {
  const posthog = usePostHog() as ReturnType<typeof usePostHog> | undefined;
  return useCallback(
    (event: OnboardingEvent, props?: Record<string, string | number | boolean>) =>
      posthog?.capture(event, props),
    [posthog],
  );
}
