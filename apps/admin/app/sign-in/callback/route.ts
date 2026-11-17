import { NextResponse, type NextRequest } from 'next/server';
import { getStaff, STAFF_DOMAIN } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

/**
 * Google sign-in lands here. Only @arpedia.africa accounts with an active staff role get in;
 * anyone else is signed straight out with the same refusal as a wrong password.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  if (!code) return to('/sign-in?error=google');

  const supabase = await serverSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to('/sign-in?error=google');

  const email = data.user?.email?.toLowerCase() ?? '';
  if (!email.endsWith(`@${STAFF_DOMAIN}`) || !(await getStaff())) {
    await supabase.auth.signOut();
    return to('/sign-in?error=refused');
  }
  return to('/');
}
