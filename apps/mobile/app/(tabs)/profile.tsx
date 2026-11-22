import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, useToast } from '@arpedia/ui';
import { useMyProfile, useSession } from '../../features/01/session';
import { useProfileSummary, useSetGoal } from '../../features/10/data';
import { GoalSheet, ProfileView } from '../../features/10/ProfileViews';

// Flow 10 · Profile tab (s-profile) with the Reading goal sheet (s-goal) over it.
export default function Profile() {
  const toast = useToast();
  const session = useSession();
  const uid = session?.user.id;
  const profile = useMyProfile(uid);
  const summary = useProfileSummary(!!uid);
  const setGoal = useSetGoal();
  const [goalOpen, setGoalOpen] = useState(false);

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
        onCollection={(tab) => router.push({ pathname: '/my-highlights', params: { tab } })}
        onAuthor={() =>
          summary.data?.is_author
            ? toast({ message: 'Author Studio opens here once it ships.' })
            : toast({ message: 'Author applications open here soon.' })
        }
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
            { onSuccess: () => setGoalOpen(false) },
          )
        }
      />
    </Screen>
  );
}
