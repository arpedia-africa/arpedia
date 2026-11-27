import { useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Screen, useToast } from '@arpedia/ui';
import { useTrack } from '../../features/10/analytics';
import { useNotifPrefs, useSetNotifPref } from '../../features/10/data';
import { NotifPrefsView } from '../../features/10/SettingsViews';
import { useTrack as useEngageTrack } from '../../features/15/analytics';
import { pushEnabled } from '../../features/15/push';

// Flow 10 · Notification preferences (s-notif-prefs, rules 19–23). Toggles save on tap.
export default function NotificationSettings() {
  const toast = useToast();
  const track = useTrack();
  const track15 = useEngageTrack();
  const prefs = useNotifPrefs();
  const setPref = useSetNotifPref();
  const [phoneOff, setPhoneOff] = useState(false);

  // Rule 22: banner while the phone blocks notifications; re-checked when the reader comes back.
  useEffect(() => {
    const check = () =>
      void Notifications.getPermissionsAsync()
        .then((p) => setPhoneOff(!p.granted && !p.canAskAgain))
        .catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => sub.remove();
  }, []);

  return (
    <Screen top="org">
      <NotifPrefsView
        prefs={prefs.data}
        phoneOff={phoneOff}
        noPush={!pushEnabled}
        onBack={() => router.back()}
        onFeed={() => router.push('/notifications')}
        onOpenSettings={() => void Linking.openSettings()}
        onToggle={(k, v) =>
          setPref.mutate(
            { k, v },
            {
              onSuccess: () => {
                track('notif_pref_changed', { key: k, value: v });
                // Flow 15 names the same change for analytics_daily.
                if (k === 'quiet_enabled') track15('quiet_hours_changed', { value: v });
                else track15('notif_prefs_changed', { field: k, value: v });
              },
              onError: () => toast({ message: "Couldn't save that. Try again." }),
            },
          )
        }
      />
    </Screen>
  );
}
