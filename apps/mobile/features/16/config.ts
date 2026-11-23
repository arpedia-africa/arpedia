import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import { focusManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const api = process.env.EXPO_PUBLIC_API_URL ?? '';

export interface AppConfig {
  min_version: string | null;
  force_update: boolean;
  maintenance: { on: boolean; message: string | null };
  flags: Record<string, boolean>;
  copy: Record<string, string>;
}

export interface PendingPolicy {
  id: string;
  slug: string;
  title: string;
  version: number;
  change_summary: string | null;
}

/** `major.minor` of the installed app ("26.0.0" → "26.0"), the form the console compares. */
export const appVersion = (Application.nativeApplicationVersion ?? '0.0').split('.').slice(0, 2).join('.');

// Rule 30: config is read at start, on returning to the foreground and at most once a minute.
// TanStack refetches stale queries on focus; this tells it when the app comes back.
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (st) => setFocused(st === 'active'));
  return () => sub.remove();
});

export function useAppConfig() {
  return useQuery({
    queryKey: ['app-config'],
    queryFn: async (): Promise<AppConfig> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`${api}/v1/app-config?v=${appVersion}&platform=${Platform.OS}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`app-config ${res.status}`);
      return (await res.json()) as AppConfig;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

/** Remote copy (rule 29) with the bundled text as fallback when the load fails. */
export function useRemoteCopy(key: string, fallback: string, vars: Record<string, string | number> = {}) {
  const { data } = useAppConfig();
  const text = data?.copy[key] || fallback;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function useFlag(key: string) {
  return useAppConfig().data?.flags[key] === true;
}

export function usePendingPolicies(userId: string | undefined) {
  return useQuery({
    queryKey: ['pending-policies', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_pending_policies');
      if (error) throw error;
      return (data ?? []) as unknown as PendingPolicy[];
    },
    staleTime: 60_000,
  });
}

export function useAcceptPolicies(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const { error } = await supabase.rpc('accept_policy', { p_version: id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-policies', userId] }),
  });
}

/** Fires `cb` once each time `on` turns true (analytics "shown" events). */
export function useOnShown(on: boolean, cb: () => void) {
  useEffect(() => {
    if (on) cb();
  }, [on]); // cb is a fresh closure each render; only the false → true change counts
}
