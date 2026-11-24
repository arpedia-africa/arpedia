import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePostHog } from 'posthog-react-native';
import { supabase } from '@/lib/supabase';
import { registerDevice } from '../01/session';

/** Where a push or announcement tap opens (flow 15 `open_target`). */
export interface Target {
  kind: string;
  id?: string;
  screen?: string;
  url?: string;
}

const SCREENS: Record<string, Href> = {
  home: '/home',
  library: '/library',
  community: '/community',
  credits: '/credits',
  plans: '/plan',
  discover: '/explore',
  studio: '/studio',
  earnings: '/studio/earnings',
};

/** Route for a target; `source` tags the book and author page views (push, notifications). */
export function hrefFor(t: Target | null | undefined, source = 'push'): Href | null {
  if (!t) return null;
  if (t.kind === 'screen') return SCREENS[t.screen ?? ''] ?? '/home';
  if (!t.id) return '/home';
  switch (t.kind) {
    case 'book':
      return { pathname: '/book/[id]', params: { id: t.id, source } };
    case 'reader':
      return { pathname: '/read/[id]', params: { id: t.id } };
    case 'author':
    case 'profile':
      return { pathname: '/author/[id]', params: { id: t.id, source } };
    case 'post':
      return { pathname: '/post/[id]', params: { id: t.id } };
    case 'room':
      return { pathname: '/room/[id]', params: { id: t.id } };
    case 'group':
    case 'club':
      return `/chat/${t.id}` as Href;
    default:
      return '/home';
  }
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

export type PushTrigger = 'follow' | 'join' | 'unlock' | 'notify';
type PushTrack = (
  event: 'push_permission_prompted' | 'push_permission_result',
  props: Record<string, string | boolean>,
) => void;

const ASKED_KEY = 'push.permission.asked';
let asking = false;

/**
 * Rule 9: Android asks for notifications once, at the first useful moment (the first follow, join or
 * unlock), never on first launch. Already granted: just registers the token. A denial blocks nothing;
 * Notifications settings shows the "off" banner after that.
 */
async function askPushPermission(trigger: PushTrigger, track: PushTrack) {
  if (asking) return;
  asking = true;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) return void (await registerPushToken());
    if (!perm.canAskAgain || (await AsyncStorage.getItem(ASKED_KEY))) return;
    await AsyncStorage.setItem(ASKED_KEY, '1');
    track('push_permission_prompted', { trigger });
    const r = await Notifications.requestPermissionsAsync();
    track('push_permission_result', { trigger, granted: r.granted });
    if (r.granted) await registerPushToken();
  } catch {
    // no prompt available (emulator without Play services): the banner in Notifications settings
  } finally {
    asking = false;
  }
}

function usePostHogPushTrack(): PushTrack {
  const posthog = usePostHog();
  return useCallback<PushTrack>((event, props) => posthog.capture(event, props), [posthog]);
}
const noTrack: PushTrack = () => {};
const usePushTrack: () => PushTrack = process.env.EXPO_PUBLIC_POSTHOG_KEY
  ? usePostHogPushTrack
  : () => noTrack;

/** Call after a follow, join or unlock succeeds. */
export function useAskPush(): (trigger: PushTrigger) => void {
  const track = usePushTrack();
  return useCallback((trigger: PushTrigger) => void askPushPermission(trigger, track), [track]);
}

/**
 * Register this phone's Expo push token once permission is granted (never asked here: see
 * `useAskPush`). Goes through flow 01's register_device, which keeps the token on the device row.
 * Failures are silent and retried on the next app start.
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

/** Fire-and-forget RPC. A Supabase query only runs once `.then` is called, so `void rpc()` sends nothing. */
export function send(query: PromiseLike<unknown>) {
  query.then(
    () => undefined,
    () => undefined,
  );
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
  if (typeof data.push_id === 'number') send(supabase.rpc('push_opened', { p_push_id: data.push_id }));
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
