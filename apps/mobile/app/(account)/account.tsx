import { useState } from 'react';
import { Share } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { Screen, useToast, type ThemeName } from '@arpedia/ui';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { useUi } from '@/lib/ui-store';
import { useMyProfile, useSession } from '../../features/01/session';
import { saveStep } from '../../features/01/steps';
import { useLibrarySession } from '../../features/05/library';
import { usePlanScreen, type SubscriptionJson } from '../../features/09/data';
import { requestDataExport, setReaderTheme } from '../../features/10/data';
import { SettingsView, ThemeSheet, type ReaderTheme } from '../../features/10/SettingsViews';

/** The Subscription row's pill; none ("No plan") when there is no plan or it has expired or been refunded. */
function planPill(
  sub: SubscriptionJson | null | undefined,
): { label: string; tone: 'ok' | 'warn' | 'grey' } | null {
  switch (sub?.status) {
    case 'active':
      return { label: 'Active', tone: 'ok' };
    case 'grace':
    case 'billing_retry':
      return { label: 'Payment issue', tone: 'warn' };
    case 'paused':
      return { label: 'Paused', tone: 'grey' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'grey' };
    default:
      return null;
  }
}

// Flow 10 · Settings (s-account) with the App colour sheet (s-theme-settings) over it.
export default function Account() {
  const toast = useToast();
  const session = useSession();
  const uid = session?.user.id;
  const profile = useMyProfile(uid);
  const theme = useUi((st) => st.theme);
  const setTheme = useUi((st) => st.setTheme);
  const [themeOpen, setThemeOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Small facts for row trails; each row works without them (rule 14 "render at once from cache").
  const extra = useQuery({
    queryKey: ['account-extra', uid],
    enabled: !!uid,
    queryFn: async () => {
      const [prof, picks, credits, blocked] = await Promise.all([
        supabase.from('profiles').select('reader_theme').eq('id', uid!).single(),
        supabase.from('user_genres').select('genre_id', { count: 'exact', head: true }),
        supabase.rpc('credit_balance', { p_user: uid! }),
        supabase.rpc('get_blocked'),
      ]);
      return {
        readerTheme: (prof.data?.reader_theme ?? 'light') as ReaderTheme,
        interests: picks.count ?? undefined,
        credits: credits.data ?? undefined,
        blocked: blocked.error ? undefined : (blocked.data ?? []).length,
      };
    },
  });
  const plan = usePlanScreen().data?.subscription;
  const [readerTheme, setLocalReader] = useState<ReaderTheme | null>(null);

  // Reader settings live inside the reader's Aa sheet; no standalone screen exists to open yet.
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
          blocked: extra.data?.blocked,
          subscription: planPill(plan),
          appColour: theme,
          version: Application.nativeApplicationVersion ?? '1.0.0',
        }}
        a={{
          onBack: back,
          onEditProfile: () => router.push('/edit-profile'),
          onNotifications: () => router.push('/notification-settings'),
          onSecurity: () => router.push('/security'),
          onPrivacy: () => router.push('/blocked'),
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
          onDownloads: () => {
            // Downloads are the Library's Offline shelf.
            useLibrarySession.getState().setShelf('offline');
            router.push('/library');
          },
          onCredits: () => router.push('/credits'),
          onSubscription: () => router.push('/plan'),
          onAppColour: () => setThemeOpen(true),
          onInvite: () =>
            void Share.share({ message: 'Read African stories with me on Arpedia: https://arpedia.africa' }),
          onAbout: () => router.push('/about'),
          onLogOut: () => {
            void supabase.auth.signOut({ scope: 'local' }).finally(() => {
              queryClient.clear();
              router.replace('/(auth)/login');
            });
          },
          onExport: () => {
            if (exporting) return;
            setExporting(true);
            requestDataExport()
              .then((r) =>
                toast({
                  message: r.ok
                    ? `We'll email a copy of your data to ${r.email}`
                    : r.error === 'too_soon'
                      ? 'You asked for a copy today. Check your email.'
                      : "Couldn't send that. Try again.",
                }),
              )
              .catch(() => toast({ message: 'No connection. Check your network and try again.' }))
              .finally(() => setExporting(false));
          },
          onDelete: () => router.push('/delete-account'),
        }}
      />
      <ThemeSheet open={themeOpen} value={theme} onPick={pickTheme} onClose={() => setThemeOpen(false)} />
    </Screen>
  );
}
