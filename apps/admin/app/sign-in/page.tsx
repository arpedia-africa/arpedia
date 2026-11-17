import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in · Arpedia Admin' };

const envLabel = (env?: string) => (env === 'production' ? 'Production' : env === 'staging' ? 'Staging' : 'Local');

/**
 * Staff sign in: the s-signin markup inside the prototype's full-screen console frame
 * (.console.is-full hides the sidebar and top bar). Two-step comes in flow 16.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="console is-full">
      <div className="workspace">
        <main className="view">
          <section className="screen">
            <div className="auth">
              <div className="auth__art">
                <div className="row">
                  <img src="/brand/mark.png" width={40} height={40} alt="" />
                  <span className="wmk wmk--night" role="img" aria-label="arpedia" style={{ height: 30 }} />
                </div>
                <div className="stack s16">
                  <h1>Run the reading room.</h1>
                  <p>Books, people, safety and money for Arpedia, in one place. Staff accounts only.</p>
                </div>
                <p style={{ fontSize: 13 }}>admin.arpedia.africa · {envLabel(process.env.NEXT_PUBLIC_APP_ENV)}</p>
              </div>
              <div className="auth__form">
                <SignInForm oauthError={error === 'google' || error === 'refused' ? error : undefined} />
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
