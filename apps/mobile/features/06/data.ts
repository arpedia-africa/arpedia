import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AvatarTone } from '@arpedia/ui';
import type { Database } from '@arpedia/core';
import { supabase } from '@/lib/supabase';

// Flow 06 server data: inbox rows, filter counts, Mark all read (RPCs in 20261119000600_06_community).

export type InboxFilter = 'all' | 'unread' | 'groups';
export type InboxRow = Database['public']['Functions']['get_inbox']['Returns'][number];
export interface InboxCounts {
  all: number;
  unread: number;
  groups: number;
  /** Community tab badge: unread conversations that aren't muted. */
  tab: number;
  muted_unread: number;
}

export const inboxKey = (filter: InboxFilter) => ['community', 'inbox', filter] as const;
export const countsKey = ['community', 'inbox-counts'] as const;

/** No Realtime: the inbox refreshes on focus and every 20 s while it is open (flow 06 Notes). */
const POLL_MS = 20_000;

export function useInbox(filter: InboxFilter) {
  return useQuery({
    queryKey: inboxKey(filter),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inbox', { p_filter: filter, p_limit: 100 });
      if (error) throw error;
      return data;
    },
    refetchInterval: POLL_MS,
  });
}

export function useInboxCounts() {
  return useQuery({
    queryKey: countsKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_inbox_counts');
      if (error) throw error;
      return data as unknown as InboxCounts;
    },
    refetchInterval: POLL_MS,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('mark_all_read');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community'] }),
  });
}

const TONES: AvatarTone[] = ['n', 'm', 'o', 'b', 'k', 't', 'g', 'r'];

/** A stable avatar tone per conversation (the prototype colours each one differently). */
export function toneFor(id: string): AvatarTone {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
}
