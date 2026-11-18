'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { finishEnrolment, startEnrolment, type CodeState } from '../actions';
import { OtpInput } from '../otp';

type Enrolment = { id: string; qr: string; secret: string } | { error: string } | null;

/** Authenticator setup, then the 10 backup codes shown once. */
export function SetupForm() {
  const [enrolment, setEnrolment] = useState<Enrolment>(null);
  const [state, action, pending] = useActionState<CodeState, FormData>(finishEnrolment, {});

  // Once only: a second enrolment would replace the first factor while its QR code is on screen.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startEnrolment().then(setEnrolment);
  }, []);

  if (state.codes) {
    return (
      <div className="auth__card">
        <div className="stack s4">
          <h2>Save your backup codes</h2>
          <p className="muted">Each code works once in place of your app. Keep them somewhere safe, away from this computer.</p>
        </div>
        <div className="note warn">
          <span className="grow" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
            {state.codes.map(c => (
              <b key={c} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {c}
              </b>
            ))}
          </span>
        </div>
        <p className="hint">You won&apos;t see these again. You can make new ones in My account.</p>
        <a className="btn btn-p lg block" href="/">
          I&apos;ve saved them, continue
        </a>
      </div>
    );
  }

  const error = state.error ?? (enrolment && 'error' in enrolment ? enrolment.error : undefined);
  const ready = enrolment && 'id' in enrolment ? enrolment : null;
  return (
    <form className="auth__card" action={action} noValidate>
      <div className="stack s4">
        <h2>Set up two-step</h2>
        <p className="muted">Scan this code with your authenticator app, then enter the 6-digit code it shows for Arpedia Admin.</p>
      </div>
      {error ? (
        <div className="note err" role="alert">
          <span className="grow">{error}</span>
        </div>
      ) : null}
      {ready ? (
        <>
          <img src={ready.qr} width={160} height={160} alt="QR code for your authenticator app" />
          <div className="kv-row">
            <span>Can&apos;t scan? Type this key</span>
            <b style={{ wordBreak: 'break-all' }}>{ready.secret}</b>
          </div>
          <input type="hidden" name="factor" value={ready.id} />
          <OtpInput invalid={!!state.error} />
        </>
      ) : (
        <div className="skel" style={{ width: 160, height: 160 }} aria-label="Loading" />
      )}
      <button type="submit" className="btn btn-p lg block" disabled={!ready || pending} aria-busy={pending}>
        {pending ? 'Checking…' : 'Verify and continue'}
      </button>
    </form>
  );
}
