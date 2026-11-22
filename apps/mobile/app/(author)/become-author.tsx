import { useEffect } from 'react';
import { router } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { useSession } from '../../features/01/session';
import { useTrack } from '../../features/11/analytics';
import { BecomeAuthorFoot, BecomeAuthorView } from '../../features/11/ApplyViews';
import {
  REVIEW_DAYS,
  STUDIO,
  longDate,
  useIsAuthor,
  useLatestApplication,
} from '../../features/11/application';

export default function BecomeAuthor() {
  const track = useTrack();
  const uid = useSession()?.user.id;
  const isAuthor = useIsAuthor(uid);
  const latest = useLatestApplication(uid);
  useEffect(() => track('author_cta_viewed'), [track]);

  const a = latest.data;
  const today = new Date().toISOString().slice(0, 10);
  let label = 'Start application';
  let disabled = false;
  let notice: string | null = null;
  let go = () => router.push('/apply');
  if (isAuthor.data || a?.status === 'approved') {
    label = 'Open Author Studio';
    go = () => router.replace(STUDIO);
  } else if (a?.status === 'draft') {
    label = 'Continue your application';
  } else if (a?.status === 'needs_info') {
    label = 'Answer the editor’s question';
  } else if (a?.status === 'new' && a.submitted_at) {
    // Rule 7: one waiting application at a time; Start shows its status instead.
    label = `Sent · we’ll reply by ${longDate(a.submitted_at, REVIEW_DAYS)}`;
    disabled = true;
  } else if (a?.status === 'rejected') {
    notice = a.decision_reason ? `Your last application wasn’t approved: ${a.decision_reason}` : null;
    if (!a.reapply_after || a.reapply_after > today) {
      label = a.reapply_after
        ? `You can apply again on ${longDate(a.reapply_after)}`
        : 'Applications are closed for you';
      disabled = true;
    }
  }

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={
        <BecomeAuthorFoot
          label={label}
          disabled={disabled || latest.isLoading}
          onPress={() => {
            if (label === 'Start application') track('application_started');
            go();
          }}
        />
      }
    >
      <BecomeAuthorView
        notice={notice}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />
    </Screen>
  );
}
