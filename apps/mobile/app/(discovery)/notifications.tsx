import { useState } from 'react';
import { router } from 'expo-router';
import { RefreshControl, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { EmptyState, Screen, useTheme, useToast } from '@arpedia/ui';
import {
  FeedSkeleton,
  NotificationFeed,
  NotificationsHero,
  type NotifCategory,
  type NotifRow,
} from '../../features/02/NotificationViews';
import { toRow, useMarkRead, useNotifications, type ServerNotif } from '../../features/02/notifications';
import { hrefFor } from '../../features/15/push';
import { ListError } from '../../features/02/ListViews';

/** `s-notifications`: New and Earlier, category tabs, Mark all read (rules 30–33). */
export default function Notifications() {
  const { c, s } = useTheme();
  const toast = useToast();
  const [category, setCategory] = useState<NotifCategory>('all');
  const feed = useNotifications(category);
  const mark = useMarkRead();
  const pages = feed.data?.pages;
  const items = pages?.flatMap((p) => p.items) ?? [];
  const unread = pages?.[0]?.unread ?? 0;

  const open = (row: NotifRow) => {
    const n = items.find((x) => x.id === row.id);
    if (!n) return;
    if (!n.read_at) mark.one.mutate(n.id);
    openTarget(n);
  };
  // Same routes as a push tap (flow 15): reader at the saved page, author, post, room, group.
  const openTarget = (n: ServerNotif) => {
    if (!n.target_type || !n.target_id) return toast({ message: 'That is no longer available' });
    const target =
      n.target_type === 'screen'
        ? { kind: 'screen', screen: n.target_id }
        : { kind: n.target_type, id: n.target_id };
    const href = hrefFor(target, 'notifications') ?? '/community';
    // Discussions and messages without their own route live in Community.
    router.push(target.kind !== 'screen' && href === '/home' ? '/community' : href);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (
      layoutMeasurement.height + contentOffset.y > contentSize.height - 600 &&
      feed.hasNextPage &&
      !feed.isFetchingNextPage
    )
      void feed.fetchNextPage();
  };

  const body = () => {
    if (pages) {
      if (!items.length)
        return (
          <EmptyState
            title={category === 'all' ? 'Nothing yet' : 'Nothing here yet'}
            body="Follow authors and join clubs to hear from them."
          />
        );
      return <NotificationFeed rows={items.map(toRow)} onOpen={open} />;
    }
    if (feed.isError) return <ListError onRetry={() => void feed.refetch()} />;
    return <FeedSkeleton />;
  };

  return (
    <Screen
      top="org"
      contentStyle={{ paddingBottom: s(28) }}
      onScroll={onScroll}
      refreshControl={
        <RefreshControl
          refreshing={feed.isRefetching && !feed.isFetchingNextPage && !feed.isLoading}
          onRefresh={() => void feed.refetch()}
          colors={[c.org]}
          progressBackgroundColor={c.white}
        />
      }
    >
      <NotificationsHero
        unread={unread}
        category={category}
        onCategory={setCategory}
        onBack={() => router.back()}
        onSettings={() => toast({ message: 'Notification settings are coming soon' })}
        onMarkAll={() => mark.all.mutate()}
      />
      {body()}
    </Screen>
  );
}
