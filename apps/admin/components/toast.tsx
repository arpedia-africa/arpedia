'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastMessage {
  text: string;
  /** Shows "Undo" after the text (the prototype's data-undo). */
  onUndo?: () => void;
}

/** The prototype's single .toast at the bottom of the console: 4.5 seconds, optional Undo. */
export function useToast() {
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: ToastMessage) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 4500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const node = (
    <div className="toast" role="status" aria-live="polite" hidden={!msg}>
      {msg?.text}
      {msg?.onUndo ? (
        <>
          {' '}
          <a
            href="#undo"
            onClick={e => {
              e.preventDefault();
              const undo = msg.onUndo;
              setMsg(null);
              undo?.();
            }}
          >
            Undo
          </a>
        </>
      ) : null}
    </div>
  );
  return { show, node };
}
