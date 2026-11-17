import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';
import styles from './sign-in.module.css';

export const metadata: Metadata = { title: 'Sign in · Arpedia Admin' };

const envLabel = (env?: string) => (env === 'production' ? 'Production' : env === 'staging' ? 'Staging' : 'Local');

/** Staff sign in (admin prototype s-signin). Two-step comes in flow 16. */
export default function SignInPage() {
  return (
    <div className={styles.auth}>
      <div className={styles.art}>
        <span className="petals" style={{ right: -160, bottom: -160, width: 520, height: 520, opacity: 0.6 }} aria-hidden="true" />
        <div className={styles.row}>
          <img src="/brand/mark.png" width={40} height={40} alt="" />
          <span className={styles.wordmark} role="img" aria-label="arpedia" />
        </div>
        <div className={styles.stack16}>
          <h1>Run the reading room.</h1>
          <p>Books, people, safety and money for Arpedia, in one place. Staff accounts only.</p>
        </div>
        <p>admin.arpedia.africa · {envLabel(process.env.NEXT_PUBLIC_APP_ENV)}</p>
      </div>
      <div className={styles.form}>
        <SignInForm />
      </div>
    </div>
  );
}
