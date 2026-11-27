import { useState } from 'react';
import { Share, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Application from 'expo-application';
import type { ReaderSettings } from '@arpedia/reader';
import { Btn, Screen, Sheet, Text, useTheme, useToast, type ThemeName } from '@arpedia/ui';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { useUi } from '@/lib/ui-store';
import { signOutHere, useMyProfile, useSession } from '../../features/01/session';
import { saveStep } from '../../features/01/steps';
import { queuedAnnotations } from '../../features/04/annotationQueue';
import { SettingsSheet } from '../../features/04/ReaderSheets';
import { settingValue, toSettings } from '../../features/04/state';
import { useLibrarySession } from '../../features/05/library';
import { usePlanScreen, type SubscriptionJson } from '../../features/09/data';
import { useTrack, type Track } from '../../features/10/analytics';
import { requestDataExport, setReaderTheme } from '../../features/10/data';
import {
  SettingsView,
  ThemeSheet,
  type ReaderTheme,
  type SettingsActions,
} from '../../features/10/SettingsViews';

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

/** settings_row_tapped {row} for every Settings action (row = the handler name without "on"). */
function rowTaps(track: Track, a: SettingsActions): SettingsActions {
  const out: Record<string, unknown> = {};
  for (const [k, fn] of Object.entries(a) as [string, (...args: unknown[]) => unknown][])
    out[k] = (...args: unknown[]) => {
      if (k !== 'onBack') track('settings_row_tapped', { row: k.replace(/^on/, '') });
      return fn(...args);
    };
  return out as unknown as SettingsActions;
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
  const [navOpen, setNavOpen] = useState(false);
  const [logOutAsk, setLogOutAsk] = useState(false);
  const [nav, setNav] = useState<ReaderSettings | null>(null);
  const { s } = useTheme();
  const track = useTrack();

  // Small facts for row trails; each row works without them (rule 14 "render at once from cache").
  const extra = useQuery({
    queryKey: ['account-extra', uid],
    enabled: !!uid,
    queryFn: async () => {
      const [prof, picks, credits, blocked] = await Promise.all([
        supabase.from('profiles').select('reader_theme, reader_settings').eq('id', uid!).single(),
        supabase.from('user_genres').select('genre_id', { count: 'exact', head: true }),
        supabase.rpc('credit_balance', { p_user: uid! }),
        supabase.rpc('get_blocked'),
      ]);
      return {
        readerTheme: (prof.data?.reader_theme ?? 'light') as ReaderTheme,
        readerSettings: toSettings(prof.data?.reader_settings as Record<string, unknown> | null),
        interests: picks.count ?? undefined,
        credits: credits.data ?? undefined,
        blocked: blocked.error ? undefined : (blocked.data ?? []).length,
      };
    },
  });
  const plan = usePlanScreen().data?.subscription;
  const [readerTheme, setLocalReader] = useState<ReaderTheme | null>(null);

  // Navigation (rule 14) opens the reader's own settings sheet (flow 04); changes save to
  // profiles.reader_settings, which every book reads on open.
  const readerSettings = nav ?? extra.data?.readerSettings ?? toSettings(null);
  const changeSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    const before = readerSettings;
    setNav({ ...readerSettings, [key]: value });
    void supabase
      .rpc('set_reader_setting', { p_key: key, p_value: settingValue(key, value) as never })
      .then(({ error }) => {
        if (!error) return;
        setNav(before);
        toast({ message: "Couldn't save that. Try again." });
      });
  };
  // Rule 17: no confirmation unless a download or a sync is still running.
  const logOut = () => void signOutHere().finally(() => router.replace('/(auth)/login'));
  const askLogOut = async () => {
    const downloading = Object.keys(useLibrarySession.getState().downloads).length > 0;
    const unsynced = uid ? (await queuedAnnotations(uid).catch(() => [])).length > 0 : false;
    if (downloading || unsynced) setLogOutAsk(true);
    else logOut();
  };
  const pickTheme = (t: ThemeName) => {
    // Recolours at once, kept on the phone first; saved to profiles.theme when online (rule 18).
    setTheme(t);
    track('theme_changed', { theme: t, source: 'app' });
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
          navigation: readerSettings.layout === 'scroll' ? 'Scroll' : 'Swipe pages',
        }}
        a={rowTaps(track, {
          onBack: back,
          onEditProfile: () => router.push('/edit-profile'),
          onNotifications: () => router.push('/notification-settings'),
          onSecurity: () => router.push('/security'),
          onPrivacy: () => router.push('/blocked'),
          onPreferences: () => router.push('/(onboarding)/interests'),
          onNavigation: () => setNavOpen(true),
          onReaderTheme: (t) => {
            if (!uid) return;
            const before = readerTheme ?? extra.data?.readerTheme ?? 'light';
            setLocalReader(t);
            track('theme_changed', { theme: t, source: 'reader' });
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
            void Share.share({
              message: 'Read African stories with me on Arpedia: https://arpedia.africa',
            }).then(
              (res) => res.action === Share.sharedAction && track('invite_shared'),
              () => undefined,
            ),
          onAbout: () => router.push('/about'),
          onLogOut: () => void askLogOut(),
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
        })}
      />
      <ThemeSheet open={themeOpen} value={theme} onPick={pickTheme} onClose={() => setThemeOpen(false)} />
      <SettingsSheet
        open={navOpen}
        onClose={() => setNavOpen(false)}
        settings={readerSettings}
        onChange={changeSetting}
      />
      <Sheet open={logOutAsk} onClose={() => setLogOutAsk(false)} title="Log out anyway?">
        <Text variant="sm" color="ink2">
          Sync not finished. A download or notes on this phone haven’t finished saving, and logging out now
          may lose them.
        </Text>
        <View style={{ gap: s(8) }}>
          <Btn
            label="Log out anyway"
            variant="x"
            block
            onPress={() => {
              setLogOutAsk(false);
              logOut();
            }}
          />
          <Btn label="Cancel" variant="g" block onPress={() => setLogOutAsk(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
