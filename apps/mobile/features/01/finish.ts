import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { useTrack } from './analytics';
import { onboardingClock, saveStep } from './steps';

/**
 * Leave onboarding for Home: saves `done`, asks once for notification permission (Q92: on "Go to
 * Home"; the ✕ "Browse first" path lands on Home too, so it asks there). A denial blocks nothing.
 */
export async function finishOnboarding(track: ReturnType<typeof useTrack>) {
  void saveStep('done');
  track('onboarding_completed', { seconds: onboardingClock.seconds() });
  router.replace('/home');
  try {
    await Notifications.requestPermissionsAsync();
  } catch {
    // no prompt available (emulator without Play services): Notifications settings shows a banner later
  }
}
