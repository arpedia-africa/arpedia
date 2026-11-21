import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Screen, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { isNetworkError, useSession } from '../../../features/01/session';
import { STUDIO, rpcCode } from '../../../features/11/application';
import { useStudioHome } from '../../../features/11/studio';
import {
  StudioClubView,
  type ClubSettingsValues,
  type WhoCanPost,
} from '../../../features/11/StudioSettingsViews';

// groups.who_can_post (flow 06). "Only me" is the author (and, from flow 08, followers); moderators
// post under both "Only me" and "Moderators" in flow 06's post rules. See the PR notes.
const WHO: Record<WhoCanPost, ClubWho> = {
  everyone: 'members',
  only_me: 'owner_and_followers',
  moderators: 'staff',
};
type ClubWho = 'members' | 'staff' | 'owner_and_followers';
const FROM_DB: Record<ClubWho, WhoCanPost> = {
  members: 'everyone',
  owner_and_followers: 'only_me',
  staff: 'moderators',
};

function useClub(id: string | null | undefined) {
  return useQuery({
    queryKey: ['studio-club', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('groups')
        .select('who_can_post, slow_mode_seconds, visibility, member_count')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** s-studio-community: who can post and slow mode, stored on the club row (rule 33). */
export default function StudioClub() {
  const toast = useToast();
  const uid = useSession()?.user.id;
  const home = useStudioHome(uid);
  const club = useClub(home.data?.club_group_id);
  const [values, setValues] = useState<ClubSettingsValues>({
    who: 'everyone',
    publicClub: true,
    slowMode: false,
  });
  const [notReady, setNotReady] = useState(false);
  const pen = home.data?.pen_name.split(/\s+/)[0];

  // Start from what is stored on the club row once it loads.
  const loaded = club.data;
  useEffect(() => {
    if (!loaded) return;
    setValues({
      who: FROM_DB[loaded.who_can_post],
      publicClub: loaded.visibility === 'public',
      slowMode: loaded.slow_mode_seconds > 0,
    });
  }, [loaded]);

  const change = async (v: Partial<ClubSettingsValues>) => {
    const prev = values;
    const next = { ...values, ...v };
    setValues(next);
    if ('publicClub' in v) return; // club visibility is set with community chat (flow 06)
    const { error } = await supabase.rpc('set_club_settings', {
      p_who_can_post: WHO[next.who],
      p_slow_mode_seconds: next.slowMode ? 30 : 0,
    });
    if (!error) return;
    if (rpcCode(error).code === 'club_not_ready') {
      setNotReady(true);
      return;
    }
    setValues(prev);
    toast({
      message: isNetworkError(error)
        ? 'You’re offline. Try again when connected.'
        : 'Couldn’t save. Try again.',
    });
  };

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioClubView
        title={pen ? `${pen}’s Readers` : 'Your club'}
        sub={
          loaded
            ? `Club settings · ${loaded.member_count.toLocaleString('en-NG')} ${loaded.member_count === 1 ? 'member' : 'members'}`
            : 'Club settings'
        }
        values={values}
        notReady={notReady || (home.data ? !home.data.club_group_id : false)}
        onChange={(v) => void change(v)}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(STUDIO))}
        onMuted={() => toast({ message: 'Muted words open with community chat' })}
        onModerators={() => toast({ message: 'Moderators open with community chat' })}
      />
    </Screen>
  );
}
