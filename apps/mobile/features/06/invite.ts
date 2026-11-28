import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share } from 'react-native';
import { clubInviteUrl } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { useAskPush } from '../15/push';
import { useTrack } from './analytics';
import type { GroupInfo } from './chat';

// Flow 06 rule 9: private clubs are joined by invitation link only (server: 20261127211500).

export interface InvitePreview {
  group_id: string;
  kind: GroupInfo['kind'];
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number;
  joined: boolean;
  banned: boolean;
}

/** Owners and moderators of a private club (not DMs or rooms) can share its link. */
export function canShareInvite(g: Pick<GroupInfo, 'kind' | 'visibility' | 'role'> | undefined) {
  return (
    !!g &&
    g.visibility === 'private' &&
    g.kind !== 'dm' &&
    g.kind !== 'room' &&
    (g.role === 'owner' || g.role === 'moderator')
  );
}

/** Make (or read) the club's link, then the system share sheet. */
export function useShareInvite(gid: string, name: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('get_group_invite', { p_group: gid });
      if (error || !data) throw error ?? new Error('no_token');
      const url = clubInviteUrl(data);
      await Share.share({ message: `Join ${name ?? 'my club'} on Arpedia: ${url}`, url });
    },
  });
}

/** What the link opens. Null: unknown, reset or archived link, or a club that is no longer private. */
export function useInvitePreview(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['community', 'invite', token],
    enabled: enabled && !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invite_preview', { p_token: token });
      if (error) throw error;
      return (data ?? null) as unknown as InvitePreview | null;
    },
  });
}

/** "invite_invalid" (link reset meanwhile) and "banned" come back as the error message. */
export function useJoinInvite(token: string) {
  const qc = useQueryClient();
  const askPush = useAskPush();
  const track = useTrack();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('join_group_invite', { p_token: token });
      if (error || !data) throw error ?? new Error('invite_invalid');
      return data;
    },
    onSuccess: () => {
      askPush('join');
      const p = qc.getQueryData<InvitePreview | null>(['community', 'invite', token]);
      track('group_joined', { group_kind: p?.kind ?? 'unknown', source: 'invite' });
      return qc.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function inviteJoinError(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? '');
  if (m.includes('banned')) return "You can't join this club.";
  if (m.includes('invite_invalid')) return 'This link no longer works. Ask the club for a new one.';
  return "Couldn't join. Try again.";
}
