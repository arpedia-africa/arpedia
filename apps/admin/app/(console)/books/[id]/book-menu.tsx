'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';

/** A header button that only explains (the prototype's data-toast actions). */
export function ToastButton({ label, message, className }: { label: string; message: string; className: string }) {
  const [toast, show] = useToast();
  return (
    <>
      <button className={className} type="button" onClick={() => show(message)}>
        {label}
      </button>
      {toast}
    </>
  );
}

/**
 * The book header's ⋯ menu (s-book): app preview, edit details, replace cover, Unpublish. Edit
 * details and Replace cover open /books/[id]/edit, which saves a new revision (flow 12 rule 41).
 */
export function BookMenu({ bookId, title, live }: { bookId: string; title: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  const [toast, show] = useToast();
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
  const pick = (msg: string) => () => {
    setOpen(false);
    show(msg);
  };
  return (
    <div className="mwrap" ref={ref}>
      <button
        className="ib"
        type="button"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => setOpen(o => !o)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu">
          <a role="button" tabIndex={0} onClick={pick(`Open ${title} in the Arpedia app to preview it as a reader.`)}>
            Open in app preview
          </a>
          {live ? (
            <>
              <Link href={`/books/${bookId}/edit`} onClick={() => setOpen(false)}>
                Edit details
              </Link>
              <Link href={`/books/${bookId}/edit?cover=1`} onClick={() => setOpen(false)}>
                Replace cover
              </Link>
            </>
          ) : (
            <>
              <a role="button" tabIndex={0} onClick={pick('Details change through a new revision once the book is live.')}>
                Edit details
              </a>
              <a role="button" tabIndex={0} onClick={pick('A new cover comes with a new revision once the book is live.')}>
                Replace cover
              </a>
            </>
          )}
          {live && (
            <>
              <hr />
              <Link className="danger" href={`/books/${bookId}/unpublish`}>
                Unpublish…
              </Link>
            </>
          )}
        </div>
      )}
      {toast}
    </div>
  );
}
