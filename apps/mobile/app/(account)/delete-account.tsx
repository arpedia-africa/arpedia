import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { Screen } from '@arpedia/ui';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { wipeReaderData } from '../../features/04/bookfiles';
import { usePlanScreen } from '../../features/09/data';
import { useTrack } from '../../features/10/analytics';
import { requestDeletion, rpcReason, useProfileSummary } from '../../features/10/data';
import { DeleteAccountFoot, DeleteAccountView } from '../../features/10/SettingsViews';

// Flow 10 · Delete account (s-delete-account, rules 34–37; Q3: immediate, erased within 7 days).
export default function DeleteAccount() {
  const { isConnected } = useNetInfo();
  const offline = isConnected === false;
  const summary = useProfileSummary();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const track = useTrack();
  useEffect(() => track('delete_account_started'), [track]);
  const keep = () => {
    track('delete_account_cancelled');
    router.back();
  };
  // Live credit number for the first line (rule 34).
  const credits = useQuery({
    queryKey: ['delete-credits'],
    staleTime: 0,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error: e } = await supabase.rpc('credit_balance', { p_user: u.user!.id });
      if (e) throw e;
      return data;
    },
  });

  // A Google Play plan keeps billing after the account is gone unless it is cancelled in Play (rule 34).
  const sub = usePlanScreen().data?.subscription;
  const storePlan =
    sub?.store === 'play' && sub.auto_renew && !['cancelled', 'expired', 'refunded'].includes(sub.status)
      ? sub.plan.name
      : null;

  const del = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await requestDeletion(text);
      track('delete_account_confirmed');
      // Every session is already ended on the server; clear this phone and go to Log in.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      queryClient.clear();
      await wipeReaderData();
      router.replace({ pathname: '/(auth)/login', params: { deleted: '1' } });
    } catch (e) {
      setError(
        rpcReason(e) === 'earnings_waiting'
          ? "You have earnings waiting. We'll delete your account after your next payout."
          : "Couldn't delete your account. Try again or contact support.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <DeleteAccountFoot
          text={text}
          busy={busy}
          offline={offline}
          error={offline ? 'Connect to the internet to do this.' : error}
          onDelete={() => void del()}
          onKeep={keep}
        />
      }
    >
      <DeleteAccountView
        facts={{
          credits: credits.data,
          finished: summary.data?.books_read,
          highlights: summary.data?.highlights,
          storePlan,
        }}
        text={text}
        onText={setText}
        onBack={keep}
        onOpenPlay={() => void Linking.openURL('https://play.google.com/store/account/subscriptions')}
      />
    </Screen>
  );
}
