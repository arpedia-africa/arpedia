import { router, type Href } from 'expo-router';
import type { useTrack } from './analytics';
import { onboardingClock, saveStep } from './steps';

/**
 * Leave onboarding for Home: saves `done`. Notification permission is not asked here: flow 15 rule 9
 * asks at the first follow, join or unlock (`useAskPush`), never on first launch.
 * `then` opens a page over Home (a first-step card on s-all-set), so Back lands on Home.
 */
export async function finishOnboarding(track: ReturnType<typeof useTrack>, then?: Href) {
  void saveStep('done');
  track('onboarding_completed', { seconds: onboardingClock.seconds() });
  router.replace('/home');
  if (then) router.push(then);
}
