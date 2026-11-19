'use client';

import { useActionState, useState } from 'react';
import { verifyBackupCode, verifyCode, type CodeState } from './actions';
import { OtpInput, TrustRow } from './otp';

/** s-signin-2fa form: same markup as the prototype, plus the backup code field it toasts about. */
export function TwoStepForm() {
  const [backup, setBackup] = useState(false);
  const [codeState, codeAction, codePending] = useActionState<CodeState, FormData>(verifyCode, {});
  const [backupState, backupAction, backupPending] = useActionState<CodeState, FormData>(verifyBackupCode, {});
  const error = backup ? backupState.error : codeState.error;
  const pending = codePending || backupPending;
  return (
    <form className="auth__card" action={backup ? backupAction : codeAction} noValidate>
      <div className="stack s4">
        <h2>Enter your code</h2>
        <p className="muted">
          {backup
            ? 'Enter one of the backup codes you saved when you set up two-step. Each code works once.'
            : 'Open your authenticator app and enter the 6-digit code for Arpedia Admin.'}
        </p>
      </div>
      {error ? (
        <div className="note err" role="alert">
          <span className="grow">{error}</span>
        </div>
      ) : null}
      {backup ? (
        <div className="f">
          <label htmlFor="tf-b">Backup code</label>
          <div className={error ? 'inp error' : 'inp'}>
            <input id="tf-b" name="backup" autoComplete="off" autoFocus spellCheck={false} aria-invalid={!!error} />
          </div>
        </div>
      ) : (
        <OtpInput invalid={!!error} />
      )}
      <TrustRow />
      <button type="submit" className="btn btn-p lg block" disabled={pending} aria-busy={pending}>
        {pending ? 'Checking…' : 'Verify and sign in'}
      </button>
      <p className="hint">
        {backup ? 'Have your app? ' : "Can't use your app? "}
        <a
          className="link"
          href={backup ? '#app' : '#backup'}
          onClick={e => {
            e.preventDefault();
            setBackup(v => !v);
          }}
        >
          {backup ? 'Use your app code' : 'Use a backup code'}
        </a>
      </p>
    </form>
  );
}
