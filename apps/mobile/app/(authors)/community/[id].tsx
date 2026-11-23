import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, Sheet, Text, useBottomInset, useTheme, useToast } from '@arpedia/ui';
import {
  chatTime,
  dayLabel,
  MESSAGE_MAX,
  memberCount,
  postBlockCopy,
  sendErrorCopy,
  type ChatMessage,
  type Reaction,
} from '@arpedia/core';
import { avatarTone } from '../../../features/03/BookViews';
import { useOnline } from '../../../features/03/book';
import { useSession } from '../../../features/01/session';
import {
  Bubble,
  ChatSkeleton,
  ComPin,
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
import { DmComposer, DmHead, DmIntro } from '../../../features/08/DmViews';
import { useAuthorProfile } from '../../../features/08/data';

type Item = { key: string; day: string } | { key: string; bubble: BubbleView; msg?: ChatMessage };

const MUTE_OPTIONS: { label: string; ms: number | null }[] = [
  { label: 'Mute for 1 hour', ms: 3_600_000 },
  { label: 'Mute for 8 hours', ms: 8 * 3_600_000 },
  { label: 'Mute for 1 week', ms: 7 * 86_400_000 },
  { label: 'Until I turn it back on', ms: null },
];

function reactionLine(r: ChatMessage['reactions']): string | undefined {
  const parts = Object.entries(r).filter(([, n]) => (n ?? 0) > 0);
  if (!parts.length) return undefined;
  return parts.map(([e, n]) => `${e} ${memberCount(n!)}`).join(' · ');
}

/**
 * s-author-community (rules 18–21): the author's public group chat. Chat runs as flow 06
 * (history, socket, sends, actions); this screen adds the host intro, "Messages here are free"
 * and the author's pinned post on top.
 */
export default function AuthorCommunity() {
  const { id: gid } = useLocalSearchParams<{ id: string }>();
  const { c, s } = useTheme();
  const toast = useToast();
  const me = useSession()?.user.id;
  const online = useOnline();
  const bottom = useBottomInset(24);

  const group = useGroup(gid);
  const g = group.data;
  const authorId = g?.owner_id ?? '';
  const author = useAuthorProfile(authorId);
  const a = author.data;
  const history = useHistory(gid);
  const chat = useChat(gid, (e, wait) => {
    if (e === 'slow_mode') return toast({ message: postBlockCopy('slow_mode', { waitSeconds: wait }) });
    toast({ message: sendErrorCopy(e) });
  });
  const action = useChatAction(gid);
  const membership = useGroupMembership(gid);
  const { list, pending } = useMergedMessages(history.data, chat.pending);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [menu, setMenu] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [now, setNow] = useState(Date.now());
  const listRef = useRef<FlatList<Item>>(null);

  useMarkRead(gid, atBottom ? list[list.length - 1]?.id : undefined, !!g?.is_member);

  const count = list.length + pending.length;
  const prevCount = useRef(count);
  useEffect(() => {
    if (count > prevCount.current && atBottom)
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    prevCount.current = count;
  }, [count, atBottom]);

  const slow = g?.slow_mode_seconds ?? 0;
  const wait = slow > 0 && chat.lastSentAt ? Math.ceil(slow - (now - chat.lastSentAt) / 1000) : 0;
  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [wait]);

  // Rule 19: the author's newest pinned message sits on top of the chat.
  const pinned = useMemo(
    () =>
      [...list]
        .reverse()
        .find((m) => m.pinned && m.state === 'visible' && (m.sender_id === authorId || m.sender_is_author)),
    [list, authorId],
  );

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
      push(m.created_at, {
        key: m.id,
        msg: m,
        bubble: {
          key: m.id,
          me: m.sender_id === me,
          senderName: m.sender_name,
          senderTone: m.sender_id === authorId ? avatarTone(authorId) : toneFor(m.sender_id ?? m.id),
          senderAvatar: m.sender_avatar,
          author: m.sender_is_author,
          body: m.kind === 'quote' && !m.body && m.quote ? '' : m.state === 'visible' ? m.body : null,
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
  }, [list, pending, me, authorId]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/community'));
  const profile = () => authorId && router.push({ pathname: '/author/[id]', params: { id: authorId } });

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
    setAtBottom(true);
  };

  const run = (x: Parameters<typeof action.mutate>[0]) =>
    action.mutate(x, { onError: () => toast({ message: "That didn't work. Try again." }) });

  const canModerate = g?.role === 'owner' || g?.role === 'moderator';
  const actions: OptionItem[] = selected
    ? [
        { key: 'reply', title: 'Reply', onPress: () => (setReplyTo(selected), setSelected(null)) },
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
        ...(selected.sender_id === me || canModerate
          ? [
              {
                key: 'delete',
                title: selected.sender_id === me ? 'Delete' : 'Remove message',
                danger: true,
                onPress: () => {
                  run({ type: 'delete', message_id: selected.id });
                  setSelected(null);
                },
              },
            ]
          : []),
        ...(selected.sender_id !== me
          ? [
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
            ]
          : []),
      ]
    : [];

  const hostName = a?.name ?? g?.name ?? '';
  const intro = (
    <>
      {/* .com-intro sits outside .chat: undo the list's 12px sides; 6 + 4 + gap 10 = .chat's 14 top. */}
      <View style={{ marginHorizontal: -s(12), marginBottom: s(4) }}>
        <DmIntro
          name={hostName}
          tone={avatarTone(authorId || gid)}
          avatarUrl={a?.avatar_url ?? null}
          sub="Public community · hosted by this author"
          notice="Public community chat for readers following this author. Messages here are free."
          onProfile={profile}
        />
      </View>
      {history.isPending ? (
        <ChatSkeleton />
      ) : history.isError && !history.data ? (
        <EmptyState
          title="Couldn’t load messages"
          body="Check your connection and try again."
          action={{ label: 'Try again', onPress: () => void history.refetch() }}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Be the first to say something"
          body="Introduce yourself to the author and other readers."
        />
      ) : null}
    </>
  );

  if (!g) {
    return (
      <View style={{ flex: 1, backgroundColor: c.org }}>
        <StatusBar style={c.onOrg === '#FFFFFF' ? 'light' : 'dark'} />
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <DmHead name="" tone={avatarTone(gid)} status="" onBack={back} square />
          <View style={{ flex: 1, backgroundColor: c.white, justifyContent: 'center' }}>
            {group.isPending ? (
              <ChatSkeleton />
            ) : (
              <EmptyState
                title="Couldn’t load this community"
                body={
                  online
                    ? 'Something went wrong on our side. Try again.'
                    : 'You’re offline. Connect and try again.'
                }
                action={{ label: 'Try again', onPress: () => void group.refetch() }}
              />
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.org }}>
      <StatusBar style={c.onOrg === '#FFFFFF' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <DmHead
          name={g.name}
          tone={avatarTone(authorId || gid)}
          avatarUrl={g.avatar_url}
          status={`Public community · ${memberCount(g.member_count)} members`}
          onBack={back}
          // Prototype's person icon; it opens View profile, mute and Leave (rule 20: leaving is in the menu).
          onProfile={() => setMenu(true)}
          square
        />
        <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: c.white }}>
          {!online ? (
            <View style={{ backgroundColor: c.warnT, paddingVertical: s(8), paddingHorizontal: s(16) }}>
              <Text size={13} color={c.warnInk} oneLine>
                Offline. Messages send when you're back.
              </Text>
            </View>
          ) : null}
          {pinned ? (
            <ComPin
              title={(pinned.body ?? pinned.quote?.text ?? '').replace(/\s+/g, ' ')}
              note={`Pinned by ${pinned.sender_name}`}
              onPress={() => {
                const i = items.findIndex((x) => x.key === pinned.id);
                if (i >= 0) listRef.current?.scrollToIndex({ index: i, viewPosition: 0.3 });
              }}
            />
          ) : null}
          <FlatList
            ref={listRef}
            data={history.isPending ? [] : items}
            keyExtractor={(i) => i.key}
            ListHeaderComponent={intro}
            contentContainerStyle={{ gap: s(10), paddingBottom: s(14), paddingHorizontal: s(12) }}
            onContentSizeChange={() => atBottom && listRef.current?.scrollToEnd({ animated: false })}
            onScrollToIndexFailed={() => listRef.current?.scrollToEnd({ animated: true })}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              setAtBottom(contentOffset.y + layoutMeasurement.height >= contentSize.height - s(40));
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
                !g.is_member && g.visibility === 'public'
                  ? { label: 'Join', onPress: () => membership.join.mutate() }
                  : undefined
              }
              bottom={bottom}
            />
          ) : (
            // s-author-community's composer has no highlight button.
            <DmComposer
              value={text}
              onChange={setText}
              onSend={send}
              placeholder="Message the community…"
              max={MESSAGE_MAX}
              sending={false}
              bottom={bottom}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Sheet open={!!selected} onClose={() => setSelected(null)}>
        {selected ? (
          <>
            <ReactionRow
              mine={selected.my_reaction}
              disabled={!online || !g.is_member}
              onReact={(r: Reaction) => {
                run({ type: 'react', message_id: selected.id, emoji: selected.my_reaction === r ? null : r });
                setSelected(null);
              }}
            />
            {!online ? (
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

      <Sheet open={menu} onClose={() => setMenu(false)} title={g.name}>
        <OptionList
          items={[
            { key: 'profile', title: 'View profile', onPress: () => (setMenu(false), profile()) },
            ...(g.notify_muted_until && new Date(g.notify_muted_until) > new Date()
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
            ...(g.is_member && g.role !== 'owner'
              ? [
                  {
                    key: 'leave',
                    title: 'Leave community',
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
