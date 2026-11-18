'use client';

import { useState } from 'react';

/**
 * The prototype's .otp row (six boxes, the last typed one ringed with .f), driven by one real
 * input laid over it so typing, pasting and one-time-code autofill all work.
 */
export function OtpInput({ name = 'code', invalid }: { name?: string; invalid?: boolean }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  return (
    <div className="otp" style={{ position: 'relative' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={focused && i === Math.max(value.length - 1, 0) ? 'f' : undefined} aria-hidden>
          {value[i] ?? ''}
        </span>
      ))}
      <input
        name={name}
        value={value}
        onChange={e => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        aria-label="6-digit code"
        aria-invalid={invalid}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', border: 0, cursor: 'text' }}
      />
    </div>
  );
}

/** "Trust this browser for 12 hours" (.checkrow with the prototype's .cb box). Ticked by default. */
export function TrustRow() {
  const [on, setOn] = useState(true);
  return (
    <label className="checkrow">
      <span
        className={on ? 'cb on' : 'cb'}
        role="checkbox"
        aria-checked={on}
        tabIndex={0}
        onClick={() => setOn(v => !v)}
        onKeyDown={e => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setOn(v => !v);
          }
        }}
      />
      <span onClick={() => setOn(v => !v)}>Trust this browser for 12 hours</span>
      <input type="hidden" name="trust" value={on ? '1' : '0'} />
    </label>
  );
}
