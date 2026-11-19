import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieOptions, TRUST_COOKIE } from '@/lib/supabase/cookies';

/** Pages a signed-out visitor may open. */
const PUBLIC = ['/sign-in', '/invite'];

// Refreshes the Supabase session cookie on every request and sends signed-out visitors to sign in.
// The staff role and two-step are checked in the console layout (server side), not here.
export async function proxy(request: NextRequest) {
  const trusted = request.cookies.get(TRUST_COOKIE)?.value === '1';
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: list => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, sessionCookieOptions(options, trusted)),
          );
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC.some(p => path === p || path.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
