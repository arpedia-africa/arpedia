import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Screen, useTheme, useToast } from '@arpedia/ui';
import { groupTypeLabel, inboxTime, memberCount } from '@arpedia/core';
import {
  CommunityHero,
  InboxEmpty,
  InboxError,
  InboxList,
  InboxSkeleton,
  ReadTogether,
  UnreadBar,
  type InboxRowView,
  type InboxTab,
} from '../../features/06/InboxViews';
import { toneFor, useInbox, useInboxCounts, useMarkAllRead, type InboxRow } from '../../features/06/data';

/** Last message as "Sender: text"; groups filter shows "Type · N members" instead (rule 3). */
function rowSub(r: InboxRow, tab: InboxTab): string {
  if (tab === 'groups') return `${groupTypeLabel(r.kind)} · ${memberCount(r.member_count)} members`;
  if (!r.last_sender) return `${groupTypeLabel(r.kind)} · ${memberCount(r.member_count)} members`;
  const text =
    r.last_state === 'deleted'
      ? 'This message was deleted'
      : r.last_state === 'removed'
        ? 'Removed by a moderator'
        : r.last_kind === 'quote'
          ? 'shared a highlight'
          : (r.last_body ?? '');
  return `${r.last_sender}: ${text.replace(/\s+/g, ' ')}`;
}

function toRowView(r: InboxRow, tab: InboxTab, now = new Date()): InboxRowView {
  return {
    id: r.group_id,
    name: r.name,
    tone: toneFor(r.group_id),
    avatarUrl: r.avatar_url,
    person: r.kind === 'dm',
    live: r.live,
    author: r.is_author,
    sub: rowSub(r, tab),
    time: inboxTime(r.last_at, now),
    unread: r.unread_count,
    muted: r.muted,
  };
}

export default function Community() {
  const { s } = useTheme();
  const toast = useToast();
  const [tab, setTab] = useState<InboxTab>('all');
  const inbox = useInbox(tab);
  const counts = useInboxCounts();
  const markAll = useMarkAllRead();
  const { refetch: refetchInbox } = inbox;
  const { refetch: refetchCounts } = counts;

  // No Realtime: refresh whenever the tab comes back into view.
  useFocusEffect(
    useCallback(() => {
      void refetchInbox();
      void refetchCounts();
    }, [refetchInbox, refetchCounts]),
  );

  // Reading rooms (s-rooms) are flow 07.
  const openRooms = () => toast({ message: 'Reading rooms come in a later part of the build.' });
  const openDiscover = () => router.push('/discover');
  const rows = (inbox.data ?? []).map((r) => toRowView(r, tab));

  return (
    <Screen top="org" contentStyle={{ paddingBottom: s(28) }}>
      <CommunityHero
        tab={tab}
        counts={{ all: counts.data?.all, unread: counts.data?.unread }}
        onTab={setTab}
        onRooms={openRooms}
        onDiscover={openDiscover}
      />
      {tab === 'unread' && rows.length > 0 ? (
        <UnreadBar count={rows.length} busy={markAll.isPending} onMarkAll={() => markAll.mutate()} />
      ) : null}
      {inbox.isPending ? (
        <InboxSkeleton />
      ) : inbox.isError && !inbox.data ? (
        <InboxError onRetry={() => void inbox.refetch()} />
      ) : rows.length === 0 ? (
        <InboxEmpty tab={tab} onDiscover={openDiscover} onRooms={openRooms} />
      ) : (
        <InboxList rows={rows} onOpen={(r) => router.push(`/chat/${r.id}`)} />
      )}
      {tab === 'all' ? <ReadTogether onRooms={openRooms} onDiscover={openDiscover} /> : null}
    </Screen>
  );
}
