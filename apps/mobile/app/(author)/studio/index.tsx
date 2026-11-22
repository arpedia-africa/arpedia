import { useEffect } from 'react';
import { router, type Href } from 'expo-router';
import { Screen, useToast } from '@arpedia/ui';
import { formatKobo } from '@arpedia/core';
import { isNetworkError, useMyProfile, useSession } from '../../../features/01/session';
import { useTrack } from '../../../features/11/analytics';
import { rpcCode } from '../../../features/11/application';
import { SUBMIT } from '../../../features/11/submit';
import {
  STUDIO_BOOKS,
  STUDIO_EARNINGS,
  bookCountsLine,
  compact,
  num,
  useAuthorProfile,
  useBannerDismissed,
  useStudioEarnings,
  useStudioHome,
  nextPayout,
  payoutOf,
  type StudioHome,
} from '../../../features/11/studio';
import {
  StudioHomeHold,
  StudioHomeView,
  type StudioGo,
  type StudioHomeModel,
} from '../../../features/11/StudioViews';

const firstName = (n: string | null | undefined) => n?.trim().split(/\s+/)[0] ?? '';

/** s-studio: this month's stats, approval banner, quick actions, earnings per book, shortcuts. */
export default function Studio() {
  const track = useTrack();
  const toast = useToast();
  const uid = useSession()?.user.id;
  const me = useMyProfile(uid);
  const home = useStudioHome(uid);
  const earnings = useStudioEarnings(home.data ? uid : undefined);
  const author = useAuthorProfile(home.data ? uid : undefined);
  const [dismissed, dismiss] = useBannerDismissed(uid);
  useEffect(() => track('studio_opened'), [track]);

  const soon = (what: string) => toast({ message: `${what} opens in the next Studio update` });
  const go = (to: StudioGo) => {
    switch (to) {
      case 'reader':
        return router.replace('/home');
      case 'books':
        return router.push(STUDIO_BOOKS);
      case 'earnings':
        return router.push(STUDIO_EARNINGS);
      case 'submit':
        return router.push(SUBMIT);
      case 'post':
      case 'posts':
        return router.push('/studio/post' as Href);
      case 'inbox':
        return router.push('/studio/inbox' as Href);
      case 'club':
        return soon('Your club chat');
      case 'profile':
        return router.push('/studio/profile' as Href);
      case 'payout':
        return router.push('/studio/payout' as Href);
      case 'community':
        return router.push('/studio/club' as Href);
    }
  };

  const notAuthor = home.isError && rpcCode(home.error).code === 'not_author';
  const name = firstName(home.data?.pen_name) || firstName(me.data?.full_name) || 'there';

  let body;
  if (home.data || notAuthor) {
    body = (
      <StudioHomeView
        m={
          notAuthor
            ? previewModel(name)
            : toModel(home.data!, name, earnings.data?.history, author.data?.visibility, dismissed)
        }
        go={go}
        onDismissBanner={dismiss}
      />
    );
  } else {
    body = (
      <StudioHomeHold
        name={name}
        error={home.isError ? (isNetworkError(home.error) ? 'offline' : 'failed') : null}
        onRetry={() => void home.refetch()}
        onReader={() => go('reader')}
      />
    );
  }

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      {body}
    </Screen>
  );
}

function toModel(
  h: StudioHome,
  name: string,
  history: Parameters<typeof nextPayout>[0] | undefined,
  visibility: 'public' | 'private' | undefined,
  dismissed: boolean,
): StudioHomeModel {
  // Each bar is the book's share of the month's book earnings (the prototype's 78% / 22%).
  const total = Math.max(
    1,
    h.books.reduce((n, b) => n + b.earned_kobo, 0),
  );
  const next = history ? nextPayout(history) : null;
  return {
    name,
    stats: {
      books: num(h.book_counts.live),
      minutes: compact(h.minutes_read),
      followers: compact(h.followers),
      earned: formatKobo(h.month.earned_kobo),
    },
    banner: h.show_approval_banner && !dismissed,
    suspended: h.status === 'suspended' ? (h.suspended_reason ?? 'contact us for the reason.') : null,
    books: h.books.map((b) => ({
      id: b.book_id,
      title: b.title,
      earned: formatKobo(b.earned_kobo),
      credits: num(b.credits),
      share: b.earned_kobo / total,
    })),
    noBooks: h.book_counts.all === 0,
    shortcuts: {
      // Messages, posts and the club's live counts arrive with flows 08 and 06.
      messages: { sub: 'No messages waiting', count: 0 },
      club: h.club_group_id ? `${name}’s Readers` : 'Opens with your first reader',
      books: {
        sub: h.book_counts.all ? bookCountsLine(h.book_counts) : 'Submit your first book',
        count: h.book_counts.all,
      },
      posts: 'Post to your followers and club',
      earnings: next
        ? { sub: `Next payout ${payoutOf(next).label}`, trail: formatKobo(next.earned_kobo) }
        : { sub: 'Paid on the 15th after a 30-day hold', trail: null },
      visibility: visibility === 'private' ? 'Private' : 'Public',
      payout: h.payout_account_status === 'verified' ? 'Verified' : 'Not set up yet',
      community: 'Who can post, slow mode',
    },
  };
}

function previewModel(name: string): StudioHomeModel {
  return {
    name,
    stats: { books: '0', minutes: '0', followers: '0', earned: '₦0' },
    banner: false,
    suspended: null,
    preview: true,
    books: [],
    noBooks: true,
    shortcuts: {
      messages: { sub: 'No messages waiting', count: 0 },
      club: 'Opens the day you’re approved',
      books: { sub: 'Submit your first book', count: 0 },
      posts: 'Post to your followers and club',
      earnings: { sub: 'Paid on the 15th after a 30-day hold', trail: null },
      visibility: 'Public',
      payout: 'Not set up yet',
      community: 'Who can post, slow mode',
    },
  };
}
