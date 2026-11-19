import { router } from 'expo-router';
import { Screen, useToast } from '@arpedia/ui';
import { studioBookLine } from '@arpedia/core';
import { isNetworkError, useSession } from '../../../features/01/session';
import { shortDate } from '../../../features/11/application';
import {
  bookCountsLine,
  num,
  toneFor,
  useStudioBooks,
  useStudioHome,
  type StudioBook,
} from '../../../features/11/studio';
import { StudioBooksView, type StudioBookModel } from '../../../features/11/StudioViews';

/** s-studio-books: every book with its status and one next action (rules 14–16). */
export default function StudioBooks() {
  const toast = useToast();
  const uid = useSession()?.user.id;
  const books = useStudioBooks(uid);
  const home = useStudioHome(uid);
  const suspended = home.data?.status === 'suspended';
  const state = books.data
    ? 'ready'
    : books.isError
      ? isNetworkError(books.error)
        ? 'offline'
        : 'failed'
      : 'loading';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/studio'));
  const submit = () => toast({ message: 'Submit a book opens in the next Studio update' });

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioBooksView
        sub={books.data ? (books.data.length ? bookCountsLine(null, books.data) : 'Nothing here yet') : ' '}
        books={books.data?.map((b) => toModel(b, suspended)) ?? null}
        state={state}
        onBack={back}
        onSubmit={submit}
        canSubmit={!suspended}
        onRetry={() => void books.refetch()}
        onAction={(b) =>
          b.status === 'taken_down' || b.status === 'rejected'
            ? toast({ message: 'Write to authors@arpedia.africa with the book title to appeal' })
            : submit()
        }
      />
    </Screen>
  );
}

function toModel(b: StudioBook, suspended: boolean): StudioBookModel {
  const line = studioBookLine(b.author_status, b.revision_no, b.live_revision_no);
  const isLive = b.author_status === 'live' || b.author_status.startsWith('update_');
  const meta = [
    b.chapters ? `${num(b.chapters)} chapter${b.chapters === 1 ? '' : 's'}` : null,
    b.price_credits ? `${num(b.price_credits)} credits` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  let soft: string | null = line.note;
  let update: string | null = null;
  if (isLive) {
    soft = meta || null;
    update = line.note;
  } else if (b.author_status === 'draft') {
    soft = `Uploaded ${shortDate(b.updated_at)}. ${line.note}.`;
  } else if (b.author_status === 'changes_requested') {
    soft = null;
  } else if (b.author_status === 'taken_down' && b.unpublish_reason) {
    soft = `Taken down: ${b.unpublish_reason.replace(/_/g, ' ')}. ${line.note}.`;
  } else if (soft) {
    soft = `${soft}.`;
  }
  return {
    id: b.book_id,
    title: b.title,
    tone: toneFor(b.book_id),
    status: b.author_status,
    label: line.label,
    line: soft,
    update,
    issues: b.author_status === 'changes_requested' ? b.issues.map((i) => `Editor: ${i}`) : [],
    // Suspended authors keep live books readable but cannot upload (States: edge cases).
    action: suspended && line.action !== 'How to appeal' ? null : line.action,
  };
}
