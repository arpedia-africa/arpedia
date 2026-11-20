import { useEffect, useMemo, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authorCount, authorRating, postTime, ratingLabel } from '@arpedia/core';
import { Btn, Callout, EmptyState, Screen, Sheet, Text, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { avatarTone, coverTone } from '../../../features/03/BookViews';
import { useBookPage, useOnline } from '../../../features/03/book';
import { TipSheet } from '../../../features/03/GiftSheet';
import { rpcError } from '../../../features/03/UnlockSheet';
import { useTrack } from '../../../features/08/analytics';
import {
  AuthorSkeleton,
  AuthorView,
  type AuthorModel,
  type AuthorTab,
  type BookRowView,
  type PostCardView,
} from '../../../features/08/AuthorViews';
import { DmConfirmSheet } from '../../../features/08/DmConfirm';
import {
  authorKey,
  firstName,
  placeLabel,
  useAuthorBooks,
  useAuthorPosts,
  useAuthorProfile,
  type AuthorProfile,
} from '../../../features/08/data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const n = (v: number) => v.toLocaleString('en-NG');
const plural = (v: number, one: string) => `${n(v)} ${one}${v === 1 ? '' : 's'}`;

function toModel(p: AuthorProfile): AuthorModel {
  const place = placeLabel(p);
  const joined = new Date(p.joined_at);
  const gone = p.state === 'gone';
  return {
    name: p.name,
    avatarUrl: p.avatar_url,
    tone: avatarTone(p.id),
    meta: [plural(p.book_count, 'book'), plural(p.post_count, 'post'), place].filter(Boolean).join(' · '),
    bio: gone ? 'This author is no longer on Arpedia.' : p.bio,
    isMe: p.is_me,
    following: p.following,
    messageLabel: `Message · ${n(p.message.cost_credits)} cr`,
    blockedByMe: p.blocked_by_me,
    gone,
    community: p.community
      ? {
          name: p.community.name,
          sub: `${p.community.joined ? 'Joined · ' : ''}public community · ${plural(p.community.member_count, 'member')}`,
          joined: p.community.joined,
        }
      : null,
    stats: {
      followers: authorCount(p.follower_count),
      readers: authorCount(p.reader_count),
      // get_author_profile already hides the average below 5 ratings (rule 2).
      rating: p.avg_rating == null ? '–' : (authorRating(Number(p.avg_rating), 5) ?? '–'),
    },
    postCount: p.post_count,
    bookCount: p.book_count,
    about: {
      bio: p.bio,
      rows: [
        ...(place ? [{ k: 'Location', v: place }] : []),
        ...(p.genres.length ? [{ k: 'Writes', v: p.genres.slice(0, 3).join(', ') }] : []),
        { k: 'Joined', v: `${MONTHS[joined.getMonth()]} ${joined.getFullYear()}` },
      ],
    },
  };
}

export default function AuthorPage() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const qc = useQueryClient();
  const online = useOnline();
  const profile = useAuthorProfile(id);
  const p = profile.data;
  const [tab, setTab] = useState<AuthorTab>('posts');
  const posts = useAuthorPosts(id, !!p && !p.blocked_by_me);
  const books = useAuthorBooks(id, !!p);
  const [overlay, setOverlay] = useState<'unfollow' | 'confirm' | 'tip' | null>(null);

  const viewed = useRef(false);
  useEffect(() => {
    if (p && !viewed.current) {
      viewed.current = true;
      track('author_profile_viewed', { author_id: id, source: source ?? 'direct' });
    }
  }, [p, id, source, track]);

  const follow = useMutation({
    mutationFn: async (on: boolean) => {
      const { data, error } = await supabase.rpc(on ? 'follow_author' : 'unfollow_author', {
        p_author: id,
      });
      if (error) throw error;
      return data as unknown as { following: boolean; follower_count: number };
    },
    onMutate: (on) => {
      qc.setQueryData<AuthorProfile>(authorKey(id), (old) =>
        old
          ? {
              ...old,
              following: on,
              follower_count: Math.max(0, old.follower_count + (on ? 1 : -1)),
            }
          : old,
      );
    },
    onSuccess: (r, on) => {
      track(on ? 'author_followed' : 'author_unfollowed', { author_id: id });
      qc.setQueryData<AuthorProfile>(authorKey(id), (old) =>
        old ? { ...old, following: r.following, follower_count: r.follower_count } : old,
      );
    },
    onError: (_e, on) => {
      qc.setQueryData<AuthorProfile>(authorKey(id), (old) =>
        old
          ? {
              ...old,
              following: !on,
              follower_count: Math.max(0, old.follower_count + (on ? -1 : 1)),
            }
          : old,
      );
      toast({ message: 'Couldn’t update Follow. Try again.' });
    },
  });

  const join = useMutation({
    mutationFn: async (group: string) => {
      const { error } = await supabase.rpc('join_group', { p_group: group });
      if (error) throw error;
      return group;
    },
    onSuccess: (group) => {
      track('author_community_joined', { author_id: id });
      void qc.invalidateQueries({ queryKey: authorKey(id) });
      router.push({ pathname: '/community/[id]', params: { id: group } });
    },
    onError: () => toast({ message: 'Couldn’t join right now. Try again.' }),
  });

  const unblock = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('unblock_user', { p_user: id });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: authorKey(id) }),
    onError: () => toast({ message: 'Couldn’t unblock. Try again.' }),
  });

  const postViews = useMemo<PostCardView[] | null>(() => {
    if (!posts.data) return null;
    const now = new Date();
    return posts.data.pages.flat().map((r) => ({
      id: r.id,
      time: postTime(r.published_at, now),
      title: r.title,
      excerpt: r.excerpt,
      likes: authorCount(r.like_count),
      comments: authorCount(r.comment_count),
    }));
  }, [posts.data]);

  const bookViews = useMemo<BookRowView[] | null>(
    () =>
      books.data?.map((b) => ({
        id: b.id,
        title: b.title,
        sub: [
          b.avg_rating != null ? `${ratingLabel(b.avg_rating)}★` : null,
          b.price_credits != null ? `${n(b.price_credits)} credits` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: coverTone(b.id),
      })) ?? null,
    [books.data],
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const offline = () => toast({ message: 'Connect to do this' });

  if (!p) {
    if (profile.isPending && !profile.isError) {
      return (
        <Screen top="org">
          <AuthorSkeleton onBack={back} />
        </Screen>
      );
    }
    const missing = rpcError(profile.error).code === 'not_found';
    return (
      <Screen top="white">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {missing ? (
            <EmptyState
              title="This author isn’t on Arpedia"
              body="The link may be old, or the account was closed."
              action={{ label: 'Go back', onPress: back }}
            />
          ) : (
            <EmptyState
              title="Couldn’t load this author"
              body={
                online
                  ? 'Something went wrong on our side. Try again.'
                  : 'You’re offline. Connect and try again.'
              }
              action={{ label: 'Try again', onPress: () => void profile.refetch() }}
            />
          )}
        </View>
      </Screen>
    );
  }

  const m = toModel(p);
  const first = firstName(p.name);
  const msg = p.message;
  const firstBook = books.data?.[0]?.id ?? null;
  const reason =
    p.state === 'suspended'
      ? 'Not taking messages right now'
      : msg.reason === 'author_unavailable'
        ? 'Messaging isn’t available'
        : null;

  const openMessage = () => {
    if (!online) return offline();
    if (!msg.available) return toast({ message: reason ?? 'Messaging isn’t available' });
    if (msg.cost_ack) router.push({ pathname: '/dm/[id]', params: { id } });
    else setOverlay('confirm');
  };

  return (
    <Screen top="org">
      <AuthorView
        m={m}
        tab={tab}
        onTab={(t) => {
          setTab(t);
          track('author_tab_opened', { author_id: id, tab: t });
        }}
        posts={postViews}
        books={bookViews}
        notice={
          !online ? (
            <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
              <Callout tone="quiet">Offline. Showing the last copy you opened.</Callout>
            </View>
          ) : reason && !m.isMe && !m.blockedByMe && !m.gone ? (
            <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
              <Callout tone="quiet">{reason}</Callout>
            </View>
          ) : null
        }
        a={{
          onBack: back,
          onShare: () => void Share.share({ message: `${p.name} on Arpedia` }),
          onFollow: () => {
            if (!online) return offline();
            if (p.following) setOverlay('unfollow');
            else follow.mutate(true);
          },
          onMessage: reason ? undefined : openMessage,
          onTip:
            p.state === 'active' && firstBook
              ? () => {
                  if (!online) return offline();
                  track('tip_started_from_profile', { author_id: id });
                  setOverlay('tip');
                }
              : undefined,
          onEditProfile: () => toast({ message: 'Edit your author profile in Author Studio' }),
          onCommunity: p.community
            ? () => {
                const g = p.community!;
                if (g.joined) router.push({ pathname: '/community/[id]', params: { id: g.id } });
                else if (!online) offline();
                else join.mutate(g.id);
              }
            : undefined,
          onUnblock: () => (online ? unblock.mutate() : offline()),
          onPost: (post) => {
            track('post_opened', { post_id: post, author_id: id });
            router.push({ pathname: '/post/[id]', params: { id: post } });
          },
          onBook: (b) => router.push({ pathname: '/book/[id]', params: { id: b, source: 'author' } }),
          onMorePosts: posts.hasNextPage ? () => void posts.fetchNextPage() : undefined,
        }}
      />
      <Sheet open={overlay === 'unfollow'} onClose={() => setOverlay(null)} title={`Unfollow ${first}?`}>
        <Text variant="sm" color="ink2">
          {`You’ll stop getting ${first}’s new books and posts.`}
        </Text>
        <View style={{ gap: s(8) }}>
          <Btn
            label="Unfollow"
            variant="x"
            block
            onPress={() => {
              setOverlay(null);
              follow.mutate(false);
            }}
          />
          <Btn label="Cancel" variant="g" block onPress={() => setOverlay(null)} />
        </View>
      </Sheet>
      <DmConfirmSheet
        authorId={id}
        name={p.name}
        open={overlay === 'confirm'}
        onClose={() => setOverlay(null)}
        onStarted={() => {
          setOverlay(null);
          router.push({ pathname: '/dm/[id]', params: { id } });
        }}
      />
      {overlay === 'tip' && firstBook ? (
        <TipHost bookId={firstBook} onClose={() => setOverlay(null)} />
      ) : null}
    </Screen>
  );
}

/** Flow 03's tip sheet works per book: open it on the author's newest live book (author preselected). */
function TipHost({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const page = useBookPage(bookId);
  const toast = useToast();
  useEffect(() => {
    if (page.isError) {
      toast({ message: 'Couldn’t open Tip. Try again.' });
      onClose();
    }
  }, [page.isError, toast, onClose]);
  if (!page.data) return null;
  return (
    <TipSheet
      book={page.data}
      open
      onClose={onClose}
      onShort={() => {
        onClose();
        router.push('/credits');
      }}
    />
  );
}
