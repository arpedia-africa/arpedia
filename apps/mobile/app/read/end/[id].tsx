// s-book-end (flow 04 rule 68): shown when the reader reaches the last page of the last chapter.
// Time read is the sum of reading_sessions (rule 69); Close returns to Library.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { TIP_PRESETS } from '@arpedia/core';
import { EmptyState, Hero, IconButton, Screen, Skeleton, useTheme } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useBookPage, useOnline } from '../../../features/03/book';
import { avatarTone, coverTone } from '../../../features/03/BookViews';
import { TipSheet } from '../../../features/03/GiftSheet';
import { UnlockSheet } from '../../../features/03/UnlockSheet';
import { useTrack } from '../../../features/04/analytics';
import { BookEndView } from '../../../features/04/BookEndView';

const n = (v: number) => v.toLocaleString('en-NG');

/** "4 h 26 min across 9 days." · "26 min in one day." */
function timeLine(seconds: number, days: number) {
  const mins = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const t = h > 0 ? (m > 0 ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  return days <= 1 ? `${t} in one day.` : `${t} across ${n(days)} days.`;
}

export default function BookEnd() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const track = useTrack();
  const online = useOnline();
  const page = useBookPage(id);
  const d = page.data;
  const [tip, setTip] = useState(false);
  const [short, setShort] = useState(0);

  const stats = useQuery({
    queryKey: ['book-end', id],
    queryFn: async () => {
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const [sessions, year] = await Promise.all([
        supabase.from('reading_sessions').select('started_at, active_seconds').eq('book_id', id),
        supabase
          .from('reading_progress')
          .select('book_id', { count: 'exact', head: true })
          .gte('finished_at', yearStart),
      ]);
      if (sessions.error) throw sessions.error;
      const rows = sessions.data ?? [];
      const seconds = rows.reduce((a, r) => a + (r.active_seconds ?? 0), 0);
      const days = new Set(rows.map((r) => new Date(r.started_at).toDateString())).size;
      return { seconds, days, year: year.count ?? null };
    },
  });

  const tracked = useRef(false);
  useEffect(() => {
    if (!stats.data || tracked.current) return;
    tracked.current = true;
    track('book_finished', { days: stats.data.days, minutes: Math.round(stats.data.seconds / 60) });
  }, [stats.data, track]);

  const close = () => router.replace('/(tabs)/library');

  if (!d) {
    if (!page.isError) {
      // Loading: the band and Close at once, the rest arrives with the data.
      return (
        <Screen top="org" contentStyle={{ backgroundColor: c.white }}>
          <Hero low barBack bar={<IconButton icon="x" label="Close" onPress={close} color={c.onOrg} />}>
            <Skeleton width="80%" height={36} />
            <Skeleton width="50%" height={18} />
          </Hero>
        </Screen>
      );
    }
    return (
      <Screen top="white">
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            title="This didn’t load"
            body={
              online
                ? 'Something went wrong on our side. Try again.'
                : 'You’re offline. Connect and try again.'
            }
            action={{ label: 'Try again', onPress: () => void page.refetch() }}
          />
        </View>
      </Screen>
    );
  }

  const next = d.related.find((b) => !b.owned) ?? d.related[0] ?? null;
  const authorName = d.book.author.name;
  return (
    <Screen top="org" contentStyle={{ backgroundColor: c.white }}>
      <BookEndView
        m={{
          title: d.book.title,
          timeLine:
            stats.data && stats.data.seconds > 0 ? timeLine(stats.data.seconds, stats.data.days) : null,
          yearCount: stats.data?.year ?? null,
          stars: d.my_review?.stars ?? 0,
          discussionSub: `${n(d.comments)} ${d.comments === 1 ? 'comment' : 'comments'} · spoilers allowed`,
          author:
            authorName && !d.is_author ? { name: authorName, tone: avatarTone(d.book.author.id) } : null,
          tipFrom: Math.min(...TIP_PRESETS),
          next: next
            ? { id: next.id, title: next.title, author: next.author ?? '', tone: coverTone(next.id) }
            : null,
        }}
        onClose={close}
        onRate={() => router.push({ pathname: '/book/[id]/write-review', params: { id } })}
        onDiscussion={() => router.push({ pathname: '/book/[id]/discussion', params: { id } })}
        onTip={() => {
          const min = Math.min(...TIP_PRESETS);
          if (d.balance < min) return setShort(min);
          setTip(true);
        }}
        onBook={(b) => router.push({ pathname: '/book/[id]', params: { id: b, source: 'book_end' } })}
      />
      <TipSheet
        book={d}
        open={tip}
        onClose={() => setTip(false)}
        onShort={(need) => {
          setTip(false);
          setShort(need);
        }}
      />
      <UnlockSheet
        book={d}
        open={short > 0 ? 'short' : null}
        need={short}
        onClose={() => setShort(0)}
        onRead={() => setShort(0)}
        onPlans={() => setShort(0)}
        onBuyPack={() => setShort(0)}
      />
    </Screen>
  );
}
