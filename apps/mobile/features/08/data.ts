import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Flow 08 · author profile, posts and paid messages. Server shapes come from
// supabase/migrations/20261120000800_08_authors.sql (jsonb RPCs are typed here, by hand, from it).

export type DmBlock = 'own_profile' | 'blocked' | 'author_unavailable' | null;
export type AuthorState = 'active' | 'suspended' | 'gone' | 'not_author';

export interface AuthorProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  country: string | null;
  joined_at: string;
  state: AuthorState;
  is_me: boolean;
  genres: string[];
  book_count: number;
  post_count: number;
  follower_count: number;
  reader_count: number;
  avg_rating: number | null;
  following: boolean;
  blocked_by_me: boolean;
  community: { id: string; name: string; member_count: number; joined: boolean } | null;
  message: {
    available: boolean;
    reason: DmBlock;
    cost_credits: number;
    max_chars: number;
    group_id: string | null;
    cost_ack: boolean;
    reply_label: string | null;
  };
}

export interface AuthorPostRow {
  id: string;
  title: string;
  excerpt: string;
  like_count: number;
  comment_count: number;
  published_at: string;
  liked: boolean;
}

export interface AuthorBookRow {
  id: string;
  title: string;
  genres: string[];
  avg_rating: number | null;
  rating_count: number;
  price_credits: number | null;
}

export interface PostData {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  title: string;
  body: string;
  state: 'draft' | 'published' | 'removed';
  published_at: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
  is_author: boolean;
  can_comment: boolean;
}

export type CommentState = 'visible' | 'auto_hidden' | 'removed' | 'deleted';

export interface CommentRow {
  id: string;
  parent_id: string | null;
  user_id: string | null;
  name: string;
  avatar_url: string | null;
  is_author: boolean;
  state: CommentState;
  body: string | null;
  created_at: string;
  mine: boolean;
  can_delete: boolean;
  replies?: CommentRow[];
  /** Client only: still sending, or failed ("Not sent. Tap to retry"). */
  pending?: 'sending' | 'failed';
  client_id?: string;
}

export interface CommentsPage {
  comments: CommentRow[];
  has_more: boolean;
  total: number;
}

export interface AuthorThread {
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  author_state: AuthorState;
  group_id: string | null;
  cost_ack: boolean;
  cost_credits: number;
  max_chars: number;
  balance: number;
  block: DmBlock;
  reply_label: string | null;
}

export const authorKey = (id: string) => ['author', id] as const;
export const authorPostsKey = (id: string) => ['author', id, 'posts'] as const;
export const authorBooksKey = (id: string) => ['author', id, 'books'] as const;
export const postKey = (id: string) => ['post', id] as const;
export const commentsKey = (id: string) => ['post', id, 'comments'] as const;
export const threadKey = (id: string) => ['author', id, 'thread'] as const;

const POSTS_PAGE = 20;

/** Refetch when the screen comes back into focus or the app returns to the foreground. */
function useFresh(refetch: () => unknown) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) first.current = false;
      else void refetch();
    }, [refetch]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);
}

export function useAuthorProfile(id: string) {
  const q = useQuery({
    queryKey: authorKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_author_profile', { p_author: id });
      if (error) throw error;
      return data as unknown as AuthorProfile;
    },
  });
  useFresh(q.refetch);
  return q;
}

export function useAuthorPosts(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: authorPostsKey(id),
    enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_author_posts', {
        p_author: id,
        p_before: pageParam ?? undefined,
        p_limit: POSTS_PAGE,
      });
      if (error) throw error;
      return (data ?? []) as AuthorPostRow[];
    },
    getNextPageParam: (last) => (last.length >= POSTS_PAGE ? last[last.length - 1]!.published_at : undefined),
  });
}

export function useAuthorBooks(id: string, enabled: boolean) {
  return useQuery({
    queryKey: authorBooksKey(id),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_author_books', { p_author: id });
      if (error) throw error;
      return (data ?? []).map((b) => ({
        ...b,
        avg_rating: b.avg_rating == null ? null : Number(b.avg_rating),
      })) as AuthorBookRow[];
    },
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: postKey(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_post', { p_post: id });
      if (error) throw error;
      return data as unknown as PostData;
    },
  });
}

/** s-post comments: oldest first, 20 top-level per page; polled every 30 s while the screen is open. */
export function usePostComments(id: string) {
  return useInfiniteQuery({
    queryKey: commentsKey(id),
    initialPageParam: null as { at: string; id: string } | null,
    refetchInterval: 30_000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc('get_post_comments', {
        p_post: id,
        p_after: pageParam?.at,
        p_after_id: pageParam?.id,
      });
      if (error) throw error;
      return data as unknown as CommentsPage;
    },
    getNextPageParam: (last) => {
      const end = last.comments[last.comments.length - 1];
      return last.has_more && end ? { at: end.created_at, id: end.id } : undefined;
    },
  });
}

export function useAuthorThread(id: string, enabled = true) {
  return useQuery({
    queryKey: threadKey(id),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_author_thread', { p_author: id });
      if (error) throw error;
      return data as unknown as AuthorThread;
    },
  });
}

/** "Enugu, Nigeria" from the author profile (flow 11's location, else the country). */
export function placeLabel(p: Pick<AuthorProfile, 'location' | 'country'>): string | null {
  return p.location?.trim() || p.country?.trim() || null;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
