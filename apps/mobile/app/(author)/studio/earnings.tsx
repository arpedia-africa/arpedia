import { useEffect } from 'react';
import { router } from 'expo-router';
import { Screen, type KeyValueRow } from '@arpedia/ui';
import { formatKobo } from '@arpedia/core';
import { isNetworkError, useSession } from '../../../features/01/session';
import { useTrack } from '../../../features/11/analytics';
import { monthName, num, payoutOf, useStudioEarnings, type AuthorMonth } from '../../../features/11/studio';
import { StudioEarningsView, type PayoutRow } from '../../../features/11/StudioViews';
import { updatedAgo, useOnline } from '../../../features/09/data';
import { useEarningsTrack } from '../../../features/13/analytics';
import {
  accountLabel,
  lineStatus,
  usePayoutAccount,
  usePayoutLines,
  type PayoutAccount,
  type PayoutLine,
} from '../../../features/13/payouts';

/** s-studio-royalties: this month split into Unlock all and Pay as you read, payout history (rule 27). */
export default function StudioEarnings() {
  const track = useTrack();
  const uid = useSession()?.user.id;
  const trackEarnings = useEarningsTrack();
  const q = useStudioEarnings(uid);
  const lines = usePayoutLines(uid);
  const account = usePayoutAccount(uid);
  const online = useOnline();
  useEffect(() => {
    track('studio_earnings_viewed');
    trackEarnings('earnings_viewed');
  }, [track, trackEarnings]);
  const d = q.data;
  const toRow = (m: AuthorMonth) => {
    const line = lines.data?.get(m.month.slice(0, 7));
    return line ? lineRow(m, line, account.data ?? null) : payoutRow(m, account.data ?? null);
  };
  // Offline: the last cached figures with when they were fetched (flow 13 Offline). With nothing
  // cached the query pauses rather than fails, so offline is decided by the connection too.
  const state = d
    ? 'ready'
    : !online || (q.isError && isNetworkError(q.error))
      ? 'offline'
      : q.isError
        ? 'failed'
        : 'loading';
  const offlineNote = d && !online ? `You’re offline. ${updatedAgo(q.dataUpdatedAt)}.` : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/studio'));

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioEarningsView
        sub={d ? `${monthName(d.month.month)} · paid after a 30-day hold` : 'Paid after a 30-day hold'}
        total={d ? formatKobo(d.month.earned_kobo) : ''}
        rows={d ? splitRows(d.month) : []}
        payouts={d ? d.history.filter((m) => m.earned_kobo > 0).map(toRow) : []}
        state={state}
        offlineNote={offlineNote}
        onBack={back}
        onRetry={() => void q.refetch()}
      />
    </Screen>
  );
}

function splitRows(m: AuthorMonth): KeyValueRow[] {
  const rows: KeyValueRow[] = [
    { k: `Unlock all · ${num(m.unlock_all_credits)} credits`, v: formatKobo(m.unlock_all_kobo) },
    { k: `Pay as you read · ${num(m.paygo_credits)} credits`, v: formatKobo(m.paygo_kobo) },
  ];
  if (m.tips_credits) {
    rows.push({ k: `Tips and messages · ${num(m.tips_credits)} credits`, v: formatKobo(m.tips_kobo) });
  }
  if (m.refund_kobo) rows.push({ k: 'Refunds', v: formatKobo(m.refund_kobo) });
  rows.push({ k: `${num(m.credits)} credits × ₦1.60`, v: formatKobo(m.earned_kobo), total: true });
  return rows;
}

/**
 * A closed month: its payout line decides the status (flow 13 rule 28). The amount stays what the
 * month earned, the same figure admin shows for this author and month (rule 29).
 */
function lineRow(m: AuthorMonth, line: PayoutLine, account: PayoutAccount | null): PayoutRow {
  const st = lineStatus(line, account);
  return { month: monthName(m.month), sub: st.sub, amount: formatKobo(m.earned_kobo), pill: st.pill };
}

/** A month not closed yet: the date decides. */
function payoutRow(m: AuthorMonth, account: PayoutAccount | null): PayoutRow {
  const p = payoutOf(m);
  const to = account
    ? `To ${accountLabel(account.bank_name, account.account_last4)}`
    : 'Payout account not set up yet';
  const pill = p.below
    ? { label: 'Carries over', tone: 'grey' as const }
    : p.due
      ? { label: `Due ${p.label}`, tone: 'grey' as const }
      : { label: `Releases ${p.label}`, tone: 'warn' as const };
  return {
    month: monthName(m.month),
    sub: p.below ? 'Under the ₦1,000 minimum' : p.due ? `Payout day ${p.label}` : to,
    amount: formatKobo(m.earned_kobo),
    pill,
  };
}
