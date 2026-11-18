import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import { Callout, EmptyState, Screen, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useTrack } from '../../features/03/analytics';
import { BookPageSkeleton, BookPageView } from '../../features/03/BookViews';
import { bookKey, toModel, useBookPage, type BookPageData } from '../../features/03/book';

export default function BookPage() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { c, s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const qc = useQueryClient();
  const page = useBookPage(id);
  const d = page.data;
  const online = onlineManager.isOnline();

  const viewed = useRef(false);
  useEffect(() => {
    if (d && !viewed.current) {
      viewed.current = true;
      track('book_viewed', { book_id: id, source: source ?? 'direct', owned: d.owns_book, price: d.price });
    }
  }, [d, id, source, track]);

  const follow = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase.rpc('set_following', { p_user: d!.book.author.id, p_follow: on });
      if (error) throw error;
    },
    onMutate: (on) => {
      qc.setQueryData<BookPageData | null>(bookKey(id), (old) => (old ? { ...old, following: on } : old));
    },
    onError: (_e, on) => {
      qc.setQueryData<BookPageData | null>(bookKey(id), (old) => (old ? { ...old, following: !on } : old));
      toast({ message: 'Couldn’t update Follow. Try again.' });
    },
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // Sheets and the screens behind them land in the next steps of flow 03.
  const soon = () => toast({ message: 'Coming soon' });

  if (!d) {
    if (page.isPending && !page.isError) {
      return (
        <Screen top="org">
          <BookPageSkeleton onBack={back} />
        </Screen>
      );
    }
    return (
      <Screen top="white">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {page.isError ? (
            <EmptyState
              title="This book didn’t load"
              body={online ? 'Something went wrong on our side. Try again.' : 'You’re offline. Connect and try again.'}
              action={{ label: 'Try again', onPress: () => void page.refetch() }}
            />
          ) : (
            <EmptyState
              title="This book isn’t available right now"
              body="It may have been taken down by the author or by Arpedia."
              action={{ label: 'Go back', onPress: back }}
            />
          )}
        </View>
      </Screen>
    );
  }

  const m = toModel(d);
  return (
    <Screen top="org" contentStyle={{ backgroundColor: c.white }}>
      <BookPageView
        m={m}
        notice={
          online ? null : (
            <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
              <Callout tone="quiet">Offline. Showing the last copy you opened. Connect to continue.</Callout>
            </View>
          )
        }
        a={{
          onBack: back,
          onSave: soon,
          onShare: soon,
          onMore: soon,
          onAuthor: soon,
          onFollow: d.is_author ? undefined : () => follow.mutate(!d.following),
          onReviews: soon,
          onDiscussion: soon,
          onMain: soon,
          onUnlockAll: soon,
          onPayGo: soon,
          onPayRest: soon,
          onTopUp: soon,
          onAbout: soon,
          onWriteReview: soon,
          onBook: (b) => router.push({ pathname: '/book/[id]', params: { id: b, source: 'related' } }),
          spendOff: !online,
        }}
      />
    </Screen>
  );
}
