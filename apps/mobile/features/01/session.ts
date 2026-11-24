import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { resumeScreen, type OnboardingStep, type Tables } from '@arpedia/core';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';

/** Current session: undefined while it loads from secure storage, then Session or null. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void supabase.auth.getSession().then(({ data }) => live && setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return session;
}

export type MyProfile = Pick<
  Tables<'profiles'>,
  | 'id'
  | 'full_name'
  | 'avatar_url'
  | 'theme'
  | 'onboarding_step'
  | 'signup_intent'
  | 'phone'
  | 'date_of_birth'
  | 'country'
>;

export const profileKey = (uid: string | undefined) => ['profile', uid] as const;

/** The signed-in reader's own profile row (cached for offline starts). */
export function useMyProfile(uid: string | undefined) {
  return useQuery({
    queryKey: profileKey(uid),
    enabled: !!uid,
    queryFn: async (): Promise<MyProfile> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, full_name, avatar_url, theme, onboarding_step, signup_intent, phone, date_of_birth, country',
        )
        .eq('id', uid!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** Route for a saved onboarding step (rule 29): the first unfinished screen, or Home. */
export function routeForStep(step: string | undefined) {
  const screen = resumeScreen((step ?? 'done') as OnboardingStep);
  return screen ? (`/(onboarding)/${screen}` as const) : ('/home' as const);
}

/** Thrown by afterSignIn for a deleted account that can't be restored (flow 10 rule 36, edge cases). */
export class AccountDeleted extends Error {
  constructor() {
    super('account_deleted');
  }
}
export const isAccountDeleted = (e: unknown) => e instanceof AccountDeleted;

/**
 * After any sign-in: stop a deleted account, register the phone, then Home or the first unfinished
 * onboarding step. Staff's "Delete after 30 days" comes back by signing in within the grace.
 */
export async function afterSignIn(uid: string) {
  const { data } = await supabase
    .from('profiles')
    .select('onboarding_step, deleted_at')
    .eq('id', uid)
    .single();
  if (data?.deleted_at) {
    const { data: restored } = await supabase.rpc('restore_my_account');
    if (restored !== true) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      throw new AccountDeleted();
    }
  }
  void registerDevice();
  void queryClient.invalidateQueries({ queryKey: profileKey(uid) });
  router.replace(routeForStep(data?.onboarding_step));
}

/**
 * Log out on this phone (flow 10 rule 17): its push token goes first, so the next account's pushes
 * never reach it (flow 15 rule 11). Offline, the sign-out still happens.
 */
export async function signOutHere() {
  try {
    const key = await SecureStore.getItemAsync(DEVICE_KEY);
    if (key) await supabase.rpc('remove_push_token', { p_device_id: key });
  } catch {
    // offline: sign out anyway
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  queryClient.clear();
}

// ─── Device registration (rule 31) ──────────────────────────────────────────
const DEVICE_KEY = 'arpedia.device_key';

async function deviceKey() {
  let key = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(24);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(DEVICE_KEY, key);
  }
  return key;
}

/** Register this phone for the signed-in reader. Never blocks sign-in: failures are retried next time. */
export async function registerDevice(pushToken?: string | null) {
  try {
    await supabase.rpc('register_device', {
      p_device_key: await deviceKey(),
      p_model: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || undefined,
      p_os: `${Platform.OS === 'android' ? 'Android' : 'iOS'} ${Device.osVersion ?? ''}`.trim(),
      p_app_version: Application.nativeApplicationVersion ?? undefined,
      p_push_token: pushToken ?? undefined,
    });
  } catch {
    // offline or server down: the next sign-in or app start registers it
  }
}

// ─── Error copy (rules 4, 8, 9 and States) ──────────────────────────────────
export const COPY = {
  offline: 'No connection. Check your network and try again.',
  wrongLogin: 'That email and password don’t match.',
  tooMany: 'Too many tries. Try again in 15 minutes or reset your password.',
  googleFailed: 'Google sign-in didn’t work. Try again.',
  generic: 'Something went wrong. Try again.',
  deleted: 'This account was deleted.',
};

/** Network failures from supabase-js surface as fetch TypeErrors or status 0. */
export const isNetworkError = (e: unknown) => {
  const err = e as { name?: string; status?: number; message?: string } | null;
  return (
    !!err &&
    (err.name === 'AuthRetryableFetchError' ||
      err.status === 0 ||
      /network request failed|failed to fetch/i.test(err.message ?? ''))
  );
};

export const isRateLimited = (e: unknown) => {
  const err = e as { status?: number; code?: string } | null;
  return !!err && (err.status === 429 || err.code === 'over_request_rate_limit');
};
