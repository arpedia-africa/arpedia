// Flow 10 · server data for Profile and Settings (TanStack Query over the flow 10 RPCs).
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import type { CollectionKind, CollectionPage } from './CollectionViews';
import type { DeviceRow, NotifKey, NotifPrefs } from './SettingsViews';

const api = process.env.EXPO_PUBLIC_API_URL ?? '';

/** This phone's device key (flow 01 stores it at sign-in under the same name). */
export const thisDeviceKey = () => SecureStore.getItemAsync('arpedia.device_key');

/** A Supabase error code from an RPC (`22023` with the message as the reason). */
export const rpcReason = (e: unknown) => (e as { message?: string } | null)?.message ?? '';

// ─── My highlights ──────────────────────────────────────────────────────────
export const collectionKey = (kind: CollectionKind, q: string) => ['collection', kind, q] as const;

export function useCollection(kind: CollectionKind, query: string) {
  return useInfiniteQuery({
    queryKey: collectionKey(kind, query),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('list_collection', {
        p_kind: kind,
        p_cursor: pageParam ?? undefined,
        p_query: query || undefined,
      });
      if (error) throw error;
      return data as unknown as CollectionPage;
    },
    getNextPageParam: (last) => last.next,
  });
}

export async function deleteAnnotation(id: string) {
  const { error } = await supabase.rpc('delete_annotation', { p_id: id });
  if (error) throw error;
}
export async function restoreAnnotation(id: string) {
  const { error } = await supabase.rpc('restore_annotation', { p_id: id });
  if (error) throw error;
}

// ─── Notification preferences ───────────────────────────────────────────────
export const prefsKey = ['notification-prefs'] as const;

export function useNotifPrefs() {
  return useQuery({
    queryKey: prefsKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_notification_preferences');
      if (error) throw error;
      return data as unknown as NotifPrefs;
    },
  });
}

/** Saves on tap; a failed save puts the toggle back (rule 21). */
export function useSetNotifPref() {
  return useMutation({
    networkMode: 'offlineFirst',
    mutationFn: async ({ k, v }: { k: NotifKey; v: boolean }) => {
      const { error } = await supabase.rpc('set_notification_preferences', { p_patch: { [k]: v } });
      if (error) throw error;
    },
    onMutate: ({ k, v }) => {
      const before = queryClient.getQueryData<NotifPrefs>(prefsKey);
      if (before) queryClient.setQueryData<NotifPrefs>(prefsKey, { ...before, [k]: v });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(prefsKey, ctx.before);
    },
  });
}

// ─── Devices ────────────────────────────────────────────────────────────────
export const devicesKey = ['my-devices'] as const;

export function useMyDevices() {
  return useQuery({
    queryKey: devicesKey,
    queryFn: async () => {
      const key = await thisDeviceKey();
      const { data, error } = await supabase.rpc('list_my_devices', { p_device_key: key ?? undefined });
      if (error) throw error;
      return data as unknown as { enabled: number; devices: DeviceRow[] };
    },
  });
}

export async function removeDevice(id: string) {
  const key = await thisDeviceKey();
  const { error } = await supabase.rpc('remove_device', {
    p_device_id: id,
    p_current_device_key: key ?? undefined,
  });
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: devicesKey });
}

// ─── Profile edits ──────────────────────────────────────────────────────────
export async function updateProfile(patch: Record<string, string | null>) {
  const { data, error } = await supabase.rpc('update_profile', { p: patch });
  if (error) throw error;
  return data;
}

export async function setReaderTheme(theme: 'light' | 'sepia' | 'dark', uid: string) {
  const { error } = await supabase.from('profiles').update({ reader_theme: theme }).eq('id', uid);
  if (error) throw error;
}

/** Change password through the api Worker (it re-checks the current one, then ends other sessions). */
export async function changePassword(current: string, next: string) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${api}/v1/account/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ current, new: next }),
  });
  if (res.ok) return 'ok' as const;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return (body.error ?? 'error') as
    'wrong_password' | 'weak_password' | 'no_password' | 'rate_limited' | 'error';
}

export async function requestDeletion(text: string) {
  const { error } = await supabase.rpc('request_account_deletion', { p_confirm_text: text });
  if (error) throw error;
}

export interface ProfileSummary {
  books_read: number;
  following: number;
  highlights: number;
  bookmarks: number;
  notes: number;
  year: number;
  /** Lagos date, YYYY-MM-DD. */
  today: string;
  read_this_year: number;
  goal: number | null;
  last_year: { target: number; read: number } | null;
  is_author: boolean;
}

export const summaryKey = ['profile-summary'] as const;

/** Profile counts and goal in one call (rule 2); cached so Profile works offline. */
export function useProfileSummary(enabled = true) {
  return useQuery({
    queryKey: summaryKey,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profile_summary');
      if (error) throw error;
      return data as unknown as ProfileSummary;
    },
  });
}

/** Set goal for a year; the count never changes (rule 9). */
export function useSetGoal() {
  return useMutation({
    mutationFn: async ({ year, target }: { year: number; target: number }) => {
      const { error } = await supabase.rpc('set_reading_goal', { p_year: year, p_target: target });
      if (error) throw error;
      return target;
    },
    onSuccess: (target) =>
      queryClient.setQueryData<ProfileSummary>(summaryKey, (old) => (old ? { ...old, goal: target } : old)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: summaryKey }),
  });
}
