'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Icon } from '@/components/icon';
import { signIn, signInWithGoogle, type SignInState } from './actions';

const OAUTH_ERRORS = {
  google: 'Google sign-in didn’t work. Try again, or use your email and password.',
  refused: 'That Google account isn’t a staff account. Use your @arpedia.africa account.',
} as const;

/** s-signin form: same markup as admin/src/10-access-overview.html. */
export function SignInForm({ oauthError }: { oauthError?: keyof typeof OAUTH_ERRORS }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [show, setShow] = useState(false);
  const error = state.error ?? (oauthError ? OAUTH_ERRORS[oauthError] : undefined);
  return (
    <form className="auth__card" action={action} noValidate>
      <div className="stack s4">
        <h2>Staff sign in</h2>
        <p className="muted">Use the email your invite was sent to.</p>
      </div>
      {error ? (
        <div className="note err" role="alert" id="si-err">
          <span className="grow">{error}</span>
        </div>
      ) : null}
      <div className="f">
        <label htmlFor="si-e">Work email</label>
        <div className={state.error ? 'inp error' : 'inp'}>
          <input
            id="si-e"
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={state.email}
            required
            aria-invalid={!!state.error}
            aria-describedby={error ? 'si-err' : undefined}
          />
        </div>
      </div>
      <div className="f">
        <label htmlFor="si-p">Password</label>
        <div className={state.error ? 'inp error' : 'inp'}>
          <input id="si-p" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required />
          {/* The prototype draws a bare icon here; the button only resets browser defaults around it. */}
          <button
            type="button"
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            style={{ display: 'grid', padding: 0, border: 0, background: 'none', cursor: 'pointer' }}
            onClick={() => setShow(v => !v)}
          >
            <Icon name="eye" size="s" className="faint" />
          </button>
        </div>
        <Link className="link" href="/sign-in/reset" style={{ fontSize: 13, alignSelf: 'flex-end' }}>
          Forgot password?
        </Link>
      </div>
      <button type="submit" className="btn btn-p lg block" disabled={pending} aria-busy={pending}>
        {pending ? 'Signing in…' : 'Continue'}
      </button>
      <div className="row" style={{ gap: 12, color: 'var(--ink-3)', fontSize: 12.5 }}>
        <span className="hr grow" />
        or
        <span className="hr grow" />
      </div>
      <button type="submit" formAction={signInWithGoogle} formNoValidate className="btn btn-g lg block">
        <Icon name="g" />
        Continue with Google
      </button>
      <p className="hint">Google sign-in works only for @arpedia.africa accounts. Lost access? Ask a super admin to reset your account.</p>
    </form>
  );
}
