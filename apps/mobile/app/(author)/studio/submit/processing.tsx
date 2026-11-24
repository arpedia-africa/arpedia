import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { ConvertStage } from '@arpedia/convert';
import { creditsToNaira, formatNaira } from '@arpedia/core';
import { Screen } from '@arpedia/ui';
import { isNetworkError } from '../../../../features/01/session';
import { useTrack } from '../../../../features/11/analytics';
import { deviceRamMb, loadJob, runJob, type ConvertOutcome } from '../../../../features/11/convert';
import { STUDIO_BOOKS } from '../../../../features/11/studio';
import {
  isChaptersReady,
  SubmitError,
  submitStep,
  useRevisionBook,
  useRevisionStatus,
  type RevisionStatus,
} from '../../../../features/11/submit';
import {
  SubmitProcessingFoot,
  SubmitProcessingView,
  type ProcState,
} from '../../../../features/11/SubmitViews';

const STEPS = [
  'Reading your file',
  'Cleaning text and quotes',
  'Finding chapters',
  'Building the free 10% preview',
  'Checking cover and content',
];

/** This phone's part of the job: none, converting (stage), uploading, finished, or waiting to retry. */
type Local =
  | { k: 'none' }
  | { k: 'converting'; stage: ConvertStage }
  | { k: 'uploading' }
  | { k: 'done'; out: ConvertOutcome }
  | { k: 'retry'; message: string };

const RETRY_MS = 10_000;

/**
 * s-studio-processing (rule 18): Word and EPUB are converted on this phone first (flow 12 rule 6),
 * uploaded, then the Worker checks the book; the author can leave and gets a push when chapters
 * are ready. Closing the app mid-conversion resumes here from the saved file (rule 23). PDF, and
 * anything the phone can't convert, waits for the Arpedia team's desk (rule 18a).
 */
export default function SubmitProcessing() {
  const track = useTrack();
  const { rev } = useLocalSearchParams<{ rev: string }>();
  const status = useRevisionStatus(rev);
  const book = useRevisionBook(rev);
  const started = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [local, setLocal] = useState<Local | null>(null);
  const [attempt, setAttempt] = useState(0);
  const d = status.data;
  const refetch = status.refetch;
  const ready = !!d && isChaptersReady(d);

  useEffect(() => {
    if (!rev) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const job = await loadJob(rev);
      if (!live) return;
      if (!job) return setLocal((l) => (l?.k === 'done' ? l : { k: 'none' }));
      setLocal({ k: 'converting', stage: 0 });
      try {
        const out = await runJob(job, (stage) => {
          if (live) setLocal(stage === 'upload' ? { k: 'uploading' } : { k: 'converting', stage });
        });
        if (!live) return;
        if (out.converted)
          track('convert_completed', { ms: out.ms, words: out.hints.words, device_ram_mb: deviceRamMb() });
        else track('convert_failed', { reason: out.reason });
        if (out.rev !== rev) return router.replace(submitStep('processing', out.rev));
        setLocal({ k: 'done', out });
        void refetch();
      } catch (e) {
        if (!live) return;
        setLocal({
          k: 'retry',
          message: e instanceof SubmitError ? e.message : 'Upload didn’t finish. Check your connection.',
        });
        timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      }
    })();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [rev, attempt, track, refetch]);

  // The Worker has no stage feed: steps move on with time while it works, never past the last one.
  useEffect(() => {
    if (ready) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ready]);
  useEffect(() => {
    if (ready) track('book_processing_done', { seconds: Math.round((Date.now() - started.current) / 1000) });
  }, [ready, track]);

  const leave = () => router.replace(STUDIO_BOOKS);
  const view = model(d, book.data?.source_type ?? null, ready, (now - started.current) / 1000, local);
  const offline = status.isError && isNetworkError(status.error);

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <SubmitProcessingFoot
          ready={ready}
          onReady={() => router.replace(submitStep('chapters', rev))}
          onLeave={leave}
        />
      }
    >
      <SubmitProcessingView
        sub={view.sub}
        steps={view.steps}
        progress={view.progress}
        note={view.note}
        callout={
          offline
            ? {
                tone: 'warn',
                text: 'You’re offline. The check keeps going; we’ll update this when you’re back.',
              }
            : status.isError
              ? { tone: 'err', text: 'Couldn’t check on your book. We’ll keep trying.' }
              : view.callout
        }
        onBack={leave}
      />
    </Screen>
  );
}

