import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Screen, useTheme } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { AboutSkeleton, BackHero, DiscussionLockedView } from '../../../features/03/AboutViews';

// s-book-discussion (rule 47): locked until 95% read. At 95% the book room opens (flow 06); the
// server enforces the gate there too.

interface DiscussionData {
  title: string;
  percent: number;
  max_percent: number;
  unlocked: boolean;
  chapter_ord: number;
  chapters: number;
}

export default function Discussion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useTheme();
  const q = useQuery({
    queryKey: ['book-discussion', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_book_discussion', { p_book: id });
      if (error) throw error;
      return data as unknown as DiscussionData | null;
    },
  });
  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/book/[id]', params: { id } });
  const d = q.data;
  return (
    <Screen top="org">
      <BackHero
        title="Discussion"
        sub={d ? `${d.title} · reader notes and reactions` : undefined}
        onBack={back}
      />
      {d ? (
        d.unlocked ? (
          <View style={{ paddingTop: s(24) }}>
            <EmptyState
              title="You finished it"
              body="The book room opens with Community. Your place is saved."
              action={{ label: 'Open the book room', onPress: () => router.push('/community') }}
            />
          </View>
        ) : (
          <DiscussionLockedView
            percent={Number(d.max_percent)}
            chapter={d.chapter_ord}
            chapters={d.chapters}
            onRead={() => router.push({ pathname: '/read/[id]', params: { id } })}
          />
        )
      ) : q.isPending ? (
        <AboutSkeleton />
      ) : (
        <View style={{ paddingTop: s(24) }}>
          <EmptyState
            title="This didn’t load"
            body="Check your connection and try again."
            action={{ label: 'Try again', onPress: () => void q.refetch() }}
          />
        </View>
      )}
    </Screen>
  );
}
