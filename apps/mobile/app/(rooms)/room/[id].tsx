import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Btn,
  EmptyState,
  IconButton,
  Press,
  Sheet,
  Text,
  useBottomInset,
  useTheme,
  useToast,
} from '@arpedia/ui';
import {
  ROOM_NEW_ACCOUNT_COPY,
  behindLine,
  chatTime,
  isSpoiler,
  messageSpoilerChapter,
  postBlockCopy,
  sendErrorCopy,
  type ChatMessage,
  type PostBlock,
  type Reaction,
} from '@arpedia/core';
import { useSession } from '../../../features/01/session';
import {
  Bubble,
  ChatSkeleton,
  ComposerNote,
  DayMarker,
  type BubbleView,
} from '../../../features/06/ChatViews';
import {
  OptionList,
  ReactionRow,
  ReportBody,
  type OptionItem,
  type ReportReason,
} from '../../../features/06/SheetViews';
import { useChat, useChatAction, useMarkRead, useMergedMessages } from '../../../features/06/chat';
import { useTrack as useCommunityTrack } from '../../../features/06/analytics';
import { toneFor } from '../../../features/06/data';
import { useTrack as useRoomsTrack } from '../../../features/07/analytics';
import {
  AnnotationsList,
  AnnotationsLocked,
  ConfirmBody,
  MemberRow,
  MembersSkeleton,
  NoteLine,
  RoomActions,
  RoomComposer,
  RoomHead,
  RoomTabs,
  SpoilerBubble,
  type AnnotationView,
  type MemberChip,
  type MemberRowView,
  type RoomTab,
} from '../../../features/07/RoomViews';
import {
  coverToneFor,
  finishedLabel,
  roomDayLabel,
  roomShareMessage,
  useApplyRoomProgress,
  useRoom,
  useRoomActions,
  useRoomAnnotations,
  useRoomHistory,
  useRoomMembers,
  useStampRefresh,
  type RoomMessage,
} from '../../../features/07/data';

type Item =
  | { key: string; day: string }
  | { key: string; bubble: BubbleView; msg?: RoomMessage }
  | {
      key: string;
      spoiler: {
        name: string;
        avatar: string | null;
        tone: BubbleView['senderTone'];
        chapter: number;
        time: string;
      };
    };

// A live message has no spoiler stamp until Postgres saves it. Its text waits that long (rule 18), and
// shows after this if the stamp never comes (unknown sender chapter counts as 0: Spoiler edge cases).
const STAMP_WAIT_MS = 30_000;

/** Someone else's live message whose stamp hasn't arrived (history always carries one). */
function awaitingStamp(m: RoomMessage, me: string | undefined, now: number): boolean {
  return (
    m.sender_id !== me &&
    m.spoiler_chapter == null &&
    m.state === 'visible' &&
    m.kind !== 'system' &&
    now - Date.parse(m.created_at) < STAMP_WAIT_MS
  );
}

const MUTE_OPTIONS = [
  { label: 'For 1 hour', until: () => new Date(Date.now() + 3_600_000).toISOString() },
  { label: 'For 24 hours', until: () => new Date(Date.now() + 86_400_000).toISOString() },
  { label: 'For the rest of the room', until: () => 'infinity' },
];

function reactionLine(r: ChatMessage['reactions']): string | undefined {
  const parts = Object.entries(r).filter(([, n]) => (n ?? 0) > 0);
  return parts.length ? parts.map(([e, n]) => `${e} ${n}`).join(' · ') : undefined;
}

