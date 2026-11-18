'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** The prototype's `.mwrap` dropdown: the trigger toggles the `.menu`; a click outside or Esc closes it. */
export function Menu({
  trigger,
  children,
  tab,
  link,
  left,
}: {
  trigger: ReactNode;
  children: ReactNode;
  tab?: boolean;
  /** The trigger is the cell's own text (a table cell that opens actions), not a filter button. */
  link?: boolean;
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
      ) : link ? (
        <button
          type="button"
          style={{ font: 'inherit', color: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', textDecoration: 'underline dotted' }}
          {...props}
        >
          {trigger}
        </button>
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
