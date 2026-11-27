import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, Screen, Sheet, Skeleton, useTheme, useToast } from '@arpedia/ui';
import { discoverTypeLabel, joinErrorMessage, memberCount } from '@arpedia/core';
import {
  DiscoverHero,
  DiscoverRow,
  TypeChips,
  type DiscoverRowView,
  type DiscoverType,
} from '../../features/06/DiscoverViews';
import { toneFor, useCommunities, useJoin, type Community } from '../../features/06/data';
import { ConsentBody } from '../../features/07/FormViews';
import { useTrack as useRoomsTrack } from '../../features/07/analytics';
import {
  startsLabel,
  useJoinOpenRoom,
  useOpenRooms,
  type JoinResult,
  type OpenRoom,
} from '../../features/07/data';

function toRowView(g: Community): DiscoverRowView {
  const live = g.live && g.member_count <= 10_000 ? ' · live now' : '';
  return {
    id: g.id,
    name: g.name,
    tone: toneFor(g.id),
    avatarUrl: g.avatar_url,
    type: `${discoverTypeLabel(g.kind)} · public · ${memberCount(g.member_count)} members${live}`,
    description: g.description ?? '',
    joined: g.joined,
  };
}

/** An "Anyone" room as a Read-along row: "Read-along · public · 64 members", then its book. */
function roomRowView(r: OpenRoom): DiscoverRowView {
  const when = r.state === 'scheduled' ? ` · ${startsLabel(r.starts_at)}` : '';
  return {
    id: r.room_id,
    name: r.name,
    tone: toneFor(r.room_id),
    type: `Read-along · public · ${memberCount(r.member_count)} members`,
    description: `Reading ${r.book.title}${when}`,
    joined: r.joined,
  };
}

/** Same 2-character search as communities, on the room name or its book (rule 8 of flow 06). */
function roomMatches(r: OpenRoom, q: string) {
  if (q.length < 2) return true;
  const t = q.toLowerCase();
  return r.name.toLowerCase().includes(t) || r.book.title.toLowerCase().includes(t);
}

function openJoinError(r: JoinResult) {
  if (r.status === 'not_found') return 'This room isn’t open to join any more.';
  return joinErrorMessage(r.status, r.retry_at) ?? "Couldn't join. Try again.";
}

export default function Discover() {
  const { c, s } = useTheme();
  const toast = useToast();
  const track = useRoomsTrack();
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState<DiscoverType>('all');
  // 300 ms debounce; search starts at 2 characters (rule 8)
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const list = useCommunities(q, type);
  const join = useJoin();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/community'));

  // Flow 07 rule 8: "Anyone" reading rooms are listed under Read-alongs and join without the code.
  const withRooms = type === 'all' || type === 'readalongs';
  const open = useOpenRooms(withRooms);
  const joinRoom = useJoinOpenRoom();
  const [consent, setConsent] = useState<(JoinResult & { room: string }) | null>(null);
  const rooms = withRooms ? (open.data ?? []).filter((r) => roomMatches(r, q)) : [];
  const groups = list.data ?? [];
  const tryJoin = (room: string, confirm: boolean) => {
    joinRoom.mutate(
      { room, confirm },
      {
        onSuccess: (r) => {
          if (r.status === 'confirm') return setConsent({ ...r, room });
          setConsent(null);
          const ok = r.status === 'joined' || r.status === 'member';
          track('room_join_attempted', ok ? { success: true } : { success: false, error: r.status });
          if (ok) {
            if (r.status === 'joined') track('room_joined', { via: 'discover' });
            return router.push(`/room/${r.room_id ?? room}`);
          }
          toast({ message: openJoinError(r) });
        },
        onError: () => {
          setConsent(null);
          track('room_join_attempted', { success: false, error: 'network' });
          toast({ message: "Couldn't join. Try again." });
        },
      },
    );
  };

  return (
    <Screen top="org" contentStyle={{ paddingBottom: s(28) }}>
      <DiscoverHero query={query} onQuery={setQuery} onBack={back} />
      <TypeChips value={type} onChange={setType} />
      {list.isPending ? (
        <View style={{ paddingTop: s(8), paddingHorizontal: s(16), gap: s(18) }}>
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: s(12) }}>
              <Skeleton width={s(36)} height={36} radius={14} />
              <View style={{ flex: 1, gap: s(6) }}>
                <Skeleton width="50%" height={13} />
                <Skeleton width="70%" height={11} />
                <Skeleton width="90%" height={11} />
              </View>
            </View>
          ))}
        </View>
      ) : list.isError && !list.data ? (
        <EmptyState
          title="Couldn't load communities"
          body="Check your connection and try again."
          action={{ label: 'Try again', onPress: () => void list.refetch() }}
        />
      ) : groups.length + rooms.length === 0 ? (
        <EmptyState
          title="No communities found"
          body={q ? `Nothing matches "${q}". Try another word.` : undefined}
        />
      ) : (
        // .group.group--flush.pt8 (rows draw their own .cell + .cell divider)
        <View style={{ paddingTop: s(8) }}>
          <View style={{ backgroundColor: c.white }}>
            {groups.map((g, i) => (
              <DiscoverRow
                key={g.id}
                row={toRowView(g)}
                divider={i > 0}
                busy={join.isPending && join.variables === g.id}
                onOpen={() => router.push(`/chat/${g.id}`)}
                onJoin={() =>
                  join.mutate(g.id, {
                    onError: () => toast({ message: "Couldn't join. Try again." }),
                  })
                }
              />
            ))}
            {rooms.map((r, i) => (
              <DiscoverRow
                key={r.room_id}
                row={roomRowView(r)}
                divider={groups.length + i > 0}
                busy={joinRoom.isPending && joinRoom.variables?.room === r.room_id && !consent}
                onOpen={() => (r.joined ? router.push(`/room/${r.room_id}`) : tryJoin(r.room_id, false))}
                onJoin={() => tryJoin(r.room_id, false)}
              />
            ))}
          </View>
        </View>
      )}
      <Sheet
        open={!!consent}
        onClose={() => setConsent(null)}
        title={consent?.name}
        locked={joinRoom.isPending}
      >
        {consent ? (
          <ConsentBody
            book={consent.book_title ?? 'this book'}
            blockedWarning={consent.blocked_member}
            busy={joinRoom.isPending}
            onJoin={() => tryJoin(consent.room, true)}
            onCancel={() => setConsent(null)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
