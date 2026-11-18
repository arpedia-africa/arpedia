'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/icon';
import { STAFF_PASSWORD_MIN } from '@/lib/staff-rules';
import { setNewPassword, type NewPasswordState } from '../reset/actions';

/** New password: the s-signin password field, with the staff rule shown before typing. */
export function NewPasswordForm() {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(setNewPassword, {});
  const [show, setShow] = useState(false);
  return (
    <form className="auth__card" action={action} noValidate>
      <div className="stack s4">
        <h2>New password</h2>
        <p className="muted">After this, you'll enter a code from your authenticator app as usual.</p>
      </div>
      <div className="f">
        <label htmlFor="np-p">New password</label>
        <div className={state.error ? 'inp error' : 'inp'}>
          <input
            id="np-p"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={STAFF_PASSWORD_MIN}
            required
            autoFocus
            aria-invalid={!!state.error}
            aria-describedby="np-h"
          />
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
        <p id="np-h" className={state.error ? 'hint err' : 'hint'}>
          {state.error ?? `Use at least ${STAFF_PASSWORD_MIN} characters.`}
        </p>
      </div>
      <button type="submit" className="btn btn-p lg block" disabled={pending} aria-busy={pending}>
        {pending ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
