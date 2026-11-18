import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, Screen, Skeleton, useTheme, useToast } from '@arpedia/ui';
import { discoverTypeLabel, memberCount } from '@arpedia/core';
import {
  DiscoverHero,
  DiscoverRow,
  TypeChips,
  type DiscoverRowView,
  type DiscoverType,
} from '../../features/06/DiscoverViews';
import { toneFor, useCommunities, useJoin, type Community } from '../../features/06/data';

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

export default function Discover() {
  const { c, s } = useTheme();
  const toast = useToast();
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
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="No communities found"
          body={q ? `Nothing matches "${q}". Try another word.` : undefined}
        />
      ) : (
        // .group.group--flush.pt8 (rows draw their own .cell + .cell divider)
        <View style={{ paddingTop: s(8) }}>
          <View style={{ backgroundColor: c.white }}>
            {(list.data ?? []).map((g, i) => (
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
          </View>
        </View>
      )}
    </Screen>
  );
}
