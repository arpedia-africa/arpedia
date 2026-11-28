import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { EmptyState, Hero, IconButton, Screen, Skeleton, useTheme, useToast } from '@arpedia/ui';
import { discoverTypeLabel, memberCount } from '@arpedia/core';
import { useSession } from '../../../features/01/session';
import { DiscoverRow } from '../../../features/06/DiscoverViews';
import { toneFor } from '../../../features/06/data';
import { inviteJoinError, useInvitePreview, useJoinInvite } from '../../../features/06/invite';

// Flow 06 rule 9: arpedia.africa/c/invite/TOKEN opens the private club it invites to, as the
// s-discover row (name, "Club · private · N members", two-line description, Join or Joined).
export default function ClubInvite() {
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = (raw ?? '').trim().toLowerCase();
  const { c, s } = useTheme();
  const toast = useToast();
  const session = useSession();
  const offline = useNetInfo().isConnected === false;
  const preview = useInvitePreview(token, !!session);
  const join = useJoinInvite(token);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/community'));
  const p = preview.data;
  const openChat = (id: string) => router.replace(`/chat/${id}`);

  let body;
  if (session === null) {
    body = (
      <EmptyState
        title="Sign in to join"
        body="Sign in or create an account, then open the invitation link again."
        action={{ label: 'Sign in', onPress: () => router.replace('/') }}
      />
    );
  } else if (session === undefined || (preview.isPending && !offline)) {
    body = (
      <View style={{ paddingTop: s(8), paddingHorizontal: s(16), flexDirection: 'row', gap: s(12) }}>
        <Skeleton width={s(36)} height={36} radius={14} />
        <View style={{ flex: 1, gap: s(6) }}>
          <Skeleton width="50%" height={13} />
          <Skeleton width="70%" height={11} />
          <Skeleton width="90%" height={11} />
        </View>
      </View>
    );
  } else if (offline && p === undefined) {
    body = (
      <EmptyState
        title="You're offline"
        body="Connect to open this invitation."
        action={{ label: 'Try again', onPress: () => void preview.refetch() }}
      />
    );
  } else if (preview.isError && p === undefined) {
    body = (
      <EmptyState
        title="Couldn't open the invitation"
        body="Check your connection and try again."
        action={{ label: 'Try again', onPress: () => void preview.refetch() }}
      />
    );
  } else if (!p) {
    body = (
      <EmptyState
        title="This link no longer works"
        body="The club may have made a new link. Ask the person who sent it for a new one."
        action={{ label: 'Find communities', onPress: () => router.replace('/discover') }}
      />
    );
  } else if (p.banned) {
    body = <EmptyState title="You can't join this club" body="You were removed from this club." />;
  } else {
    body = (
      // .group.group--flush.pt8, one s-discover row
      <View style={{ paddingTop: s(8) }}>
        <View style={{ backgroundColor: c.white }}>
          <DiscoverRow
            row={{
              id: p.group_id,
              name: p.name,
              tone: toneFor(p.group_id),
              avatarUrl: p.avatar_url,
              type: `${discoverTypeLabel(p.kind)} · private · ${memberCount(p.member_count)} members`,
              description: p.description ?? '',
              joined: p.joined,
            }}
            divider={false}
            busy={join.isPending}
            onOpen={() => (p.joined ? openChat(p.group_id) : undefined)}
            onJoin={() => {
              if (offline) return toast({ message: 'Connect to do this' });
              join.mutate(undefined, {
                onSuccess: (id) => {
                  toast({ message: `You joined ${p.name}` });
                  openChat(id);
                },
                onError: (e) => {
                  toast({ message: inviteJoinError(e) });
                  void preview.refetch();
                },
              });
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <Screen top="org" contentStyle={{ paddingBottom: s(28) }}>
      <Hero
        barBack
        bar={<IconButton icon="back" label="Back" onPress={back} color={c.onOrg} />}
        title="Club invitation"
        sub="You've been invited to a private club. Only people with the link can join."
      />
      {body}
    </Screen>
  );
}
