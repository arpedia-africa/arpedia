import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Screen, useToast } from '@arpedia/ui';
import { payoutRules } from '@arpedia/core';
import { useSession } from '../../../features/01/session';
import { useOnline } from '../../../features/03/book';
import { STUDIO } from '../../../features/11/application';
import { useStudioHome } from '../../../features/11/studio';
import { StudioPayoutView } from '../../../features/11/StudioSettingsViews';
import { useEarningsTrack } from '../../../features/13/analytics';
import { BankSheet } from '../../../features/13/BankSheet';
import { accountLabel, accountStatus, usePayoutAccount } from '../../../features/13/payouts';

/**
 * s-studio-payout: bank, masked account, verified name, payout day, method, minimum (flow 11 rule
 * 29). Account records, verification and the bank change are flow 13 (rules 21–23).
 */
export default function StudioPayout() {
  const toast = useToast();
  const track = useEarningsTrack();
  const online = useOnline();
  const uid = useSession()?.user.id;
  const q = usePayoutAccount(uid);
  // Payout day and minimum follow the server's settings (cached from Studio home).
  const home = useStudioHome(uid);
  const [open, setOpen] = useState(false);
  const a = q.data ?? null;
  useEffect(() => track('payout_account_viewed'), [track]);

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioPayoutView
        account={{
          bank: a ? accountLabel(a.bank_name, a.account_last4) : null,
          name: a ? a.bank_account_name : null,
          status: accountStatus(a),
        }}
        rules={payoutRules(home.data)}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(STUDIO))}
        onChange={() => {
          if (!online) return toast({ message: 'You’re offline. Connect to change your bank account.' });
          setOpen(true);
        }}
      />
      <BankSheet
        open={open}
        uid={uid}
        replacing={!!a}
        offline={!online}
        onClose={() => setOpen(false)}
        onSaved={(auto, bankName) => {
          setOpen(false);
          track('bank_account_submitted', { bank: bankName, auto_verified: auto });
          toast({
            message: auto
              ? 'Account saved and verified. Payouts to it start in 48 hours.'
              : 'Account saved. We’ll check the name and let you know.',
          });
        }}
      />
    </Screen>
  );
}
