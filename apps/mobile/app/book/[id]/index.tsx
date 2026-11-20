import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FINISHED_PERCENT, TIP_PRESETS } from '@arpedia/core';
import { Callout, EmptyState, Screen, Sheet, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useTrack } from '../../../features/03/analytics';
import { BookPageSkeleton, BookPageView } from '../../../features/03/BookViews';
import { bookKey, toModel, useBookPage, useOnline, type BookPageData } from '../../../features/03/book';
import { GiftSheet, TipSheet } from '../../../features/03/GiftSheet';
import { MenuBody, ReportSheet, moreItems } from '../../../features/03/MoreSheet';
import { UnlockSheet } from '../../../features/03/UnlockSheet';
import type { UnlockMode } from '../../../features/03/UnlockViews';

export default function BookPage() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { c, s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const qc = useQueryClient();
  const page = useBookPage(id);
  const d = page.data;
  const online = useOnline();

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

  const [sheet, setSheet] = useState<UnlockMode | 'short' | null>(null);
  const [need, setNeed] = useState(0);
  const [overlay, setOverlay] = useState<'more' | 'gift' | 'tip' | 'report' | null>(null);
  const openSheet = (m: UnlockMode) => {
    track('buy_option_tapped', { book_id: id, option: m === 'all' ? 'unlock_all' : 'pay_go' });
    setSheet(m);
  };
  /** Gift and Tip follow the credit checks too (rule 14): short of credits opens low or no-plan. */
  const short = (amount: number) => {
    setOverlay(null);
    setNeed(amount);
    setSheet('short');
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // The reader, plans, top-up packs, author pages and downloads belong to flows 04, 09 and 08.
  const soon = () => toast({ message: 'Coming soon' });
  const go = (screen: 'about' | 'reviews' | 'discussion' | 'write-review') =>
    router.push({ pathname: `/book/[id]/${screen}`, params: { id } });

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
              body={
                online
                  ? 'Something went wrong on our side. Try again.'
                  : 'You’re offline. Connect and try again.'
              }
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
  const finished = (d.progress?.max_percent ?? 0) >= FINISHED_PERCENT;
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
          onMore: () => setOverlay('more'),
          onAuthor: soon,
          onFollow: d.is_author ? undefined : () => follow.mutate(!d.following),
          onReviews: () => go('reviews'),
          onDiscussion: () => {
            if (!finished) track('discussion_locked_tapped', { percent: d.progress?.max_percent ?? 0 });
            go('discussion');
          },
          onMain: soon,
          onUnlockAll: () => openSheet('all'),
          onPayGo: () => openSheet('paygo'),
          onPayRest: () => openSheet('all'),
          onTopUp: soon,
          onAbout: () => go('about'),
          onWriteReview: () => {
            if (!online) return toast({ message: 'Connect to continue' });
            if (!finished) return toast({ message: 'Finish the book to review it' });
            go('write-review');
          },
          onBook: (b) => router.push({ pathname: '/book/[id]', params: { id: b, source: 'related' } }),
          spendOff: !online,
        }}
      />
      <UnlockSheet
        book={d}
        open={sheet}
        need={need}
        onClose={() => setSheet(null)}
        onRead={soon}
        onPlans={soon}
        onBuyPack={soon}
      />
      <Sheet open={overlay === 'more'} onClose={() => setOverlay(null)} bold title={d.book.title}>
        <MenuBody
          items={moreItems({
            author: d.book.author.name ?? '',
            comingSoon: d.coming_soon,
            isAuthor: d.is_author,
            online,
            // request_download is flow 04's (reader and downloads).
            onDownload: () => {
              setOverlay(null);
              soon();
            },
            onGift: () => {
              if (!online) return;
              if (d.balance < d.price) return short(d.price);
              setOverlay('gift');
            },
            onTip: () => {
              if (!online) return;
              // Not even the smallest tip fits: straight to not-enough-credits / no-plan (rule 14).
              if (d.balance < Math.min(...TIP_PRESETS)) return short(Math.min(...TIP_PRESETS));
              setOverlay('tip');
            },
            onReport: () => online && setOverlay('report'),
          })}
        />
      </Sheet>
      <GiftSheet book={d} open={overlay === 'gift'} onClose={() => setOverlay(null)} onShort={short} />
      <TipSheet book={d} open={overlay === 'tip'} onClose={() => setOverlay(null)} onShort={short} />
      <ReportSheet bookId={d.book.id} open={overlay === 'report'} onClose={() => setOverlay(null)} />
    </Screen>
  );
}
