'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/icon';
import { STAFF_PASSWORD_MIN } from '@/lib/staff-rules';
import { acceptInvite, type AcceptState } from './actions';

/** Join the team: name, email and role from the invite, and a new password. */
export function AcceptForm({ token, email, name, role }: { token: string; email: string; name: string; role: string }) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(acceptInvite, {});
  const [show, setShow] = useState(false);
  return (
    <form className="auth__card" action={action} noValidate>
      <div className="stack s4">
        <h2>{`Welcome, ${name.split(/\s+/)[0] ?? name}`}</h2>
        <p className="muted">{`You're joining Arpedia Admin as ${role}. Create a password, then set up two-step.`}</p>
      </div>
      {state.error ? (
        <div className="note err" role="alert">
          <span className="grow">{state.error}</span>
        </div>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <div className="f">
        <label htmlFor="ia-e">Work email</label>
        <div className="inp">
          <input id="ia-e" value={email} readOnly autoComplete="username" />
        </div>
      </div>
      <div className="f">
        <label htmlFor="ia-p">Password</label>
        <div className={state.error ? 'inp error' : 'inp'}>
          <input
            id="ia-p"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={STAFF_PASSWORD_MIN}
            required
            autoFocus
            aria-describedby="ia-h"
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
        <p id="ia-h" className="hint">{`Use at least ${STAFF_PASSWORD_MIN} characters.`}</p>
      </div>
      <button type="submit" className="btn btn-p lg block" disabled={pending} aria-busy={pending}>
        {pending ? 'Creating…' : 'Create password'}
      </button>
    </form>
  );
}
