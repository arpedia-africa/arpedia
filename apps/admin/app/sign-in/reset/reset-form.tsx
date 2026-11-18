'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { sendReset, type ResetState } from './actions';

/** s-signin-reset form: same markup as the prototype. */
export function ResetForm({ expired }: { expired?: boolean }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(sendReset, {});
  return (
    <form className="auth__card" action={action} noValidate>
      <Link className="link" href="/sign-in">
        Back to sign in
      </Link>
      <div className="stack s4">
        <h2>Reset password</h2>
        <p className="muted">Enter your work email.</p>
      </div>
      {expired && !state.sentTo ? (
        <div className="note err" role="alert">
          <span className="grow">
            <b>That link has expired or was already used</b>Ask for a new one below.
          </span>
        </div>
      ) : null}
      <div className="f">
        <label htmlFor="rs-e">Work email</label>
        <div className={state.error ? 'inp error' : 'inp'}>
          <input id="rs-e" name="email" type="email" autoComplete="username" required aria-invalid={!!state.error} />
        </div>
        {state.error ? <p className="hint err">{state.error}</p> : null}
      </div>
      <button type="submit" className="btn btn-p lg block" disabled={pending} aria-busy={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
      {state.sentTo ? (
        <div className="note ok" role="status">
          <span className="grow">
            <b>Check your inbox</b>If {state.sentTo} has a staff account, a link is on its way.
          </span>
        </div>
      ) : null}
    </form>
  );
}
