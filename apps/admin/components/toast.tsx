'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

interface Shown {
  msg: string;
  undo?: () => void;
}

/**
 * The prototype's toast (`#toast`, 4.5 s, optional Undo link). Render `node` somewhere that stays
 * mounted, and call `show` with the message.
 */
export function useToast(): [ReactNode, (msg: string, undo?: () => void) => void] {
  const [shown, setShown] = useState<Shown | null>(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 4500);
    return () => clearTimeout(t);
  }, [shown]);
  const show = useCallback((msg: string, undo?: () => void) => setShown({ msg, undo }), []);
  const node = shown && (
    <div className="toast" role="status" aria-live="polite">
      {shown.msg}
      {shown.undo && (
        <>
          {' '}
          <a
            role="button"
            tabIndex={0}
            onClick={() => {
              setShown(null);
              shown.undo!();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setShown(null);
                shown.undo!();
              }
            }}
          >
            Undo
          </a>
        </>
      )}
    </div>
  );
  return [node, show];
}
