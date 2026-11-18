import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Btn,
  EmptyState,
  Hero,
  IconButton,
  Screen,
  Skeleton,
  Text,
  useTheme,
  useToast,
} from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { toneFor } from '../../features/06/data';

// s-blocked: who the user blocked, where, and one-tap Unblock with a 5 s Undo (rule 32).

const blockedKey = ['community', 'blocked'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2 Nov" */
const dayMonth = (at: string) => {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export default function Blocked() {
  const { c, s, bw } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: blockedKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_blocked');
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['community'] });
  const block = useMutation({
    mutationFn: async (v: { user: string; group: string | null; at: string }) => {
      const { error } = await supabase.rpc('block_user', {
        p_user: v.user,
        p_source_group: v.group as string,
        p_at: v.at,
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });
  const unblock = useMutation({
    mutationFn: async (user: string) => {
      const { error } = await supabase.rpc('unblock_user', { p_user: user });
      if (error) throw error;
    },
    onSettled: refresh,
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  return (
    <Screen top="org" contentStyle={{ paddingBottom: s(28) }}>
      <Hero
        barBack
        bar={<IconButton icon="back" label="Back" onPress={back} color={c.onOrg} />}
        title="Blocked people"
        sub="Blocked people can't message you and their posts are hidden. They aren't told."
      />
      {list.isPending ? (
        <View style={{ paddingTop: s(8), paddingHorizontal: s(16), gap: s(16) }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} height={40} radius={12} />
          ))}
        </View>
      ) : list.isError && !list.data ? (
        <EmptyState
          title="Couldn't load blocked people"
          body="Check your connection and try again."
          action={{ label: 'Try again', onPress: () => void list.refetch() }}
        />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState title="You haven't blocked anyone." />
      ) : (
        <View style={{ paddingTop: s(8) }}>
          {(list.data ?? []).map((b, i) => (
            <View
              key={b.user_id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(12),
                paddingVertical: s(12),
                paddingHorizontal: s(16),
                minHeight: s(56),
                ...(i ? { borderTopWidth: bw(1), borderTopColor: c.line } : null),
              }}
            >
              <Avatar name={b.full_name} uri={b.avatar_url ?? undefined} tone={toneFor(b.user_id)} />
              <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
                <Text size={14.5} weight={600} ellipsis style={{ lineHeight: s(14.5) * 1.3 }}>
                  {b.full_name}
                </Text>
                <Text size={12.5} color="ink3" ellipsis style={{ lineHeight: s(12.5) * 1.35 }}>
                  {`Blocked ${dayMonth(b.created_at)} · from ${
                    b.source_kind === 'dm' || !b.source_name ? 'messages' : b.source_name
                  }`}
                </Text>
              </View>
              <Btn
                label="Unblock"
                variant="g"
                size="sm"
                onPress={() =>
                  unblock.mutate(b.user_id, {
                    onSuccess: () =>
                      toast({
                        message: `${b.full_name} unblocked`,
                        duration: 5000,
                        // Undo re-blocks with the original date and source.
                        onUndo: () =>
                          block.mutate({ user: b.user_id, group: b.source_group_id, at: b.created_at }),
                      }),
                    onError: () => toast({ message: "Couldn't unblock. Try again." }),
                  })
                }
              />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}
