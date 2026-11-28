'use client';

import type { ChapterAccess } from '@arpedia/core';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FRAME_SRC, hostReader, type SpotBook } from '@/lib/reader-host';

/** The app's reader is laid out for a 375 px phone (CLAUDE.md design width) and scaled to fit. */
const PHONE_WIDTH = 375;
/** Room left free at the preview cut for the "Free preview ends here" note, in reader pixels. */
const CUT_ROOM = 96;

const Book = createContext<SpotBook | null>(null);

/** The preview package, sent once for the three phones. */
export function SpotBookProvider({ book, children }: { book: SpotBook | null; children: ReactNode }) {
  return <Book.Provider value={book}>{children}</Book.Provider>;
}

let bundle: Promise<string> | null = null;
/** The reader bundle is large (fonts inline), so it loads after the page, once. */
const readerHtml = () =>
  (bundle ??= import('@arpedia/reader/html').then(m => m.readerHtml).catch(e => {
    bundle = null;
    throw e;
  }));

/**
 * A spot-check phone's page (rule 35): the real reader on the working copy, opened at `paraId`.
 * The plain text (`children`) shows while it loads and stays if the reader cannot open; `note`
 * sits over the room the page leaves at the preview cut.
 */
export function SpotReader({
  paraId,
  access,
  note,
  children,
}: {
  paraId: string | null;
  /** What each chapter opens as: all open, or stopped at the cut like a reader with no plan. */
  access: Record<string, ChapterAccess>;
  note?: ReactNode;
  children: ReactNode;
}) {
  const book = useContext(Book);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [shown, setShown] = useState(false);
  const [size, setSize] = useState({ w: 280, h: 470 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.offsetWidth || 280, h: el.offsetHeight || 470 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gateRoom = note ? CUT_ROOM : 0;
  useEffect(() => {
    const el = frame.current;
    if (!el || !book || !paraId) return;
    let stop: (() => void) | null = null;
    let live = true;
    setShown(false);
    readerHtml()
      .then(html => {
        if (!live) return;
        stop = hostReader(
          el,
          html,
          { book, access, para_id: paraId, gateRoom },
          { onShown: () => live && setShown(true), onFailed: () => live && setShown(false) },
        );
        // Load the frame only now that the host listens for it.
        el.src = FRAME_SRC;
      })
      .catch(() => undefined);
    return () => {
      live = false;
      stop?.();
    };
  }, [book, paraId, access, gateRoom]);

  const scale = size.w / PHONE_WIDTH;
  return (
    <div className="ct-reader" ref={box} style={{ position: 'relative' }}>
      <div style={{ display: 'contents', visibility: shown ? 'hidden' : undefined }}>
        {children}
        {note}
      </div>
      {book && paraId && (
        <>
          <iframe
            ref={frame}
            title="Reader preview"
            aria-hidden={!shown}
            tabIndex={-1}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: PHONE_WIDTH,
              height: size.h / scale,
              border: 0,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              opacity: shown ? 1 : 0,
              transition: 'opacity .2s',
              pointerEvents: 'none',
            }}
          />
          {shown && note && (
            <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16, display: 'flex', flexDirection: 'column' }}>
              {note}
            </div>
          )}
        </>
      )}
    </div>
  );
}