const steps = (at: number) =>
  STEPS.map((label, i) => ({ label, state: (i < at ? 'done' : i === at ? 'now' : 'todo') as ProcState }));

const num = (n: number) => n.toLocaleString('en-NG');

/** "About 62,500 words · 250 pages. Readers pay about 125 credits (₦375)." The Worker has the final say. */
const hintLine = (out: ConvertOutcome) =>
  out.converted
    ? `About ${num(out.hints.words)} words · ${num(Math.ceil(out.hints.pages))} pages. Readers pay about ` +
      `${num(out.hints.price)} credits (${formatNaira(creditsToNaira(out.hints.price))}). We’re checking the numbers now.`
    : null;

function model(
  d: RevisionStatus | undefined,
  source: string | null,
  ready: boolean,
  seconds: number,
  local: Local | null,
) {
  const note =
    'Nothing for you to do here. You can leave this screen; we’ll send a notification when your chapters are ready to check.';
  // This phone converts first (rule 18): its own steps, before the server's.
  if (!ready && local?.k === 'converting')
    return {
      sub: 'Getting your book ready on this phone.',
      steps: steps(local.stage),
      progress: (local.stage + 0.5) / STEPS.length,
      note: 'You can leave this screen. If you close the app, we pick up where we stopped when you open it again.',
      callout: null,
    };
  if (!ready && (local?.k === 'uploading' || local?.k === 'retry'))
    return {
      sub: local.k === 'uploading' ? 'Uploading your book…' : 'Waiting to upload your book.',
      steps: steps(4),
      progress: 0.8,
      note,
      callout:
        local.k === 'retry' ? { tone: 'warn' as const, text: `${local.message} We’ll keep trying.` } : null,
    };
  // A draft whose upload never finished on this phone (no saved job) has to be uploaded again.
  if (local?.k === 'none' && d?.status === 'draft' && d.draft_step === 'upload')
    return {
      sub: 'This upload didn’t finish.',
      steps: steps(0),
      progress: 0,
      note: 'Go back to My books and tap Continue to upload your file again.',
      callout: null,
    };
  const hint = local?.k === 'done' ? hintLine(local.out) : null;
  if (ready) {
    return {
      sub: 'Your chapters are ready to check.',
      steps: STEPS.map((label) => ({ label, state: 'done' as ProcState })),
      progress: 1,
      note: 'All done. Check your chapters next.',
      callout: null,
    };
  }
  if (d?.status === 'with_desk') {
    return {
      sub: 'Our team is getting it ready.',
      steps: STEPS.map((label, i) => ({
        label,
        state: (i === 0 ? 'done' : i === 1 ? 'now' : 'todo') as ProcState,
      })),
      progress: 0.25,
      note,
      callout: {
        tone: 'info' as const,
        text:
          source === 'pdf'
            ? 'PDFs are sent to our team. This takes longer and is more likely to be sent back.'
            : 'Your file is with the Arpedia team. They usually finish within 2 days.',
      },
    };
  }
  if (d?.status === 'sent_back' || d?.status === 'rejected') {
    return {
      sub: 'We couldn’t get this file ready.',
      steps: STEPS.map((label, i) => ({ label, state: (i === 0 ? 'done' : 'todo') as ProcState })),
      progress: 0.1,
      note: 'See My books for what to change, then upload the file again.',
      callout: {
        tone: 'err' as const,
        text: d.sent_back_note ?? 'We could not read this file. Please send the Word version.',
      },
    };
  }
  // Converted here: only the server check is left. Otherwise ~15 s a step while the Worker works;
  // the fourth step waits for the result.
  if (hint)
    return {
      sub: 'Checking your book. This is usually under a minute.',
      steps: steps(4),
      progress: 0.9,
      note: hint,
      callout: null,
    };
  const at = Math.min(3, 1 + Math.floor(seconds / 15));
  return {
    sub: 'This takes 1 to 3 minutes.',
    steps: steps(at),
    progress: Math.min(0.9, (at + 0.5) / STEPS.length),
    note,
    // States: loading (flow 11). The Worker reports no stages yet, so past 30 s say it's still going.
    callout:
      seconds > 30
        ? { tone: 'info' as const, text: 'Still working. You can leave; we will notify you.' }
        : null,
  };
}
