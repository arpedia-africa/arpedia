import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useNetInfo } from '@react-native-community/netinfo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, Press, Sheet, Text, useBottomInset, useTheme, useToast } from '@arpedia/ui';
import {
  chatTime,
  dayLabel,
  memberCount,
  postBlockCopy,
  sendErrorCopy,
  type ChatMessage,
  type Reaction,
} from '@arpedia/core';
import { useSession } from '../../../features/01/session';
import {
  Bubble,
  ChatSkeleton,
  ComHead,
  ComPin,
  Composer,
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
import {
  useChat,
  useChatAction,
  useGroup,
  useGroupMembership,
  useHistory,
  useMarkRead,
  useMergedMessages,
} from '../../../features/06/chat';
import { toneFor } from '../../../features/06/data';

type Item = { key: string; day: string } | { key: string; bubble: BubbleView; msg?: ChatMessage };

const MUTE_OPTIONS: { label: string; ms: number | null }[] = [
  { label: 'Mute for 1 hour', ms: 3_600_000 },
  { label: 'Mute for 8 hours', ms: 8 * 3_600_000 },
  { label: 'Mute for 1 week', ms: 7 * 86_400_000 },
  { label: 'Until I turn it back on', ms: null },
];

function reactionLine(r: ChatMessage['reactions'], large: boolean): string | undefined {
  const parts = Object.entries(r).filter(([, n]) => (n ?? 0) > 0);
  if (!parts.length) return undefined;
  return parts.map(([e, n]) => (large ? `${e} ${memberCount(n!)}` : `${e} ${n}`)).join(' · ');
}

export default function Chat() {
  const { id: gid } = useLocalSearchParams<{ id: string }>();
  const { c, s } = useTheme();
  const toast = useToast();
  const session = useSession();
  const me = session?.user.id;
  const net = useNetInfo();
  const offline = net.isConnected === false;
  const bottom = useBottomInset(24);

  const group = useGroup(gid);
  const history = useHistory(gid);
  const chat = useChat(gid, (e, wait) => {
    if (e === 'slow_mode') return toast({ message: postBlockCopy('slow_mode', { waitSeconds: wait }) });
    toast({ message: sendErrorCopy(e) });
  });
  const action = useChatAction(gid);
  const membership = useGroupMembership(gid);
  const { list, pending } = useMergedMessages(history.data, chat.pending);
  const g = group.data;
  const large = (g?.member_count ?? 0) > 10_000;

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [menu, setMenu] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const listRef = useRef<FlatList<Item>>(null);

  const newest = list[list.length - 1];
  useMarkRead(gid, atBottom ? newest?.id : undefined, !!g?.is_member);

  // New messages while scrolled up: show the pill instead of jumping (rule 17).
  const count = list.length + pending.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current) {
      if (atBottom) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      else setUnseen(true);
    }
    prevCount.current = count;
  }, [count, atBottom]);

  // Slow mode countdown (rule 15).
  const slow = g?.slow_mode_seconds ?? 0;
  const wait = slow > 0 && chat.lastSentAt ? Math.ceil(slow - (now - chat.lastSentAt) / 1000) : 0;
  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wait]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let lastDay = '';
    const push = (at: string, item: Item) => {
      const d = dayLabel(at);
      if (d !== lastDay) out.push({ key: `day-${at}`, day: d });
      lastDay = d;
      out.push(item);
    };
    for (const m of list) {
      const mine = m.sender_id === me;
      const body = m.state === 'visible' ? m.body : null;
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
          body: m.kind === 'quote' && !m.body && m.quote ? '' : body,
          muted: m.state === 'removed' ? 'Removed by a moderator' : 'This message was deleted',
          quote:
            m.state === 'visible' && m.quote
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
          reactions: reactionLine(m.reactions, large),
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
  }, [list, pending, me, large]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/community'));

  // Composer: who may post, and why not (rule 14).
  const blockReason = chat.block?.reason ?? g?.post_block ?? null;
  const blockUntil = chat.block?.until ?? g?.post_block_until ?? null;
  const composerNote = !g
    ? null
    : !g.is_member
      ? postBlockCopy('not_member')
      : blockReason
        ? postBlockCopy(blockReason, { until: blockUntil })
        : wait > 0
          ? postBlockCopy('slow_mode', { waitSeconds: wait })
          : null;

  const send = () => {
    const body = text.trim();
    if (!body) return;
    if (!chat.send(body, { reply_to_id: replyTo?.id ?? null }))
      return toast({ message: 'You can queue up to 5 messages while offline.' });
    setText('');
    setReplyTo(null);
    // Your own message always jumps to the end, even when you were scrolled up.
    setAtBottom(true);
    setUnseen(false);
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

  const canModerate = g?.role === 'owner' || g?.role === 'moderator';
  const actions: OptionItem[] = selected
    ? [
        { key: 'reply', title: 'Reply', onPress: () => (setReplyTo(selected), setSelected(null)) },
        ...(g?.visibility === 'public'
          ? [
              {
                key: 'share',
                title: 'Share',
                onPress: () => {
                  setSelected(null);
                  void Share.share({ message: `${selected.body ?? ''}\n\narpedia.africa/c/${gid}` });
                },
              },
            ]
          : []),
        ...(canModerate
          ? [
              {
                key: 'pin',
                title: selected.pinned ? 'Unpin' : 'Pin',
                onPress: () => {
                  run({ type: selected.pinned ? 'unpin' : 'pin', message_id: selected.id });
                  setSelected(null);
                },
              },
            ]
          : []),
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
                  setReason(null);
                  setDetails('');
                  setAlsoBlock(false);
                  setSelected(null);
                },
              },
            ]),
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.org }}>
      <StatusBar style={c.onOrg === '#FFFFFF' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ComHead
          name={g?.name ?? ''}
          tone={toneFor(gid)}
          avatarUrl={g?.avatar_url}
          person={g?.kind === 'dm'}
          status={
            g
              ? [
                  !large && (chat.readingNow ?? g.live_count) > 0
                    ? `${chat.readingNow ?? g.live_count} reading now`
                    : null,
                  `${memberCount(g.member_count)} members`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : ''
          }
          onBack={back}
          onInfo={() => setMenu(true)}
        />
        <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: c.white }}>
          {offline ? (
            <View style={{ backgroundColor: c.warnT, paddingVertical: s(8), paddingHorizontal: s(16) }}>
              <Text size={13} color={c.warnInk} oneLine>
                Offline. Messages send when you're back.
              </Text>
            </View>
          ) : null}
          {g?.weekly ? (
            <ComPin
              title={`This week: ${g.weekly.title} ch. ${g.weekly.from}–${g.weekly.to}`}
              note={g.weekly.note}
              onPress={() => toast({ message: 'The reader comes in a later part of the build.' })}
            />
          ) : null}
          {g && g.blocked_here > 0 ? (
            <Text size={12} color="ink3" center style={{ paddingTop: s(8) }}>
              {`You blocked ${g.blocked_here} member${g.blocked_here === 1 ? '' : 's'} here.`}
            </Text>
          ) : null}
          {history.isPending ? (
            <ChatSkeleton />
          ) : history.isError && !history.data ? (
            <EmptyState
              title="Couldn't load messages"
              body="Check your connection and try again."
              action={{ label: 'Try again', onPress: () => void history.refetch() }}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="Be the first to say something"
              body={g?.kind === 'author' ? 'Introduce yourself to the author and other readers.' : undefined}
            />
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
            <ComposerNote
              text={composerNote}
              action={
                g && !g.is_member && g.visibility === 'public'
                  ? { label: 'Join', onPress: () => membership.join.mutate() }
                  : undefined
              }
              bottom={bottom}
            />
          ) : g ? (
            <Composer
              value={text}
              onChange={setText}
              onSend={send}
              onPlus={() => toast({ message: 'Share a highlight from the reader.' })}
              placeholder={`Message ${g.name}`}
              bottom={bottom}
            />
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <ReactionRow
              mine={selected.my_reaction}
              disabled={offline || !g?.is_member}
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
            canBlock={reporting.sender_name !== 'Arpedia Team'}
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

      <Sheet open={menu} onClose={() => setMenu(false)} title={g?.name}>
        <OptionList
          items={[
            ...(g?.notify_muted_until && new Date(g.notify_muted_until) > new Date()
              ? [
                  {
                    key: 'unmute',
                    title: 'Turn notifications back on',
                    onPress: () => {
                      membership.mute.mutate(null);
                      setMenu(false);
                    },
                  },
                ]
              : MUTE_OPTIONS.map((o) => ({
                  key: o.label,
                  title: o.label,
                  onPress: () => {
                    membership.mute.mutate(
                      new Date(o.ms === null ? Date.UTC(9999, 0, 1) : Date.now() + o.ms).toISOString(),
                    );
                    setMenu(false);
                    toast({ message: 'Notifications muted. Messages still arrive.' });
                  },
                }))),
            ...(g?.is_member && g.role !== 'owner'
              ? [
                  {
                    key: 'leave',
                    title: 'Leave',
                    danger: true,
                    onPress: () => {
                      setMenu(false);
                      membership.leave.mutate(undefined, { onSuccess: back });
                    },
                  },
                ]
              : []),
          ]}
        />
      </Sheet>
    </View>
  );
}
