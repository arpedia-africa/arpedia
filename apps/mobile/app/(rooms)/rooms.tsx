import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { Screen, useTheme } from '@arpedia/ui';
import { activeLabel } from '@arpedia/core';
import {
  FinishedRooms,
  RoomList,
  RoomsEmpty,
  RoomsError,
  RoomsHero,
  RoomsSectionHead,
  RoomsSkeleton,
  type RoomRowView,
} from '../../features/07/RoomsViews';
import { coverToneFor, startsLabel, useMyRooms, type RoomRow } from '../../features/07/data';

function toRowView(r: RoomRow, now: Date): RoomRowView {
  const members = `${r.member_count} member${r.member_count === 1 ? '' : 's'}`;
  const scheduled = r.state === 'scheduled';
  const starts = startsLabel(r.starts_at, now);
  return {
    id: r.room_id,
    name: r.name,
    book: r.book.title,
    tone: coverToneFor(r.book.id),
    members: scheduled
      ? `${members} · ${starts.charAt(0).toLowerCase()}${starts.slice(1)}`
      : `${members} · ${r.finished_count} finished`,
    active: scheduled ? starts : r.state === 'ended' ? 'Ended' : activeLabel(r.last_activity_at, now),
    percent: scheduled ? 0 : Number(r.my_percent),
    unread: r.unread,
  };
}

/** s-rooms: the promise band, Create room and Join with code, then Your rooms. */
export default function Rooms() {
  const { s } = useTheme();
  const net = useNetInfo();
  const offline = net.isConnected === false;
  const rooms = useMyRooms();
  const { refetch } = rooms;

  // No Realtime: refresh whenever the screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const { live, ended } = useMemo(() => {
    const now = new Date();
    const all = rooms.data ?? [];
    return {
      live: all.filter((r) => r.state !== 'ended').map((r) => toRowView(r, now)),
      ended: all.filter((r) => r.state === 'ended').map((r) => toRowView(r, now)),
    };
  }, [rooms.data]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/community'));
  const create = () => router.push('/create-room');
  const join = () => router.push('/join-code');
  const open = (r: RoomRowView) => router.push(`/room/${r.id}`);

  return (
    <Screen top="org" contentStyle={{ paddingBottom: s(28) }}>
      <RoomsHero onBack={back} onCreate={create} onJoin={join} offline={offline} />
      {rooms.isPending ? (
        <RoomsSkeleton />
      ) : rooms.isError && !rooms.data ? (
        <RoomsError onRetry={() => void rooms.refetch()} />
      ) : live.length + ended.length === 0 ? (
        <RoomsEmpty onCreate={create} onJoin={join} offline={offline} />
      ) : (
        <>
          {live.length > 0 ? (
            // .section: padding-top 24 over the head
            <View style={{ paddingTop: s(24) }}>
              <RoomsSectionHead title="Your rooms" count={live.length} />
              <RoomList rows={live} onOpen={open} />
            </View>
          ) : null}
          <FinishedRooms rows={ended} onOpen={open} />
        </>
      )}
    </Screen>
  );
}
