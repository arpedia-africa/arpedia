import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, Hero, IconButton, Screen, Skeleton, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { BlockedRow } from '../../features/06/BlockedViews';
import { useTrack } from '../../features/06/analytics';
import { chatAction, type ChatAction } from '../../features/06/chat';
import { toneFor } from '../../features/06/data';

// s-blocked: who the user blocked, where, and one-tap Unblock with a 5 s Undo (rule 32).

const blockedKey = ['community', 'blocked'] as const;

/**
 * Rule 30: block and unblock go through the chat Worker of the group they started in, so that
 * conversation's live block list changes at once. A group the user has left answers no: the RPC then.
 */
const viaWorker = (group: string, a: ChatAction) =>
  chatAction(group, a).then(
    () => true,
    () => false,
  );
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2 Nov" */
const dayMonth = (at: string) => {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export default function Blocked() {
  const { c, s } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const track = useTrack();
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
      if (v.group && (await viaWorker(v.group, { type: 'block', user_id: v.user, at: v.at }))) return;
      const { error } = await supabase.rpc('block_user', {
        p_user: v.user,
        p_source_group: v.group as string,
        p_at: v.at,
      });
      if (error) throw error;
    },
    onSuccess: () => track('user_blocked'),
    onSettled: refresh,
  });
  const unblock = useMutation({
    mutationFn: async ({ user, group }: { user: string; group: string | null }) => {
      if (group && (await viaWorker(group, { type: 'unblock', user_id: user }))) return;
      const { error } = await supabase.rpc('unblock_user', { p_user: user });
      if (error) throw error;
    },
    onSuccess: () => track('user_unblocked', { undo: false }),
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
            <BlockedRow
              key={b.user_id}
              name={b.full_name}
              tone={toneFor(b.user_id)}
              avatarUrl={b.avatar_url}
              sub={`Blocked ${dayMonth(b.created_at)} · from ${
                b.source_kind === 'dm' || !b.source_name ? 'messages' : b.source_name
              }`}
              divider={i > 0}
              onUnblock={() =>
                unblock.mutate(
                  { user: b.user_id, group: b.source_group_id },
                  {
                    onSuccess: () =>
                      toast({
                        message: `${b.full_name} unblocked`,
                        duration: 5000,
                        // Undo re-blocks with the original date and source.
                        onUndo: () =>
                          block.mutate({ user: b.user_id, group: b.source_group_id, at: b.created_at }),
                      }),
                    onError: () => toast({ message: "Couldn't unblock. Try again." }),
                  },
                )
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
