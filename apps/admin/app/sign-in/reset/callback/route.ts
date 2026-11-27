import { NextResponse, type NextRequest } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';

/** The reset link lands here: swap its code for a session, then choose a new password. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  if (!code) return to('/sign-in/reset?error=expired');
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return to('/sign-in/reset?error=expired');
  // Staff links live 30 minutes (rule 7); Supabase's own limit is the readers' 60.
  const { data: fresh } = await supabase.rpc('staff_reset_link_fresh');
  if (fresh !== true) {
    await supabase.auth.signOut({ scope: 'local' });
    return to('/sign-in/reset?error=expired');
  }
  return to('/sign-in/new-password');
}
