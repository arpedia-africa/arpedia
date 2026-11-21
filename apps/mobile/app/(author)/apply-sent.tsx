import { router } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { useSession } from '../../features/01/session';
import { ApplySentFoot, ApplySentView } from '../../features/11/ApplyViews';
import {
  REVIEW_DAYS,
  STUDIO,
  longDate,
  shortDate,
  useLatestApplication,
} from '../../features/11/application';

/** s-apply-sent: the sent date and the reply-by date (rule 7). */
export default function ApplySent() {
  const uid = useSession()?.user.id;
  const latest = useLatestApplication(uid);
  const sentAt = latest.data?.submitted_at ?? new Date().toISOString();
  const close = () => (router.canGoBack() ? router.dismissAll() : router.replace('/home'));
  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={<ApplySentFoot onStudio={() => router.push(STUDIO)} />}
    >
      <ApplySentView replyBy={longDate(sentAt, REVIEW_DAYS)} sentOn={shortDate(sentAt)} onClose={close} />
    </Screen>
  );
}
