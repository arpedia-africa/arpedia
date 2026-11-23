import { avClass, initials } from '@/lib/money';
import { flutterwaveBalance } from '../../actions';
import { dayTime, monthLabel, past } from '../../shared';
import { credits, groups, nextMonth, sum } from '../data';
import { CycleScreen, cycleFor } from '../screen';
import { ReleaseModal } from './client';

/** s-royalty-release, drawn over the month (Super admin, not the preparer). */
export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const r = await cycleFor((await params).id);
  if ('page' in r) return r.page;
  const { c, staff } = r;
  const g = groups(c.lines);
  const unverified = g.held.filter(l => l.status === 'held_unverified');
  const payable = [...g.sendable, ...unverified];
  const sendKobo = sum(g.sendable, l => l.payable_kobo);
  const balance = (await flutterwaveBalance()) ?? c.checks?.flutterwave_balance_kobo ?? null;
  const blocked =
    staff.role !== 'super_admin'
      ? 'Only a Super admin can approve and release payouts.'
      : c.prepared_by === staff.id
        ? 'You prepared this release, so another Super admin must approve it.'
        : c.status !== 'prepared' && c.status !== 'approved'
          ? c.status === 'closed'
            ? 'Prepare this month before releasing it.'
            : 'This month was already released.'
          : !past(c.hold_ends_at)
            ? "The hold hasn't ended yet."
            : balance != null && balance < sendKobo
              ? 'The Flutterwave balance is below the amount to send. Top it up first.'
              : null;
  const preparer = c.prepared_name ?? 'Finance';

  return (
    <>
      <CycleScreen c={c} staff={staff} />
      <ReleaseModal
        id={c.id}
        title={monthLabel(c.month)}
        month={monthLabel(c.month, { bare: true })}
        next={monthLabel(nextMonth(c.month), { bare: true })}
        payableKobo={sum(payable, l => l.payable_kobo)}
        payableAuthors={payable.length}
        payableCredits={sum(payable, credits)}
        rate={`₦${(c.author_rate_kobo / 100).toFixed(2)}`}
        heldKobo={sum(unverified, l => l.payable_kobo)}
        held={unverified.map(l => ({
          name: l.name,
          kobo: l.payable_kobo,
          href: l.bank_status === 'needs_review' && l.bank_account_id ? `/bank-accounts/${l.bank_account_id}` : '/bank-accounts',
        }))}
        sendKobo={sendKobo}
        sendAuthors={g.sendable.length}
        balanceKobo={balance}
        carried={g.carried.length}
        preparer={{
          name: preparer,
          initials: initials(preparer),
          av: avClass(c.prepared_by ?? 'finance'),
          at: c.prepared_at ? dayTime(c.prepared_at) : '',
        }}
        me={{ name: staff.name, initials: initials(staff.name), av: avClass(staff.id) }}
        blocked={blocked}
      />
    </>
  );
}
