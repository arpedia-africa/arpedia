'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The prototype's `.mwrap` dropdown: the trigger toggles the `.menu`; a click outside or Esc closes it. */
export function Menu({
  trigger,
  children,
  tab,
  left,
}: {
  trigger: ReactNode;
  children: ReactNode;
  tab?: boolean;
  /** Open towards the right (the prototype's `left:0;right:auto`). */
  left?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const props = { 'aria-expanded': open, onClick: () => setOpen(o => !o) };
  return (
    <div className="mwrap" ref={ref} style={tab ? { alignSelf: 'center' } : undefined}>
      {tab ? (
        <a role="tab" aria-selected="false" style={{ cursor: 'pointer' }} {...props}>
          {trigger}
        </a>
      ) : (
        <button className="fbtn" type="button" {...props}>
          {trigger}
        </button>
      )}
      {open && (
        <div className="menu" style={left ? { left: 0, right: 'auto' } : undefined} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
