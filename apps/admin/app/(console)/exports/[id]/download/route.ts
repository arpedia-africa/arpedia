import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';

/** Download: the api Worker checks creator or Super admin, two-step and expiry, then streams the CSV. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const supabase = await serverSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return NextResponse.redirect(new URL('/sign-in', _req.url));
  const r = await fetch(`${process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787'}/v1/engage/exports/${id}/download`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  }).catch(() => null);
  if (!r || !r.ok) {
    const msg = r?.status === 404 ? 'This file has expired. Build it again.' : "The file didn't download. Try again.";
    return NextResponse.redirect(new URL(`/exports?done=${encodeURIComponent(msg)}`, _req.url));
  }
  return new Response(r.body, {
    headers: {
      'Content-Type': r.headers.get('Content-Type') ?? 'text/csv; charset=utf-8',
      'Content-Disposition': r.headers.get('Content-Disposition') ?? 'attachment',
      'Cache-Control': 'private, no-store',
    },
  });
}
