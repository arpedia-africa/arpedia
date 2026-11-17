'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/icon';
import { signIn, type SignInState } from './actions';
import styles from './sign-in.module.css';

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  return (
    <form className={styles.card} action={action} noValidate>
      <div className={styles.stack4}>
        <h2>Staff sign in</h2>
        <p className="muted">Use the email your invite was sent to.</p>
      </div>
      <div className="f">
        <label htmlFor="si-e">Work email</label>
        <div className={`inp ${state.error ? 'err' : ''}`}>
          <input
            id="si-e"
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={state.email}
            required
            aria-invalid={!!state.error}
            aria-describedby={state.error ? 'si-err' : undefined}
          />
        </div>
      </div>
      <div className="f">
        <label htmlFor="si-p">Password</label>
        <div className={`inp ${state.error ? 'err' : ''}`}>
          <input id="si-p" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" required />
          <button
            type="button"
            className={styles.eye}
            onClick={() => setShow(v => !v)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
          >
            <Icon name="eye" size="s" />
          </button>
        </div>
        {/* Self-service reset arrives with flow 16; until then a super admin resets it. */}
        <button type="button" className={`link ${styles.forgot}`} onClick={() => setForgot(true)} aria-expanded={forgot}>
          Forgot password?
        </button>
        {forgot ? <p className="hint">Ask a super admin to reset your password from Team and roles.</p> : null}
      </div>
      {state.error ? (
        <p id="si-err" role="alert" className={styles.error}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-p lg block" disabled={pending} aria-busy={pending}>
        {pending ? 'Signing in…' : 'Continue'}
      </button>
      <p className="hint">Lost access? Ask a super admin to reset your account.</p>
    </form>
  );
}
