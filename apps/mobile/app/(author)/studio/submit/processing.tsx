import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { isNetworkError } from '../../../../features/01/session';
import { useTrack } from '../../../../features/11/analytics';
import { STUDIO_BOOKS } from '../../../../features/11/studio';
import {
  isChaptersReady,
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

/**
 * s-studio-processing (rule 18): the Worker checks the book; the author can leave and gets a push
 * when chapters are ready. Word and PDF wait for the Arpedia team's desk (rule 18a).
 */
export default function SubmitProcessing() {
  const track = useTrack();
  const { rev } = useLocalSearchParams<{ rev: string }>();
  const status = useRevisionStatus(rev);
  const book = useRevisionBook(rev);
  const started = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const d = status.data;
  const ready = !!d && isChaptersReady(d);

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
  const view = model(d, book.data?.source_type ?? null, ready, (now - started.current) / 1000);
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

function model(d: RevisionStatus | undefined, source: string | null, ready: boolean, seconds: number) {
  const note =
    'Nothing for you to do here. You can leave this screen; we’ll send a notification when your chapters are ready to check.';
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
  // ~15 s a step while the Worker works; the fourth step waits for the result.
  const at = Math.min(3, 1 + Math.floor(seconds / 15));
  return {
    sub: 'This takes 1 to 3 minutes.',
    steps: STEPS.map((label, i) => ({
      label,
      state: (i < at ? 'done' : i === at ? 'now' : 'todo') as ProcState,
    })),
    progress: Math.min(0.9, (at + 0.5) / STEPS.length),
    note,
    callout: null,
  };
}
