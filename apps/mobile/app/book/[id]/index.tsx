import { useEffect, useRef, useState } from 'react';
import { Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FINISHED_PERCENT, TIP_PRESETS } from '@arpedia/core';
import { Callout, EmptyState, Screen, Sheet, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useTrack } from '../../../features/03/analytics';
import { useTrack as useReaderTrack } from '../../../features/04/analytics';
import { BookPageSkeleton, BookPageView } from '../../../features/03/BookViews';
import { bookKey, toModel, useBookPage, useOnline, type BookPageData } from '../../../features/03/book';
import { GiftSheet, TipSheet } from '../../../features/03/GiftSheet';
import { MenuBody, ReportSheet, moreItems } from '../../../features/03/MoreSheet';
import { UnlockSheet } from '../../../features/03/UnlockSheet';
import type { UnlockMode } from '../../../features/03/UnlockViews';
import { DOWNLOAD_STARTED, downloadBook } from '../../../features/04/download';
import { useBuyPack } from '../../../features/09/buyPack';
import { useFlag } from '../../../features/16/config';
import { useAskPush } from '../../../features/15/push';

export default function BookPage() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { c, s } = useTheme();
  const toast = useToast();
  // Flow 16 rule 27 kill switches; on until the config says otherwise.
  const flags = {
    downloads: useFlag('offline_downloads', true),
    gifts: useFlag('gifts', true),
    tips: useFlag('tips', true),
  };
  const track = useTrack();
  const trackReader = useReaderTrack();
  const askPush = useAskPush();
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
    onSuccess: (_d, on) => {
      if (on) askPush('follow');
    },
    onError: (_e, on) => {
      qc.setQueryData<BookPageData | null>(bookKey(id), (old) => (old ? { ...old, following: !on } : old));
      toast({ message: 'Couldn’t update Follow. Try again.' });
    },
  });

  // Save to library (rule 2, flow 05 rule 3): saved_books is owner-only, so a row means saved.
  const savedKey = ['book-saved', id] as const;
  const saved = useQuery({
    queryKey: savedKey,
    enabled: !!id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('saved_books')
        .select('book_id', { count: 'exact', head: true })
        .eq('book_id', id);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
  const save = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase.rpc(on ? 'save_book' : 'unsave_book', { p_book: id });
      if (error) throw error;
    },
    onMutate: (on) => qc.setQueryData(savedKey, on),
    onSuccess: (_d, on) => {
      toast({ message: on ? 'Saved to your library' : 'Removed from Saved' });
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (_e, on) => {
      qc.setQueryData(savedKey, !on);
      toast({ message: 'Couldn’t save that. Try again.' });
    },
  });

  // Notify me on a coming-soon book (rule 4, flow 02 `notify_me`): on also saves it to Library › Saved.
  const notifyKey = ['book-notify', id] as const;
  const notifyOn = useQuery({
    queryKey: notifyKey,
    enabled: !!id && !!d?.coming_soon,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('notify_me_on', { p_book: id });
      if (error) throw error;
      return data === true;
    },
  });
  const notify = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase.rpc('notify_me', { p_book: id, p_on: on });
      if (error) throw error;
    },
    onMutate: (on) => qc.setQueryData(notifyKey, on),
    onSuccess: (_d, on) => {
      toast({
        message: on ? 'We’ll tell you when it’s out. It’s in your Saved books.' : 'Okay, we won’t tell you.',
      });
      if (on) askPush('notify');
      qc.setQueryData(savedKey, on ? true : (saved.data ?? false));
      void qc.invalidateQueries({ queryKey: ['library'] });
    },
    onError: (_e, on) => {
      qc.setQueryData(notifyKey, !on);
      toast({ message: 'Couldn’t update that. Try again.' });
    },
  });

  // Buy N credits (rule 29): the sheet stays open and shows the new balance; nothing is spent.
  const pack = useBuyPack([bookKey(id)]);

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
  const toPlans = () => router.push('/plan');
  const toCredits = () => router.push('/credits');
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
  const waiting = d.coming_soon && (notifyOn.data ?? false);
  if (waiting) m.mainLabel = 'We’ll notify you';
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
          saved: saved.data ?? false,
          onSave: () => {
            if (!online) return toast({ message: 'Connect to continue' });
            if (!save.isPending) save.mutate(!(saved.data ?? false));
          },
          onShare: () =>
            void Share.share({
              message: `${d.book.title}${d.book.author.name ? ` by ${d.book.author.name}` : ''}, on Arpedia`,
            }),
          onMore: () => setOverlay('more'),
          onAuthor: () =>
            router.push({ pathname: '/author/[id]', params: { id: d.book.author.id, source: 'book' } }),
          onFollow: d.is_author ? undefined : () => follow.mutate(!d.following),
          onReviews: () => go('reviews'),
          onDiscussion: () => {
            if (!finished) track('discussion_locked_tapped', { percent: d.progress?.max_percent ?? 0 });
            go('discussion');
          },
          onMain: () => {
            if (!d.coming_soon) return router.push({ pathname: '/read/[id]', params: { id } });
            if (!online) return toast({ message: 'Connect to continue' });
            if (!notify.isPending) notify.mutate(!waiting);
          },
          onUnlockAll: () => openSheet('all'),
          onPayGo: () => openSheet('paygo'),
          onPayRest: () => openSheet('all'),
          onTopUp: toCredits,
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
        onRead={() => router.push({ pathname: '/read/[id]', params: { id } })}
        onPlans={toPlans}
        // A gift or tip shortfall closes once the credits land, so the reader can send it again.
        onBuyPack={(p) =>
          void pack.buy(p).then((ok) => {
            if (ok && sheet === 'short') setSheet(null);
          })
        }
      />
      <Sheet open={overlay === 'more'} onClose={() => setOverlay(null)} bold title={d.book.title}>
        <MenuBody
          items={moreItems({
            author: d.book.author.name ?? '',
            comingSoon: d.coming_soon,
            isAuthor: d.is_author,
            online,
            onDownload: () => {
              setOverlay(null);
              if (!online) return toast({ message: 'Connect to continue' });
              downloadBook(
                id,
                (scope) => {
                  track('download_requested', { book_id: id, scope });
                  toast({ message: DOWNLOAD_STARTED[scope] });
                },
                trackReader,
              ).then(
                () => toast({ message: 'Ready offline' }),
                () => toast({ message: 'Couldn’t download. Try again.' }),
              );
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
            onReport: () => setOverlay('report'),
            flags,
          })}
        />
      </Sheet>
      <GiftSheet book={d} open={overlay === 'gift'} onClose={() => setOverlay(null)} onShort={short} />
      <TipSheet book={d} open={overlay === 'tip'} onClose={() => setOverlay(null)} onShort={short} />
      <ReportSheet
        bookId={d.book.id}
        open={overlay === 'report'}
        online={online}
        onClose={() => setOverlay(null)}
      />
    </Screen>
  );
}
