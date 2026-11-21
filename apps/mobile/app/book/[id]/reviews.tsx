import { useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FINISHED_PERCENT, ratingBars, ratingLabel } from '@arpedia/core';
import { Btn, EmptyState, Screen, Sheet, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { AboutSkeleton, BackHero } from '../../../features/03/AboutViews';
import { useTrack } from '../../../features/03/analytics';
import { bookKey, type BookPageData } from '../../../features/03/book';
import { avatarTone } from '../../../features/03/BookViews';
import { MenuBody } from '../../../features/03/MoreSheet';
import { ReviewsView, type ReviewItem } from '../../../features/03/ReviewViews';

// s-reviews and s-review-actions (rules 42–46).

interface ReviewJson {
  id: string;
  user_id: string;
  name: string | null;
  stars: number;
  body: string | null;
  spoiler: boolean;
  likes: number;
  liked: boolean;
  mine: boolean;
  created_at: string;
}

interface ReviewsData {
  rating: { avg: number | null; count: number; h: number[] } | null;
  can_review: boolean;
  reviews: ReviewJson[];
}

const PAGE = 20;

/** "2 days ago", "1 week ago", "3 months ago". */
function ago(iso: string, now = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  const unit = (v: number, w: string) => `${v} ${w}${v === 1 ? '' : 's'} ago`;
  if (days < 1) return 'Today';
  if (days < 7) return unit(days, 'day');
  if (days < 30) return unit(Math.floor(days / 7), 'week');
  if (days < 365) return unit(Math.floor(days / 30), 'month');
  return unit(Math.floor(days / 365), 'year');
}

const toItem = (r: ReviewJson): ReviewItem => ({
  id: r.id,
  userId: r.user_id,
  name: r.name ?? 'Reader',
  stars: r.stars,
  body: r.body,
  spoiler: r.spoiler,
  likes: r.likes,
  liked: r.liked,
  mine: r.mine,
  age: ago(r.created_at),
  tone: avatarTone(r.user_id),
});

export default function Reviews() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [actions, setActions] = useState<ReviewItem | null>(null);
  const key = ['reviews', id, filter, limit] as const;

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_reviews', {
        p_book: id,
        p_stars: filter ?? undefined,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      return data as unknown as ReviewsData;
    },
    placeholderData: (prev) => prev,
  });
  const book = qc.getQueryData<BookPageData | null>(bookKey(id));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['reviews', id] });
    void qc.invalidateQueries({ queryKey: bookKey(id) });
  };

  const like = useMutation({
    mutationFn: async (r: ReviewItem) => {
      const { error } = await supabase.rpc('toggle_review_like', { p_review: r.id });
      if (error) throw error;
    },
    onMutate: (r) =>
      qc.setQueryData<ReviewsData>(key, (old) =>
        old
          ? {
              ...old,
              reviews: old.reviews.map((x) =>
                x.id === r.id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x,
              ),
            }
          : old,
      ),
    onError: () => {
      toast({ message: 'Couldn’t save your like. Try again.' });
      refresh();
    },
  });

  const act = useMutation({
    mutationFn: async ({ kind, r }: { kind: 'report' | 'hide' | 'delete'; r: ReviewItem }) => {
      const { error } =
        kind === 'report'
          ? await supabase.rpc('report_review', { p_review: r.id, p_reason: 'spoilers_abuse_or_spam' })
          : kind === 'hide'
            ? await supabase.rpc('hide_reviewer', { p_user: r.userId })
            : await supabase.rpc('delete_review', { p_review: r.id });
      if (error) throw error;
      return kind;
    },
    onSuccess: (kind, { r }) => {
      setActions(null);
      if (kind === 'report') {
        track('review_reported');
        toast({ message: 'Thanks. Our team will look at it.' });
      } else if (kind === 'hide') {
        track('reviewer_hidden');
        toast({ message: `You won’t see reviews from ${r.name.split(' ')[0]}` });
      } else toast({ message: 'Review deleted' });
      refresh();
    },
    onError: () => toast({ message: 'That didn’t work. Check your connection and try again.' }),
  });

  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/book/[id]', params: { id } });
  const finished = q.data?.can_review ?? (book?.progress?.max_percent ?? 0) >= FINISHED_PERCENT;
  const mine = q.data?.reviews.find((r) => r.mine) ?? book?.my_review;
  const write = () => {
    if (!finished) return toast({ message: 'Finish the book to review it' });
    router.push({ pathname: '/book/[id]/write-review', params: { id } });
  };
  const d = q.data;
  const count = d?.rating?.count ?? 0;
  const first = actions?.name.split(' ')[0] ?? '';

  return (
    <Screen top="org">
      <BackHero
        title="Ratings & reviews"
        sub={book ? `${book.book.title} · ${count.toLocaleString('en-NG')} reviews` : undefined}
        onBack={back}
      />
      {d ? (
        <ReviewsView
          rating={d.rating?.avg != null && count > 0 ? ratingLabel(Number(d.rating.avg)) : null}
          count={count}
          bars={ratingBars(d.rating?.h ?? [], count)}
          filter={filter}
          onFilter={(f) => {
            setFilter(f);
            setLimit(PAGE);
          }}
          reviews={d.reviews.map(toItem)}
          writeLabel={mine ? 'Edit your review' : 'Write a review'}
          onWrite={write}
          onMore={setActions}
          onLike={(r) => like.mutate(r)}
          footer={
            d.reviews.length >= limit ? (
              <View style={{ padding: s(16) }}>
                <Btn
                  label="Show more reviews"
                  variant="g"
                  size="md"
                  block
                  onPress={() => setLimit(limit + PAGE)}
                />
              </View>
            ) : null
          }
        />
      ) : q.isPending ? (
        <AboutSkeleton />
      ) : (
        <View style={{ paddingTop: s(24) }}>
          <EmptyState
            title="Reviews didn’t load"
            body="Check your connection and try again."
            action={{ label: 'Try again', onPress: () => void q.refetch() }}
          />
        </View>
      )}
      <Sheet
        open={actions !== null}
        onClose={() => setActions(null)}
        locked={act.isPending}
        bold
        title={actions?.mine ? 'Your review' : `${first}’s review`}
      >
        {actions ? (
          <MenuBody
            items={[
              ...(actions.mine
                ? [
                    {
                      key: 'edit',
                      title: 'Edit review',
                      sub: 'Change your stars or words',
                      onPress: () => {
                        setActions(null);
                        router.push({ pathname: '/book/[id]/write-review', params: { id } });
                      },
                    },
                    {
                      key: 'delete',
                      title: 'Delete review',
                      sub: 'Removes it for everyone',
                      onPress: () => act.mutate({ kind: 'delete', r: actions }),
                    },
                  ]
                : [
                    {
                      key: 'report',
                      title: 'Report review',
                      sub: 'Spoilers, abuse or spam',
                      onPress: () => act.mutate({ kind: 'report', r: actions }),
                    },
                    {
                      key: 'hide',
                      title: `Hide reviews from ${first}`,
                      sub: 'Only you stop seeing them',
                      onPress: () => act.mutate({ kind: 'hide', r: actions }),
                    },
                  ]),
              ...(actions.body
                ? [
                    {
                      key: 'copy',
                      title: 'Copy text',
                      sub: '',
                      onPress: () => {
                        void Clipboard.setStringAsync(actions.body ?? '');
                        setActions(null);
                        toast({ message: 'Copied' });
                      },
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
