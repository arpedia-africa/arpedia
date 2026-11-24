import { useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { Screen, useToast, type ThemeName } from '@arpedia/ui';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { useUi } from '@/lib/ui-store';
import { signOutHere, useMyProfile, useSession } from '../../features/01/session';
import { saveStep } from '../../features/01/steps';
import { setReaderTheme } from '../../features/10/data';
import { SettingsView, ThemeSheet, type ReaderTheme } from '../../features/10/SettingsViews';

// Flow 10 · Settings (s-account) with the App colour sheet (s-theme-settings) over it.
export default function Account() {
  const toast = useToast();
  const session = useSession();
  const uid = session?.user.id;
  const profile = useMyProfile(uid);
  const theme = useUi((st) => st.theme);
  const setTheme = useUi((st) => st.setTheme);
  const [themeOpen, setThemeOpen] = useState(false);

  // Small facts for row trails; each row works without them (rule 14 "render at once from cache").
  const extra = useQuery({
    queryKey: ['account-extra', uid],
    enabled: !!uid,
    queryFn: async () => {
      const [prof, picks, credits] = await Promise.all([
        supabase.from('profiles').select('reader_theme').eq('id', uid!).single(),
        supabase.from('user_genres').select('genre_id', { count: 'exact', head: true }),
        supabase.rpc('credit_balance', { p_user: uid! }),
      ]);
      return {
        readerTheme: (prof.data?.reader_theme ?? 'light') as ReaderTheme,
        interests: picks.count ?? undefined,
        credits: credits.data ?? undefined,
      };
    },
  });
  const [readerTheme, setLocalReader] = useState<ReaderTheme | null>(null);

  const soon = (what: string) => toast({ message: `${what} opens here once it ships.` });
  const pickTheme = (t: ThemeName) => {
    // Recolours at once, kept on the phone first; saved to profiles.theme when online (rule 18).
    setTheme(t);
    void saveStep('theme', { theme: t }).catch(() => {});
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  return (
    <Screen top="org">
      <SettingsView
        d={{
          name: profile.data?.full_name ?? '',
          email: session?.user.email ?? '',
          avatarUrl: profile.data?.avatar_url,
          interests: extra.data?.interests,
          readerTheme: readerTheme ?? extra.data?.readerTheme ?? 'light',
          credits: extra.data?.credits,
          subscription: undefined,
          appColour: theme,
          version: Application.nativeApplicationVersion ?? '1.0.0',
        }}
        a={{
          onBack: back,
          onEditProfile: () => router.push('/edit-profile'),
          onNotifications: () => router.push('/notification-settings'),
          onSecurity: () => router.push('/security'),
          onPrivacy: () => soon('Blocked people'),
          onPreferences: () => router.push('/(onboarding)/interests'),
          onNavigation: () => soon('Reader settings'),
          onReaderTheme: (t) => {
            if (!uid) return;
            const before = readerTheme ?? extra.data?.readerTheme ?? 'light';
            setLocalReader(t);
            setReaderTheme(t, uid)
              .then(() => queryClient.invalidateQueries({ queryKey: ['account-extra', uid] }))
              .catch(() => {
                setLocalReader(before);
                toast({ message: "Couldn't save that. Try again." });
              });
          },
          onDownloads: () => soon('Downloads'),
          onCredits: () => soon('Credits'),
          onSubscription: () => soon('Plans'),
          onAppColour: () => setThemeOpen(true),
          onInvite: () =>
            void Share.share({ message: 'Read African stories with me on Arpedia: https://arpedia.africa' }),
          onAbout: () => router.push('/about'),
          onLogOut: () => {
            void signOutHere().finally(() => router.replace('/(auth)/login'));
          },
          onDelete: () => router.push('/delete-account'),
        }}
      />
      <ThemeSheet open={themeOpen} value={theme} onPick={pickTheme} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}
