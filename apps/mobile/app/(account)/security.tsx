import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { Screen, useToast } from '@arpedia/ui';
import { dateLabel, validPassword } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { useSession } from '../../features/01/session';
import { changePassword, removeDevice, useMyDevices } from '../../features/10/data';
import { PasswordSheet, SecurityView } from '../../features/10/SettingsViews';

// Flow 10 · Security (s-security, rules 29–32).
export default function Security() {
  const toast = useToast();
  const { isConnected } = useNetInfo();
  const offline = isConnected === false;
  const session = useSession();
  const user = session?.user;
  const devices = useMyDevices();
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwErr, setPwErr] = useState<{ current?: string; next?: string; form?: string }>({});
  const [pwBusy, setPwBusy] = useState(false);

  const providers = (user?.app_metadata.providers as string[] | undefined) ?? [];
  const hasPassword = providers.includes('email') || (!providers.length && !!user?.email);

  const savePassword = async () => {
    if (!validPassword(pw.next)) return setPwErr({ next: 'Use at least 8 characters.' });
    if (!pw.current) return setPwErr({ current: 'Enter your current password.' });
    setPwBusy(true);
    try {
      const r = await changePassword(pw.current, pw.next);
      if (r === 'ok') {
        setPwOpen(false);
        setPw({ current: '', next: '' });
        toast({ message: 'Password changed. Your other devices are signed out.' });
        void devices.refetch();
      } else if (r === 'wrong_password') setPwErr({ current: 'That password is not right.' });
      else if (r === 'weak_password') setPwErr({ next: 'Use at least 8 characters.' });
      else if (r === 'rate_limited') setPwErr({ form: 'Too many tries. Try again in 15 minutes.' });
      else setPwErr({ form: "Couldn't change your password. Try again." });
    } catch {
      setPwErr({ form: 'No connection. Check your network and try again.' });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <Screen top="org">
      <SecurityView
        d={{
          email: user?.email ?? '',
          emailVerified: !!user?.email_confirmed_at,
          google: providers.includes('google'),
          hasPassword,
          enabled: devices.data?.enabled,
          devices: devices.data?.devices,
        }}
        dateLabel={(iso) => dateLabel(iso)}
        offline={offline}
        onBack={() => router.back()}
        onVerify={() =>
          void supabase.auth
            .resend({ type: 'signup', email: user?.email ?? '' })
            .then(({ error }) =>
              toast({ message: error ? "Couldn't send it. Try again." : 'Check your email for the link.' }),
            )
        }
        onGoogle={() =>
          void supabase.auth
            .linkIdentity({ provider: 'google' })
            .then(({ error }) => error && toast({ message: "Couldn't connect Google. Try again." }))
        }
        onChangePassword={() => {
          setPwErr({});
          setPwOpen(true);
        }}
        onRemove={(dev) =>
          Alert.alert(
            `Remove ${dev.model ?? 'this device'}?`,
            'It will be signed out within a minute and its downloaded books will stop opening.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () =>
                  void removeDevice(dev.id)
                    .then(() => toast({ message: `${dev.model ?? 'Device'} removed` }))
                    .catch(() => toast({ message: "Couldn't remove it. Try again." })),
              },
            ],
          )
        }
      />
      <PasswordSheet
        open={pwOpen}
        values={pw}
        errors={pwErr}
        saving={pwBusy}
        onChange={(v) => {
          setPw(v);
          setPwErr({});
        }}
        onClose={() => setPwOpen(false)}
        onSave={() => void savePassword()}
      />
    </Screen>
  );
}
