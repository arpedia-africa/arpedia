'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { useToast } from '@/components/toast';
import { fixFlag, originalUrl, release, undoFix, type Op } from './actions';

type Show = (msg: string, undo?: () => void) => void;
const ToastCtx = createContext<Show>(() => {});

/** Holds the toast above the flag list, so it outlives the refresh after a fix. */
export function FixShell({ children }: { children: ReactNode }) {
  const [toast, show] = useToast();
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast}
    </ToastCtx.Provider>
  );
}

/** Accept suggestion, Edit (rename the chapter, or leave the text as it is with a reason) and Jump to. */
export function FlagActions({
  revisionId,
  flagId,
  n,
  version,
  canAccept,
  done,
  rename,
  jump,
}: {
  revisionId: string;
  flagId: string;
  n: number;
  version: number;
  canAccept: boolean;
  /** Toast after Accept suggestion, e.g. "Chapter 4 title is now a heading". */
  done: string;
  /** The chapter to rename, for chapter-title flags. */
  rename?: { chapterUid: string; title: string };
  jump: string;
}) {
  const show = useContext(ToastCtx);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(rename?.title ?? '');

  const run = (op: Op | undefined, msg: string) =>
    start(async () => {
      const r = await fixFlag(revisionId, flagId, version, op);
      if (!r.ok) return show(r.error);
      setEditing(false);
      show(`${msg}. Flag ${n} cleared.`, () =>
        start(async () => {
          const u = await undoFix(revisionId, r.fixId, r.version);
          show(u.ok ? 'Change undone.' : u.error);
          router.refresh();
        }),
      );
    });

  if (editing)
    return (
      <form
        className="stack s8"
        onSubmit={e => {
          e.preventDefault();
          const v = value.trim();
          if (!v) return;
          run(
            rename ? { op: 'rename_chapter', chapter_uid: rename.chapterUid, title: v } : { op: 'dismiss_flag', reason: v },
            rename ? `Chapter renamed to “${v}”` : 'Left as it is',
          );
        }}
      >
        <input
          className="inp"
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={rename ? 'Chapter title' : 'Why it is fine as it is'}
          aria-label={rename ? 'Chapter title' : 'Why it is fine as it is'}
          maxLength={rename ? 200 : 500}
        />
        <div className="row">
          <button className="btn btn-s sm" type="submit" disabled={pending || !value.trim()}>
            Save
          </button>
          <button className="btn btn-q sm" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    );

  return (
    <div className="row">
      {canAccept && (
        <button className="btn btn-s sm" type="button" disabled={pending} onClick={() => run(undefined, done)}>
          Accept suggestion
        </button>
      )}
      <button className="btn btn-g sm" type="button" disabled={pending} onClick={() => setEditing(true)}>
        Edit
      </button>
      <Link className="btn btn-q sm" href={jump} scroll={false}>
        Jump to
      </Link>
    </div>
  );
}

/** Download original: asks the Worker for a short-lived link, then opens it. */
export function DownloadOriginal({ revisionId, label }: { revisionId: string; label: string }) {
  const show = useContext(ToastCtx);
  const [pending, start] = useTransition();
  return (
    <a
      className="link"
      style={{ fontSize: 13 }}
      role="button"
      tabIndex={0}
      aria-disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await originalUrl(revisionId);
          if (!r.ok) return show(r.error);
          window.location.assign(r.url);
        })
      }
    >
      {label}
    </a>
  );
}

/** The decision bar: queue position, Send back, Mark fixed and send to review, Skip (J). */
export function Decide({
  revisionId,
  position,
  total,
  canRelease,
  blockedReason,
  skipHref,
}: {
  revisionId: string;
  position: number;
  total: number;
  canRelease: boolean;
  blockedReason: string;
  skipHref: string;
}) {
  const show = useContext(ToastCtx);
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== 'j' || e.metaKey || e.ctrlKey || e.altKey || t.closest('input,textarea,select,[contenteditable]')) return;
      router.push(skipHref);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [router, skipHref]);
  return (
    <div className="decide">
      <div className="decide__q">
        Book{' '}
        <b>
          {position} of {total}
        </b>{' '}
        in Needs you ·{' '}
        <Link className="link" href="/books">
          Back to queue
        </Link>
      </div>
      <span className="grow"></span>
      <Link className="btn btn-g" href={`/books/${revisionId}/changes`}>
        Send back to author
      </Link>
      <button
        className="btn btn-p"
        type="button"
        disabled={pending}
        onClick={() => {
          if (!canRelease) return show(blockedReason);
          start(async () => {
            const r = await release(revisionId);
            if (!r.ok) return show(r.error);
            router.push(`/books?released=${revisionId}`);
          });
        }}
      >
        <Icon name="check" size="s" />
        Mark fixed and send to review
      </button>
      <Link className="btn btn-q sm" href={skipHref}>
        Skip <span className="kbd">J</span>
      </Link>
    </div>
  );
}
