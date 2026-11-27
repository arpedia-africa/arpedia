import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { useMyProfile, useSession } from '../../features/01/session';
import { STUDIO } from '../../features/11/application';
import { useProfileSummary, useSetGoal } from '../../features/10/data';
import { GoalSheet, ProfileView } from '../../features/10/ProfileViews';
import { useTrack } from '../../features/10/analytics';

// Flow 10 · Profile tab (s-profile) with the Reading goal sheet (s-goal) over it.
export default function Profile() {
  const session = useSession();
  const uid = session?.user.id;
  const profile = useMyProfile(uid);
  const summary = useProfileSummary(!!uid);
  const setGoal = useSetGoal();
  const [goalOpen, setGoalOpen] = useState(false);
  const track = useTrack();
  useFocusEffect(useCallback(() => track('profile_viewed'), [track]));

  return (
    <Screen top="org">
      <ProfileView
        name={profile.data?.full_name ?? ''}
        email={session?.user.email ?? ''}
        avatarUrl={profile.data?.avatar_url}
        summary={summary.data}
        error={summary.isError}
        onRetry={() => void summary.refetch()}
        onSettings={() => router.push('/account')}
        onGoal={() => setGoalOpen(true)}
        onCollection={(tab) => {
          track('collection_opened', { tab });
          router.push({ pathname: '/my-highlights', params: { tab } });
        }}
        // The become-author page shows the right action for every application state.
        onAuthor={() => router.push(summary.data?.is_author ? STUDIO : '/become-author')}
      />
      <GoalSheet
        open={goalOpen}
        current={summary.data?.goal ?? null}
        read={summary.data?.read_this_year ?? 0}
        saving={setGoal.isPending}
        error={setGoal.isError ? "Couldn't save your goal. Try again." : undefined}
        onClose={() => setGoalOpen(false)}
        onSave={(target) =>
          setGoal.mutate(
            { year: summary.data?.year ?? new Date().getFullYear(), target },
            {
              onSuccess: () => {
                track('goal_set', { target, previous: summary.data?.goal ?? 0 });
                setGoalOpen(false);
              },
            },
          )
        }
      />
    </Screen>
  );
}
