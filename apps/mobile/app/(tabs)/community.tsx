import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Screen, useTheme } from '@arpedia/ui';
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
import { coverToneFor, useRoomsSummary } from '../../features/07/data';
import { useTrack } from '../../features/06/analytics';
import { useFlag } from '../../features/16/config';

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
  const [tab, setTab] = useState<InboxTab>('all');
  const track = useTrack();
  const pickTab = (t: InboxTab) => {
    setTab(t);
    track('inbox_filter_changed', { filter: t });
  };
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
      track('community_opened', { source: 'tab' });
    }, [refetchInbox, refetchCounts, track]),
  );

  // The Reading rooms entries hide while the reading_rooms flag is off (flow 16 rule 27).
  const roomsOn = useFlag('reading_rooms', true);
  const openRooms = roomsOn ? () => router.push('/rooms') : undefined;
  const openDiscover = () => router.push('/discover');
  // Rule 6: the Read together card shows my rooms' friends and books.
  const summary = useRoomsSummary(roomsOn && tab === 'all').data;
  const rooms = summary && {
    people: summary.people.map((p) => ({ name: p.name, tone: toneFor(p.user_id) })),
    readingNow: summary.readingNow,
    books: summary.books.map((b) => ({ title: b.title, tone: coverToneFor(b.id) })),
  };
  const rows = (inbox.data ?? []).map((r) => toRowView(r, tab));
  // Rule 2: reading rooms open s-room (flow 07), author communities s-author-community and a DM
  // with an author s-dm (flow 08, paid messages); every other group opens its chat.
  const byId = new Map((inbox.data ?? []).map((r) => [r.group_id, r]));
  const open = (id: string) => {
    const r = byId.get(id);
    if (r?.kind === 'room') router.push({ pathname: '/room/[id]', params: { id } });
    else if (r?.kind === 'author') router.push({ pathname: '/community/[id]', params: { id } });
    else if (r?.kind === 'dm' && r.is_author && r.other_user_id)
      router.push({ pathname: '/dm/[id]', params: { id: r.other_user_id } });
    else router.push(`/chat/${id}`);
  };

  return (
    <Screen top="org" contentStyle={{ paddingBottom: s(28) }}>
      <CommunityHero
        tab={tab}
        counts={{ all: counts.data?.all, unread: counts.data?.unread, groups: counts.data?.groups }}
        onTab={pickTab}
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
        <InboxList rows={rows} onOpen={(r) => open(r.id)} />
      )}
      {tab === 'all' ? <ReadTogether rooms={rooms} onRooms={openRooms} onDiscover={openDiscover} /> : null}
    </Screen>
  );
}
