import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { creditsToNaira, formatKobo, perReadEarningKobo, REVIEW_COPY_DAYS } from '@arpedia/core';
import { shortDate } from '../../../../features/11/application';
import { STUDIO_BOOKS } from '../../../../features/11/studio';
import { useRevisionBook, useRevisionStatus } from '../../../../features/11/submit';
import { StepFoot, SubmitDoneView } from '../../../../features/11/SubmitViews';

const num = (n: number) => n.toLocaleString('en-NG');

/** s-studio-submitted (rule 22): celebration, review time, price and earning, what happens next. */
export default function SubmitDone() {
  const { rev } = useLocalSearchParams<{ rev: string }>();
  const status = useRevisionStatus(rev);
  const book = useRevisionBook(rev);
  const d = status.data;
  const price = d?.price_credits ?? 0;
  const done = () => router.replace(STUDIO_BOOKS);
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={<StepFoot label="Back to My books" onPress={done} />}
    >
      <SubmitDoneView
        title={`${book.data?.books?.title ?? 'Your book'} is in!`}
        sub={`Our team will review it within ${REVIEW_COPY_DAYS} days. Most reviews take 5 minutes.`}
        price={{
          k: `${num(d?.words ?? 0)} words → ${num(d?.pages ?? 0)} pages`,
          v: `${num(price)} credits (₦${num(creditsToNaira(price))})`,
        }}
        earn={`₦1.60 a credit · ${formatKobo(perReadEarningKobo(price))} a full read`}
        submittedOn={shortDate(book.data?.submitted_at ?? new Date().toISOString())}
        onClose={done}
      />
    </Screen>
  );
}
