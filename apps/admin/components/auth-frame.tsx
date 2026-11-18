import type { ReactNode } from 'react';

const envLabel = (env?: string) => (env === 'production' ? 'Production' : env === 'staging' ? 'Staging' : 'Local');

/**
 * The full-screen sign-in frame shared by s-signin, s-signin-2fa and s-signin-reset: the prototype's
 * .console.is-full (no sidebar or top bar) around .auth with its orange art panel and the form side.
 */
export function AuthFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
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
                  <h1>{title}</h1>
                  <p>{lead}</p>
                </div>
                <p style={{ fontSize: 13 }}>admin.arpedia.africa · {envLabel(process.env.NEXT_PUBLIC_APP_ENV)}</p>
              </div>
              <div className="auth__form">{children}</div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
