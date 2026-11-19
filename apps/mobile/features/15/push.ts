import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { supabase } from '@/lib/supabase';
import { registerDevice } from '../01/session';

/** Where a push or announcement tap opens (flow 15 `open_target`). */
export interface Target {
  kind: string;
  id?: string;
  screen?: string;
  url?: string;
}

// Screens that exist today. Discover, credits, plans, book, author and room pages arrive with flows
// 02, 09, 03, 08 and 07 and open Home until then (their routes are added here when those merge).
const SCREENS: Record<string, Href> = {
  home: '/home',
  library: '/library',
};

export function hrefFor(t: Target | null | undefined): Href | null {
  if (!t) return null;
  if (t.kind === 'screen') return SCREENS[t.screen ?? ''] ?? '/home';
  if (t.kind === 'group' && t.id) return `/chat/${t.id}` as Href;
  return '/home';
}

/** Open a target: arpedia.africa links in the browser, everything else in the app. */
export function openTarget(t: Target | null | undefined) {
  if (t?.kind === 'web' && t.url?.startsWith('https://')) {
    void Linking.openURL(t.url);
    return;
  }
  const href = hrefFor(t);
  if (href) router.push(href);
}

/**
 * Register this phone's Expo push token once permission is granted (rule 1: never asked here;
 * onboarding asks once). Goes through flow 01's register_device, which keeps the token on the
 * device row. Failures are silent and retried on the next app start.
 */
export async function registerPushToken() {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await registerDevice(data);
  } catch {
    // no Play services or offline: the next start tries again
  }
}

// The tap that launched the app is also returned on later mounts: open it once.
let handled: string | null = null;

function open(response: Notifications.NotificationResponse | null) {
  const id = response?.notification.request.identifier;
  if (!id || id === handled) return;
  handled = id;
  const data = response?.notification.request.content.data as
    { push_id?: number; target?: Target } | undefined;
  if (!data) return;
  if (typeof data.push_id === 'number') void supabase.rpc('push_opened', { p_push_id: data.push_id });
  openTarget(data.target);
}

/**
 * Signed-in shell: registers the push token and opens what a tapped push points to, both from a
 * running app and from a cold start (the tap that launched the app).
 */
export function usePushHandling() {
  useEffect(() => {
    void registerPushToken();
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    const tokens = Notifications.addPushTokenListener(() => void registerPushToken());
    return () => {
      sub.remove();
      tokens.remove();
    };
  }, []);
}
