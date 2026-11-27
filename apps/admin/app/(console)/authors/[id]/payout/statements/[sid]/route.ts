import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';

const UUID = /^[0-9a-f-]{36}$/i;

/** Statement PDF: the api Worker checks the staff role (Finance, Support, Super admin) and streams it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  if (!UUID.test(id) || !UUID.test(sid)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.redirect(new URL('/sign-in', req.url));
  const r = await fetch(`${process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787'}/v1/earnings/statements/${sid}/download`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  }).catch(() => null);
  if (!r || !r.ok) return NextResponse.redirect(new URL(`/authors/${id}/payout?statement=failed`, req.url));
  return new Response(r.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': r.headers.get('Content-Disposition') ?? 'attachment; filename="arpedia-statement.pdf"',
      'Cache-Control': 'private, no-store',
    },
  });
}
