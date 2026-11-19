'use client';

import { useState } from 'react';

/**
 * The prototype's .otp row (six boxes, the last typed one ringed with .f) for a code you ask for
 * again before a money change. One real input lies over it so typing, pasting and autofill work.
 */
export function Otp({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="otp" style={{ position: 'relative' }}>
      {Array.from({ length: 6 }, (_, i) => (
        <span key={i} className={focused && i === Math.max(value.length - 1, 0) ? 'f' : undefined} aria-hidden>
          {value[i] ?? ''}
        </span>
      ))}
      <input
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        aria-label="2-step code"
        aria-invalid={invalid}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', border: 0, cursor: 'text' }}
      />
    </div>
  );
}
