import { useEffect, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { creditsToNaira, formatKobo, perReadEarningKobo, REVIEW_COPY_DAYS } from '@arpedia/core';
import { useTrack } from '../../../../features/11/analytics';
import { shortDate } from '../../../../features/11/application';
import { STUDIO_BOOKS } from '../../../../features/11/studio';
import { useRevisionBook, useRevisionStatus } from '../../../../features/11/submit';
import { StepFoot, SubmitDoneView } from '../../../../features/11/SubmitViews';

const num = (n: number) => n.toLocaleString('en-NG');

/**
 * s-studio-submitted (rule 22): celebration, review time, price and earning, what happens next.
 * An update to a live book (rule 25) waits here for its checks: a small one goes live through the
 * fast lane ("Your update is live"), anything else joins the review queue.
 */
export default function SubmitDone() {
  const track = useTrack();
  const { rev } = useLocalSearchParams<{ rev: string }>();
  const status = useRevisionStatus(rev);
  const book = useRevisionBook(rev);
  const d = status.data;
  const price = d?.price_credits ?? 0;
  const done = () => router.replace(STUDIO_BOOKS);
  const isUpdate = (book.data?.revision_no ?? 1) > 1;
  const title = book.data?.books?.title ?? 'Your book';
  const submittedOn = shortDate(book.data?.submitted_at ?? new Date().toISOString());
  // `draft` is the status cached from before the submit, until the refetch lands.
  const outcome =
    !d || d.status === 'processing' || d.status === 'draft'
      ? 'checking'
      : d.status === 'live'
        ? 'live'
        : 'review';

  const tracked = useRef(false);
  useEffect(() => {
    if (!isUpdate || outcome === 'checking' || tracked.current) return;
    tracked.current = true;
    track('book_update_submitted', { fast_lane: outcome === 'live' });
  }, [isUpdate, outcome, track]);

  const copy = !isUpdate
    ? {
        title: `${title} is in!`,
        sub: `Our team will review it within ${REVIEW_COPY_DAYS} days. Most reviews take 5 minutes.`,
        steps: undefined,
      }
    : outcome === 'live'
      ? {
          title: 'Your update is live',
          sub: `Readers of ${title} get the new version now. Their highlights stay in place.`,
          steps: [
            { title: 'Submitted', sub: submittedOn, done: true },
            { title: 'Checked', sub: 'A small change, so no review was needed', done: true },
            { title: 'Live', sub: 'Readers get the new version', done: true },
          ],
        }
      : outcome === 'checking'
        ? {
            title: 'Checking your update',
            sub: 'Small changes go live in a few minutes. You can leave; we’ll tell you.',
            steps: [
              { title: 'Submitted', sub: submittedOn, done: true },
              { title: 'Checks', sub: 'We compare it with the live version' },
              { title: 'Live, or review', sub: 'Small changes go live; bigger ones get a review' },
            ],
          }
        : {
            title: 'Your update is in',
            sub: `Our team will review it within ${REVIEW_COPY_DAYS} days. Readers keep the current version until then.`,
            steps: [
              { title: 'Submitted', sub: submittedOn, done: true },
              { title: 'Review', sub: 'Our team checks what changed' },
              {
                title: 'Approved, or sent back with a list',
                sub: 'If sent back, you get a short list of fixes',
              },
              { title: 'Live', sub: 'Readers get the new version' },
            ],
          };

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={<StepFoot label="Back to My books" onPress={done} />}
    >
      <SubmitDoneView
        title={copy.title}
        sub={copy.sub}
        price={{
          k: `${num(d?.words ?? 0)} words → ${num(d?.pages ?? 0)} pages`,
          v: `${num(price)} credits (₦${num(creditsToNaira(price))})`,
        }}
        earn={`₦1.60 a credit · ${formatKobo(perReadEarningKobo(price))} a full read`}
        submittedOn={submittedOn}
        steps={copy.steps}
        onClose={done}
      />
    </Screen>
  );
}
