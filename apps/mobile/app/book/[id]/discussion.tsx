import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { EmptyState, Screen, useTheme } from '@arpedia/ui';
import { AboutSkeleton, BackHero, DiscussionLockedView } from '../../../features/03/AboutViews';
import { clubSub, passageSub, useBookDiscussion } from '../../../features/03/discussion';

// s-book-discussion (rule 47): locked until 95% read. At 95% the screen redirects to the book room
// (the club chat, flow 06); the server enforces the gate there too.

export default function Discussion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useTheme();
  const q = useBookDiscussion(id);
  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/book/[id]', params: { id } });
  const d = q.data;
  const roomId = d?.unlocked ? (d.club?.id ?? null) : null;
  useEffect(() => {
    if (roomId) router.replace({ pathname: '/chat/[id]', params: { id: roomId } });
  }, [roomId]);
  const toReader = () => router.push({ pathname: '/read/[id]', params: { id } });
  return (
    <Screen top="org">
      <BackHero
        title="Discussion"
        sub={d ? `${d.title} · reader notes and reactions` : undefined}
        onBack={back}
      />
      {d ? (
        d.unlocked ? (
          roomId ? null : (
            <View style={{ paddingTop: s(24) }}>
              <EmptyState
                title="You finished it"
                body="No club is reading this book yet. Find one in Community."
                action={{ label: 'Open Community', onPress: () => router.push('/community') }}
              />
            </View>
          )
        ) : (
          <DiscussionLockedView
            percent={Number(d.max_percent)}
            chapter={d.chapter_ord}
            chapters={d.chapters}
            onRead={toReader}
            passage={
              d.chapter_comments > 0
                ? { sub: passageSub(d.chapter_comments, d.chapter_ord), onPress: toReader }
                : null
            }
            club={
              d.club
                ? {
                    name: d.club.name,
                    title: d.club.name,
                    sub: clubSub(d.club.members),
                    onPress: () => router.push({ pathname: '/chat/[id]', params: { id: d.club!.id } }),
                  }
                : null
            }
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
