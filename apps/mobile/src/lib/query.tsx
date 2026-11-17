import type { ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { supabase } from './supabase';

// TanStack Query follows the phone's real connection, and cached server data survives restarts so
// screens open offline (CLAUDE.md: every screen has an offline state).
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: 1000 * 60 * 60 * 24, staleTime: 1000 * 30, retry: 2, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'online', retry: 0 },
  },
});

const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'arpedia.query' });

// The cache holds one reader's balance, library and profile. Drop it (memory and disk) when they
// sign out or another account signs in, so the next reader never sees it.
let cachedUserId: string | null | undefined;
supabase.auth.onAuthStateChange((event, session) => {
  const userId = session?.user.id ?? null;
  const changed = cachedUserId !== undefined && cachedUserId !== userId;
  if (event === 'SIGNED_OUT' || changed) {
    queryClient.clear();
    void persister.removeClient();
  }
  cachedUserId = userId;
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
