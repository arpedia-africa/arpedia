// Notifications feed (docs/prd/02-discovery.md rules 30–33): latest 50, older on scroll, mark read.
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { avatarTone, coverTone, homeKey } from './home';
import type { NotifCategory, NotifRow } from './NotificationViews';

export interface ServerNotif {
  id: string;
  kind: string;
  category: 'books' | 'authors' | 'community';
  title: string;
  body: string;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  read_at: string | null;
  book_id: string | null;
  book_title: string | null;
  cover_key: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
}
interface Page {
  unread: number;
  unread_by_category: Partial<Record<ServerNotif['category'], number>>;
  items: ServerNotif[];
}

const key = (c: NotifCategory) => ['notifications', c] as const;

export function useNotifications(category: NotifCategory) {
  return useInfiniteQuery({
    queryKey: key(category),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_notifications', {
        p_category: category === 'all' ? undefined : category,
        p_before: pageParam ?? undefined,
      });
      if (error) throw error;
      return data as unknown as Page;
    },
    getNextPageParam: (last) =>
      last.items.length === 50 ? last.items[last.items.length - 1]!.created_at : null,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

/** Marks one row or every row read and refreshes the feed and Home's bell. */
export function useMarkRead() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: homeKey });
  };
  return {
    one: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
        if (error) throw error;
      },
      onSettled: refresh,
    }),
    all: useMutation({
      mutationFn: async () => {
        const { error } = await supabase.rpc('mark_all_notifications_read');
        if (error) throw error;
      },
      onSettled: refresh,
    }),
  };
}

/** "just now", "12 min ago", "2 h ago", "2 days ago". */
export function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Book alerts show the cover, people alerts the avatar, others nothing (rule 31). */
export function toRow(n: ServerNotif): NotifRow {
  const lead: NotifRow['lead'] = n.book_id
    ? { kind: 'book', title: n.book_title ?? '', tone: coverTone(n.book_id) }
    : n.actor_id
      ? {
          kind: 'person',
          name: n.actor_name ?? '',
          tone: avatarTone(n.actor_id),
          uri: n.actor_avatar ?? undefined,
        }
      : { kind: 'none' };
  return { id: n.id, title: n.title, body: n.body, when: ago(n.created_at), unread: !n.read_at, lead };
}
