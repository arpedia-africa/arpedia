import { NextResponse, type NextRequest } from 'next/server';
import { PREVIEW_COOKIE, PREVIEW_MAX_AGE, previewRoleOf } from '@/lib/preview-as';
import { getStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

/**
 * Preview as (spec check 16-25): `?role=publisher|moderator|finance` starts a preview (audited by
 * staff_preview_as), `?role=super_admin` ends it. Super admins who passed two-step only. Plain
 * links, never prefetched, so every audit line is a real click.
 */
export async function GET(req: NextRequest) {
  const staff = await getStaff();
  if (!staff || !staff.mfaOk || staff.role !== 'super_admin') return new NextResponse('Not allowed', { status: 403 });
  const home = new URL('/', req.nextUrl);
  const asked = req.nextUrl.searchParams.get('role') ?? '';
  const role = previewRoleOf(staff.role, asked);
  const res = NextResponse.redirect(home, 303);
  if (!role) {
    res.cookies.delete(PREVIEW_COOKIE);
    return res;
  }
  const supabase = await serverSupabase();
  const { error } = await supabase.rpc('staff_preview_as', { p_role: role });
  if (error) return new NextResponse("Couldn't start the preview. Try again.", { status: 500 });
  res.cookies.set(PREVIEW_COOKIE, role, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: PREVIEW_MAX_AGE,
  });
  return res;
}
