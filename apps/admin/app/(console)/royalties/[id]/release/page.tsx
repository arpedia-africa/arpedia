import { avClass, initials } from '@/lib/money';
import { partPlan } from '@/lib/partial-release';
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
  // After a partial release, what is left payable is approved, not sent (13-12): only that is sent now.
  const rest = c.status === 'releasing' && g.sendable.length > 0;
  const unverified = rest ? [] : g.held.filter(l => l.status === 'held_unverified');
  const payable = [...g.sendable, ...unverified];
  const allKobo = sum(g.sendable, l => l.payable_kobo);
  const balance = (await flutterwaveBalance()) ?? (rest ? null : (c.checks?.flutterwave_balance_kobo ?? null));
  // Balance short: send whole lines, smallest first, up to the balance; the rest waits for a top-up.
  const short = balance != null && balance < allKobo;
  const plan = partPlan(g.sendable, short ? balance : null);
  const blocked =
    staff.role !== 'super_admin'
      ? 'Only a Super admin can approve and release payouts.'
      : c.prepared_by === staff.id
        ? 'You prepared this release, so another Super admin must approve it.'
        : c.status !== 'prepared' && c.status !== 'approved' && !rest
          ? c.status === 'closed'
            ? 'Prepare this month before releasing it.'
            : 'This month was already released.'
          : !past(c.hold_ends_at)
            ? "The hold hasn't ended yet."
            : rest && balance == null
              ? "The Flutterwave balance couldn't be read, so the rest can't be sent yet. Try again in a minute."
              : short && plan.send.length === 0
                ? "The Flutterwave balance doesn't cover any author's amount. Top it up first."
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
        sendKobo={plan.sendKobo}
        sendAuthors={plan.send.length}
        leftKobo={plan.leftKobo}
        leftAuthors={plan.left.length}
        budgetKobo={short || rest ? balance : null}
        rest={rest}
        balanceKobo={balance}
        carried={rest ? 0 : g.carried.length}
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
