import { useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { avatarTone } from '../../../features/03/BookViews';
import { useInbox, type InboxRow as ServerRow } from '../../../features/06/data';
import { useOnline } from '../../../features/09/data';
import { STUDIO } from '../../../features/11/application';
import { StudioInboxView, type InboxFilter, type InboxRow } from '../../../features/11/StudioCommsViews';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "09:14" today, "Yesterday", then "10 Nov". */
function rowTime(at: string, now = new Date()) {
  const d = new Date(at);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff <= 0) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 1) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// A thread waits while the reader wrote last (flow 06 inbox: `last_sender` is "You" for the author).
const waits = (r: ServerRow) => r.last_sender != null && r.last_sender !== 'You';

/**
 * s-studio-inbox: the author's paid private messages (flow 08 `dm` groups they own), waiting first
 * and oldest first; replying is free for the author (rule 32) and happens in the thread.
 */
export default function StudioInbox() {
  const [filter, setFilter] = useState<InboxFilter>('waiting');
  const inbox = useInbox('all');
  const online = useOnline();
  const threads = (inbox.data ?? []).filter((r) => r.kind === 'dm' && r.role === 'owner');
  const waiting = threads.filter(waits);
  const shown =
    filter === 'waiting'
      ? [...waiting].sort((a, b) => a.last_at.localeCompare(b.last_at))
      : filter === 'replied'
        ? threads.filter((r) => !waits(r))
        : threads;
  const now = new Date();
  const rows: InboxRow[] = shown.map((r) => ({
    id: r.group_id,
    name: r.name,
    tone: avatarTone(r.other_user_id ?? r.group_id),
    preview: r.last_body ?? (r.last_state === 'visible' ? '' : 'Message removed'),
    time: rowTime(r.last_at, now),
  }));
  const state = inbox.data ? 'ready' : inbox.isError ? (online ? 'error' : 'offline') : 'loading';

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <StudioInboxView
        filter={filter}
        waiting={waiting.length}
        rows={rows}
        state={state}
        onFilter={setFilter}
        onRow={(id) => router.push(`/chat/${id}`)}
        onRetry={() => void inbox.refetch()}
        onBack={() => (router.canGoBack() ? router.back() : router.replace(STUDIO))}
      />
    </Screen>
  );
}
