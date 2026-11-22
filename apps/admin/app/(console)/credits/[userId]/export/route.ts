import { ledgerDate } from '@arpedia/core';
import { canOpen } from '@/lib/nav';
import { getStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { refOf, typeLabel, userCode } from '../labels';

const cell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  // Quote anything with a comma, quote or line break; keep spreadsheet formulas from running.
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** Export ledger (rule 29): every ledger row of the reader as a CSV, oldest first. */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const staff = await getStaff();
  if (!staff || !staff.mfaOk || !canOpen('credits', staff.permissions)) {
    return new Response('You do not have access to this ledger.', { status: 403 });
  }
  const supabase = await serverSupabase();
  const lines = ['Date,Type,Reference,Credits,Balance,Bucket,Staff,Note'];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase
      .from('credit_ledger')
      .select('id, created_at, reason, delta, bucket, txn_id, ref_id, actor_id, note, balance_after')
      .eq('user_id', userId)
      .order('created_at')
      .order('id')
      .range(from, from + 999);
    if (error) return new Response('The ledger did not load. Try again.', { status: 500 });
    for (const r of data) {
      lines.push(
        [
          ledgerDate(r.created_at),
          typeLabel(r.reason, !!r.actor_id),
          refOf(r),
          r.delta,
          r.balance_after,
          r.bucket,
          r.actor_id ? 'Yes' : '',
          r.note,
        ]
          .map(cell)
          .join(','),
      );
    }
    if (data.length < 1000) break;
  }
  // A byte order mark so Excel opens the ₦ and accents correctly.
  const bom = String.fromCharCode(0xfeff);
  return new Response(`${bom}${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ledger-${userCode(userId)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
