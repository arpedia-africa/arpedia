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
  const staff = email.endsWith(`@${STAFF_DOMAIN}`) ? await getStaff() : null;
  if (!staff) {
    // `local` drops the session cookies before the network call, so a refused account never keeps one.
    await supabase.auth.signOut({ scope: 'local' });
    return to('/sign-in?error=refused');
  }
  // Google sign-in still goes through two-step (rule 3).
  return to(staff.mfaEnrolled ? '/sign-in/two-step' : '/sign-in/two-step/setup');
}