/** s-room: progress header, then Chat, Annotations and Members. */
export default function RoomScreen() {
  const { id: gid, share } = useLocalSearchParams<{ id: string; share?: string }>();
  const { c, s } = useTheme();
  const toast = useToast();
  const track06 = useCommunityTrack();
  const session = useSession();
  const me = session?.user.id;
  const net = useNetInfo();
  const offline = net.isConnected === false;
  const bottom = useBottomInset(24);
  // Lift the composer above the keyboard ourselves. KeyboardAvoidingView (height) kept a stale
  // height when the room opened while the create form's keyboard was closing, leaving the
  // composer stuck mid-screen.
  const win = useWindowDimensions();
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKb(Math.max(0, win.height - e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [win.height]);

  const roomQ = useRoom(gid);
  const room = roomQ.data;
  const history = useRoomHistory(gid);
  const applyProgress = useApplyRoomProgress(gid);
  const chat = useChat(
    gid,
    (e, wait) => {
      if (e === 'slow_mode') return toast({ message: postBlockCopy('slow_mode', { waitSeconds: wait }) });
      toast({ message: sendErrorCopy(e) });
    },
    applyProgress,
  );
  const action = useChatAction(gid);
  const acts = useRoomActions(gid);
  const track = useRoomsTrack();
  const stampRefresh = useStampRefresh(gid);
  const merged = useMergedMessages(history.data, chat.pending);
  const list = merged.list as RoomMessage[];
  const pending = merged.pending;

  const [tab, setTab] = useState<RoomTab>('chat');
  const members = useRoomMembers(gid, tab === 'members');
  const annotations = useRoomAnnotations(gid, tab === 'annotations');

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [muting, setMuting] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<'end' | 'leave' | null>(null);
  // "Tap to show" lasts until the reader leaves the chat (rule 18).
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(false);
  const listRef = useRef<FlatList<Item>>(null);

  const newest = list[list.length - 1];
  useMarkRead(gid, atBottom && tab === 'chat' ? newest?.id : undefined, !!room);

  // A live message has no spoiler stamp yet: read it from Postgres once it is saved.
  const newestId = newest?.id;
  const newestStamped = newest?.spoiler_chapter != null || newest?.sender_id === me;
  useEffect(() => {
    if (newestId && !newestStamped) stampRefresh();
  }, [newestId, newestStamped, stampRefresh]);
  // Until every live message is stamped, ask again every 3 s (the save can lag the socket).
  const [now, setNow] = useState(() => Date.now());
  const waiting = list.some((m) => awaitingStamp(m, me, now));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      stampRefresh();
      setNow(Date.now());
    }, 3000);
    return () => clearInterval(t);
  }, [waiting, stampRefresh]);

  const count = list.length + pending.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      if (atBottom) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      else setUnseen(true);
    }
    prevCount.current = count;
  }, [count, atBottom]);

  // Analytics: annotations open once the reader finishes; finishing while the room is open.
  const unlockedSent = useRef(false);
  const annotationsLocked = annotations.data?.locked;
  useEffect(() => {
    if (annotationsLocked === false && !unlockedSent.current) {
      unlockedSent.current = true;
      track('room_annotations_unlocked');
    }
  }, [annotationsLocked, track]);
  const wasFinished = useRef<boolean | null>(null);
  const myFinished = room?.my_finished;
  useEffect(() => {
    if (myFinished == null) return;
    if (wasFinished.current === false && myFinished) track('room_finished_by_member');
    wasFinished.current = myFinished;
  }, [myFinished, track]);

  // After create: the system share sheet with the code (rule 9), once.
  const shared = useRef(false);
  useEffect(() => {
    if (share === '1' && room && !shared.current) {
      shared.current = true;
      void Share.share({ message: roomShareMessage(room.code) });
    }
  }, [share, room]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let lastDay = '';
    const push = (at: string, item: Item) => {
      const d = roomDayLabel(at);
      if (d !== lastDay) out.push({ key: `day-${at}`, day: d });
      lastDay = d;
      out.push(item);
    };
    const viewerChapter = room?.my_chapter ?? 0;
    // A sender the header shows at or behind the viewer can't be ahead, so their text shows at once.
    const behindMe = new Set(
      (room?.header ?? []).filter((h) => h.percent <= (room?.my_percent ?? 0)).map((h) => h.user_id),
    );
    for (const m of list) {
      const mine = m.sender_id === me;
      const hold = awaitingStamp(m, me, now) && !revealed.has(m.id) && !behindMe.has(m.sender_id ?? '');
      const chapter = messageSpoilerChapter({ spoiler_chapter: m.spoiler_chapter, quote: m.quote });
      if (
        !mine &&
        m.state === 'visible' &&
        m.kind !== 'system' &&
        !revealed.has(m.id) &&
        isSpoiler(chapter, viewerChapter)
      ) {
        push(m.created_at, {
          key: m.id,
          spoiler: {
            name: m.sender_name,
            avatar: m.sender_avatar,
            tone: toneFor(m.sender_id ?? m.id),
            chapter,
            time: chatTime(m.created_at),
          },
        });
        continue;
      }
      push(m.created_at, {
        key: m.id,
        msg: m,
        bubble: {
          key: m.id,
          me: mine,
          senderName: m.sender_name,
          senderTone: toneFor(m.sender_id ?? m.id),
          senderAvatar: m.sender_avatar,
          author: m.sender_is_author,
          body: hold
            ? null
            : m.state === 'visible'
              ? m.kind === 'quote' && !m.body && m.quote
                ? ''
                : m.body
              : null,
          muted: hold
            ? 'Checking for spoilers…'
            : m.state === 'removed'
              ? 'Removed by a moderator'
              : 'This message was deleted',
          quote:
            !hold && m.state === 'visible' && m.quote
              ? {
                  text: `“${m.quote.text}”`,
                  source: [m.quote.book_title, `Ch. ${m.quote.chapter}`].filter(Boolean).join(' · '),
                }
              : null,
          reply: m.reply_to
            ? m.reply_to.state === 'blocked'
              ? 'Message from a blocked person'
              : m.reply_to.body
                ? `${m.reply_to.sender_name}: ${m.reply_to.body}`
                : 'Deleted message'
            : null,
          time: chatTime(m.created_at),
          reactions: reactionLine(m.reactions),
        },
      });
    }
    for (const p of pending)
      push(p.at, {
        key: p.client_id,
        bubble: {
          key: p.client_id,
          me: true,
          senderName: 'You',
          senderTone: 'n',
          author: false,
          body: p.body,
          time: chatTime(p.at),
          sending: p.status === 'sending',
          failed: p.status === 'failed' ? 'Not sent. Tap to retry' : undefined,
        },
      });
    return out;
  }, [list, pending, me, room?.my_chapter, room?.my_percent, room?.header, revealed, now]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/rooms'));

  // Composer: who may post, and why not.
  const ended = room?.state === 'ended';
  const rawBlock: string | null = chat.block
    ? (chat.block.reason ?? (room?.post_block === 'new_account' ? 'new_account' : null))
    : (room?.post_block ?? null);
  const blockUntil = chat.block?.until ?? room?.post_block_until ?? null;
  const composerNote = !room
    ? null
    : offline
      ? 'Connect to do this'
      : ended
        ? 'This room has ended. Chat is read-only.'
        : rawBlock === 'new_account'
          ? ROOM_NEW_ACCOUNT_COPY
          : rawBlock === 'locked'
            ? room.locked_by_staff
              ? 'Arpedia staff locked the chat'
              : 'The host locked the chat'
            : rawBlock
              ? postBlockCopy(rawBlock as PostBlock, { until: blockUntil })
              : null;

  const send = () => {
    const body = text.trim();
    if (!body) return;
    if (!chat.send(body, { reply_to_id: replyTo?.id ?? null }))
      return toast({ message: 'You can queue up to 5 messages while offline.' });
    track('room_message_sent');
    setText('');
    setReplyTo(null);
  };

  const run = (a: Parameters<typeof action.mutate>[0], done?: string) =>
    action.mutate(a, {
      onSuccess: () => done && toast({ message: done }),
      onError: (e) =>
        toast({
          message: /already/i.test(String((e as Error).message))
            ? 'You already reported this.'
            : "That didn't work. Try again.",
        }),
    });

  const fail = () => toast({ message: "That didn't work. Try again." });

  // ─── Header chips ─────────────────────────────────────────────────────────
  const myName = String(session?.user.user_metadata?.full_name ?? 'You');
  const chips = useMemo<MemberChip[]>(() => {
    if (!room) return [];
    const label = (name: string, pct: number, done: boolean) =>
      `${name} · ${done ? 'done' : `${Math.round(pct)}%`}`;
    if (room.large)
      return [
        {
          id: 'me',
          name: myName,
          tone: toneFor(me ?? 'me'),
          percent: room.my_percent,
          label: label('You', room.my_percent, room.my_finished),
        },
      ];
    return room.header.map((h) => ({
      id: h.user_id,
      name: h.name,
      avatarUrl: h.avatar_url,
      tone: toneFor(h.user_id),
      percent: h.finished ? 100 : h.percent,
      label: label(h.user_id === me ? 'You' : (h.name.split(/\s+/)[0] ?? h.name), h.percent, h.finished),
    }));
  }, [room, me, myName]);

  const note = !room
    ? null
    : room.book.status && room.book.status !== 'live'
      ? 'This book was taken down'
      : offline && room.progress_updated_at
        ? `Updated ${chatTime(room.progress_updated_at)}`
        : null;

  // ─── Load error ───────────────────────────────────────────────────────────
  if (roomQ.isError && !room) {
    const gone = /not_found|P0002/.test(
      String((roomQ.error as { message?: string; code?: string })?.message ?? ''),
    );
    return (
      <View style={{ flex: 1, backgroundColor: c.org }}>
        <StatusBar style={c.onOrg === '#FFFFFF' ? 'light' : 'dark'} />
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: s(6), paddingBottom: s(8) }}>
            <IconButton icon="back" label="Back" onPress={back} color={c.onOrg} />
          </View>
          <View style={{ flex: 1, backgroundColor: c.white }}>
            <EmptyState
              title={gone ? "This room isn't available" : "Couldn't load this room"}
              body={
                gone ? 'You may have left it, or it was removed.' : 'Check your connection and try again.'
              }
              action={
                gone
                  ? { label: 'Back to rooms', onPress: () => router.replace('/rooms') }
                  : { label: 'Try again', onPress: () => void roomQ.refetch() }
              }
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Message actions (flow 06 rules) ──────────────────────────────────────
  const actions: OptionItem[] = selected
    ? [
        { key: 'reply', title: 'Reply', onPress: () => (setReplyTo(selected), setSelected(null)) },
        {
          key: 'copy',
          title: 'Copy text',
          onPress: () => {
            void Clipboard.setStringAsync(selected.body ?? selected.quote?.text ?? '');
            setSelected(null);
            toast({ message: 'Copied' });
          },
        },
        ...(selected.sender_id === me
          ? [
              {
                key: 'delete',
                title: 'Delete',
                danger: true,
                onPress: () => {
                  run({ type: 'delete', message_id: selected.id });
                  setSelected(null);
                },
              },
            ]
          : [
              {
                key: 'report',
                title: 'Report or block',
                sub: selected.sender_name,
                danger: true,
                onPress: () => {
                  setReporting(selected);
                  track06('report_started', { content_type: 'message' });
                  setReason(null);
                  setDetails('');
                  setAlsoBlock(false);
                  setSelected(null);
                },
              },
            ]),
      ]
    : [];

  // ─── Members ──────────────────────────────────────────────────────────────
  const memberRows: MemberRowView[] = (members.data?.pages.flat() ?? []).map((m) => ({
    id: m.user_id,
    name: m.name,
    avatarUrl: m.avatar_url,
    tone: toneFor(m.user_id),
    host: m.is_host,
    me: m.is_me,
    percent: Number(m.percent),
    finished: m.finished_at ? finishedLabel(m.finished_at) : null,
    muted: !!m.muted_until && new Date(m.muted_until) > new Date(),
  }));

  const annotationRows: AnnotationView[] = (annotations.data?.items ?? []).map((a) => {
    const q = typeof a.quote === 'string' ? { text: a.quote } : a.quote;
    return {
      id: a.id,
      name: a.name,
      quote: q?.text ?? null,
      note: a.note,
      source: q && 'chapter' in q && q.chapter ? `Ch. ${q.chapter}` : null,
    };
  });

  const bookTitle = room?.book.title ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: c.org }}>
      <StatusBar style={c.onOrg === '#FFFFFF' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <RoomHead
          name={room?.name ?? ''}
          book={bookTitle}
          code={room?.code ?? ''}
          tone={coverToneFor(room?.book.id ?? gid)}
          members={chips}
          loading={roomQ.isPending}
          largeLine={room?.large ? `${room.finished_count} of ${room.member_count} finished` : null}
          note={note}
          onBack={back}
          onShare={() => room && void Share.share({ message: roomShareMessage(room.code) })}
        />
        <RoomTabs
          active={tab}
          onChange={setTab}
          locked={annotations.data ? annotations.data.locked : !room?.my_finished}
          members={room?.member_count ?? 0}
        />

        {tab === 'chat' ? (
          <View style={{ flex: 1, backgroundColor: c.white, paddingBottom: kb }}>
            {offline ? (
              <View style={{ backgroundColor: c.warnT, paddingVertical: s(8), paddingHorizontal: s(16) }}>
                <Text size={13} color={c.warnInk} oneLine>
                  Offline. Showing what was saved.
                </Text>
              </View>
            ) : null}
            {room && behindLine(room.behind) ? <NoteLine>{behindLine(room.behind)!}</NoteLine> : null}
            {history.isPending ? (
              <View style={{ flex: 1 }}>
                <ChatSkeleton />
              </View>
            ) : history.isError && !history.data ? (
              <View style={{ flex: 1 }}>
                <EmptyState
                  title="Couldn't load messages"
                  body="Check your connection and try again."
                  action={{ label: 'Try again', onPress: () => void history.refetch() }}
                />
              </View>
            ) : items.length === 0 ? (
              // Fill the chat area so the composer stays at the bottom.
              <View style={{ flex: 1 }}>
                <EmptyState title="Say hello." body="Everyone's progress is above." />
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={items}
                keyExtractor={(i) => i.key}
                contentContainerStyle={{ gap: s(10), paddingVertical: s(14), paddingHorizontal: s(12) }}
                onContentSizeChange={() => atBottom && listRef.current?.scrollToEnd({ animated: false })}
                onScroll={(e) => {
                  const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                  const bottomNow = contentOffset.y + layoutMeasurement.height >= contentSize.height - s(40);
                  setAtBottom(bottomNow);
                  if (bottomNow) setUnseen(false);
                }}
                scrollEventThrottle={100}
                renderItem={({ item }) =>
                  'day' in item ? (
                    <DayMarker label={item.day} />
                  ) : 'spoiler' in item ? (
                    <SpoilerBubble
                      name={item.spoiler.name}
                      avatarUrl={item.spoiler.avatar}
                      tone={item.spoiler.tone}
                      chapter={item.spoiler.chapter}
                      time={item.spoiler.time}
                      onReveal={() => {
                        track('room_spoiler_revealed');
                        setRevealed((r) => new Set(r).add(item.key));
                      }}
                    />
                  ) : (
                    <Bubble
                      m={item.bubble}
                      onLongPress={
                        item.msg && item.msg.state === 'visible' ? () => setSelected(item.msg!) : undefined
                      }
                      onRetry={() => chat.retrySend(item.key)}
                    />
                  )
                }
              />
            )}
            {unseen ? (
              <Press
                onPress={() => {
                  listRef.current?.scrollToEnd({ animated: true });
                  setUnseen(false);
                }}
                accessibilityRole="button"
                style={{
                  position: 'absolute',
                  alignSelf: 'center',
                  bottom: s(84) + bottom,
                  backgroundColor: c.night,
                  borderRadius: 999,
                  paddingVertical: s(8),
                  paddingHorizontal: s(14),
                }}
              >
                <Text size={13} weight={600} color="#FFFFFF" oneLine>
                  New messages
                </Text>
              </Press>
            ) : null}
            {replyTo && !composerNote ? (
              <ComposerNote
                text={`Replying to ${replyTo.sender_name}: ${(replyTo.body ?? '').replace(/\s+/g, ' ')}`}
                action={{ label: 'Cancel', onPress: () => setReplyTo(null) }}
                bottom={s(8)}
              />
            ) : null}
            {composerNote ? (
              <ComposerNote text={composerNote} bottom={bottom} />
            ) : room ? (
              <RoomComposer value={text} onChange={setText} onSend={send} bottom={kb ? s(8) : bottom} />
            ) : null}
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1, backgroundColor: c.white }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {tab === 'annotations' ? (
              annotations.isPending ? (
                <MembersSkeleton />
              ) : annotations.isError && !annotations.data ? (
                <EmptyState
                  title="Couldn't load annotations"
                  body="Check your connection and try again."
                  action={{ label: 'Try again', onPress: () => void annotations.refetch() }}
                />
              ) : annotations.data?.locked ? (
                <AnnotationsLocked
                  book={bookTitle}
                  percent={annotations.data.percent}
                  onContinue={() =>
                    room && router.push({ pathname: '/read/[id]', params: { id: room.book.id } })
                  }
                />
              ) : annotationRows.length === 0 ? (
                <EmptyState title="Nobody has shared a highlight yet." />
              ) : (
                <AnnotationsList items={annotationRows} />
              )
            ) : members.isPending ? (
              <MembersSkeleton />
            ) : members.isError && !members.data ? (
              <EmptyState
                title="Couldn't load members"
                body="Check your connection and try again."
                action={{ label: 'Try again', onPress: () => void members.refetch() }}
              />
            ) : (
              <>
                <View style={{ paddingTop: s(8), backgroundColor: c.white }}>
                  {memberRows.map((m, i) => (
                    <MemberRow
                      key={m.id}
                      m={m}
                      divider={i > 0}
                      canMute={!!room?.is_host && !ended && !offline}
                      onMute={() =>
                        m.muted
                          ? acts.mute.mutate(
                              { user: m.id, until: null },
                              {
                                onSuccess: () => toast({ message: `${m.name} can post again.` }),
                                onError: fail,
                              },
                            )
                          : setMuting({ id: m.id, name: m.name })
                      }
                    />
                  ))}
                </View>
                {members.hasNextPage ? (
                  <View style={{ alignItems: 'center', paddingTop: s(12) }}>
                    <Btn
                      label="Show more"
                      variant="g"
                      size="md"
                      loading={members.isFetchingNextPage}
                      onPress={() => void members.fetchNextPage()}
                    />
                  </View>
                ) : null}
                <RoomActions
                  host={!!room?.is_host}
                  ended={!!ended}
                  locked={!!room?.locked}
                  lockedByStaff={!!room?.locked_by_staff}
                  offline={offline}
                  onLock={() =>
                    acts.lock.mutate(!room?.locked, {
                      onSuccess: () => toast({ message: room?.locked ? 'Chat unlocked.' : 'Chat locked.' }),
                      onError: fail,
                    })
                  }
                  onEnd={() => setConfirm('end')}
                  onLeave={() => setConfirm('leave')}
                />
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <ReactionRow
              mine={selected.my_reaction}
              disabled={offline}
              onReact={(r: Reaction) => {
                run({ type: 'react', message_id: selected.id, emoji: selected.my_reaction === r ? null : r });
                setSelected(null);
              }}
            />
            {offline ? (
              <Text size={12} color="ink3">
                Connect to do this
              </Text>
            ) : null}
            <OptionList items={actions} />
          </>
        ) : null}
      </Sheet>

      <Sheet open={!!reporting} onClose={() => setReporting(null)} title="Why are you reporting this?">
        {reporting ? (
          <ReportBody
            name={reporting.sender_name}
            reason={reason}
            details={details}
            alsoBlock={alsoBlock}
            canBlock
            sending={action.isPending}
            onReason={setReason}
            onDetails={setDetails}
            onAlsoBlock={setAlsoBlock}
            onCancel={() => setReporting(null)}
            onSend={() =>
              reason &&
              action.mutate(
                {
                  type: 'report',
                  message_id: reporting.id,
                  reason,
                  details: details.trim() || null,
                  also_block: alsoBlock,
                },
                {
                  onSuccess: () => {
                    setReporting(null);
                    void history.refetch();
                    toast({
                      message:
                        "Report sent. We'll look at it within 24 hours for serious reports and within 3 days for others.",
                    });
                  },
                  onError: (e) =>
                    toast({
                      message: /already/i.test(String((e as Error).message))
                        ? 'You already reported this.'
                        : "Couldn't send the report. Try again.",
                    }),
                },
              )
            }
          />
        ) : null}
      </Sheet>

      <Sheet
        open={!!muting}
        onClose={() => setMuting(null)}
        title={muting ? `Mute ${muting.name}` : undefined}
      >
        <OptionList
          items={MUTE_OPTIONS.map((o) => ({
            key: o.label,
            title: o.label,
            onPress: () => {
              const who = muting;
              if (!who) return;
              setMuting(null);
              acts.mute.mutate(
                { user: who.id, until: o.until() },
                { onSuccess: () => toast({ message: `${who.name} is muted.` }), onError: fail },
              );
            },
          }))}
        />
      </Sheet>

      <Sheet
        open={confirm === 'end'}
        onClose={() => setConfirm(null)}
        title="End room?"
        locked={acts.end.isPending}
      >
        <ConfirmBody
          text="Chat closes for everyone. The room and its progress stay visible."
          action="End room"
          busy={acts.end.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            acts.end.mutate(undefined, {
              onSuccess: () => {
                track('room_ended', { by: 'host' });
                setConfirm(null);
                toast({ message: 'Room ended.' });
              },
              onError: () => {
                setConfirm(null);
                fail();
              },
            })
          }
        />
      </Sheet>

      <Sheet
        open={confirm === 'leave'}
        onClose={() => setConfirm(null)}
        title="Leave room?"
        locked={acts.leave.isPending}
      >
        <ConfirmBody
          text={
            room?.is_host
              ? 'You will stop seeing this room. Hosting passes to the member who has been here longest.'
              : 'You will stop seeing this room. Your past messages stay unless you delete them.'
          }
          action="Leave room"
          busy={acts.leave.isPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            acts.leave.mutate(undefined, {
              onSuccess: () => {
                track('room_left');
                setConfirm(null);
                router.replace('/rooms');
              },
              onError: () => {
                setConfirm(null);
                fail();
              },
            })
          }
        />
      </Sheet>
    </View>
  );
}
