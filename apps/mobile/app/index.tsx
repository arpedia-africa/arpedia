import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTheme } from '@arpedia/ui';
import { useUi } from '@/lib/ui-store';
import { routeForStep, useMyProfile, useSession } from '../features/01/session';
import { flushSteps } from '../features/01/steps';

// Start: no session → Log in; signed in → the first unfinished onboarding step (rule 29), else Home.
// The profile is cached, so an offline start still lands in the right place.
export default function Index() {
  const { c } = useTheme();
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const setTheme = useUi((st) => st.setTheme);

  useEffect(() => {
    if (session) void flushSteps();
  }, [session]);
  // The saved colour follows the account onto a new phone.
  useEffect(() => {
    if (profile.data?.theme && profile.data.onboarding_step === 'done') setTheme(profile.data.theme);
  }, [profile.data?.theme, profile.data?.onboarding_step, setTheme]);

  if (session === undefined) return <View style={{ flex: 1, backgroundColor: c.white }} />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (profile.data) return <Redirect href={routeForStep(profile.data.onboarding_step)} />;
  if (profile.isError) return <Redirect href="/home" />;
  return <View style={{ flex: 1, backgroundColor: c.white }} />;
}
