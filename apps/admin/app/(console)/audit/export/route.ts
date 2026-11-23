import { NextResponse, type NextRequest } from 'next/server';
import { canOpen } from '@/lib/nav';
import { getStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { readFilters, rpcArgs, type AuditPage } from '../shared';

const MAX_ROWS = 10_000;

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote everything; a leading = + - @ is neutralised so spreadsheets never run it as a formula.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Export the filtered audit log as CSV (up to 10,000 rows). The export itself is audited. */
export async function GET(req: NextRequest) {
  const staff = await getStaff();
  if (!staff || !staff.mfaOk || !canOpen('audit', staff.permissions))
    return new NextResponse('Not allowed', { status: 403 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const f = { ...readFilters(sp), per: 50 };
  const now = Date.now();
  const supabase = await serverSupabase();
  const rows: AuditPage['rows'] = [];
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const { data, error } = await supabase.rpc('list_audit', rpcArgs({ ...f, page }, now));
    if (error) return new NextResponse("Couldn't export the log. Try again.", { status: 500 });
    const list = data as unknown as AuditPage;
    rows.push(...list.rows);
    if (list.rows.length < f.per) break;
  }
  const { error: noted } = await supabase.rpc('note_audit_export', {
    p_filters: { q: f.q, actor: f.actor, area: f.area, action: f.action, days: f.days },
    p_rows: rows.length,
  });
  if (noted) return new NextResponse("Couldn't export the log. Try again.", { status: 500 });
  const head = ['id', 'at', 'staff', 'role', 'area', 'action', 'object_type', 'object_id', 'object', 'details', 'ip'];
  const body = rows.map(r =>
    [r.id, r.at, r.actor_name, r.actor_role, r.area, r.action, r.object_type, r.object_id, r.object_label, r.summary, r.ip]
      .map(cell)
      .join(','),
  );
  const csv = [head.join(','), ...body].join('\r\n');
  const day = new Date(now + 3_600_000).toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="arpedia-audit-${day}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
