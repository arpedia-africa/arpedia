import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatTime, dayLabel, validMessage, type ChatMessage } from '@arpedia/core';
import { Btn, EmptyState, Sheet, Text, useBottomInset, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { avatarTone } from '../../../features/03/BookViews';
import { useOnline } from '../../../features/03/book';
import { useSession } from '../../../features/01/session';
import {
  Bubble,
  ChatSkeleton,
  ComposerNote,
  DayMarker,
  type BubbleView,
} from '../../../features/06/ChatViews';
import { OptionList, ReportBody, type ReportReason } from '../../../features/06/SheetViews';
import {
  historyKey,
  useChat,
  useChatAction,
  useGroupMembership,
  useHistory,
} from '../../../features/06/chat';
import { createReport, REPORT_SAVED, REPORT_SENT, reportErrorCopy } from '../../../features/14/report';
import { useTrack } from '../../../features/08/analytics';
import { DmConfirmSheet } from '../../../features/08/DmConfirm';
import { DmComposer, DmHead, DmIntro } from '../../../features/08/DmViews';
import {
  authorKey,
  firstName,
  threadKey,
  useAuthorThread,
  type AuthorThread,
} from '../../../features/08/data';

const API = process.env.EXPO_PUBLIC_API_URL ?? '';
const n = (v: number) => v.toLocaleString('en-NG');

interface Pending {
  client_id: string;
  body: string;
  at: string;
  status: 'sending' | 'failed';
}

interface Sent {
  message: {
    id: string;
    group_id: string;
    body: string;
    created_at: string;
    cost_credits: number;
    sender_id: string;
    sender_name: string;
    sender_avatar: string | null;
  };
  balance: number;
  replayed: boolean;
  first_with_author?: boolean;
}

type Item = { key: string; day: string } | { key: string; bubble: BubbleView; retry?: Pending };

/** s-dm (rules 22–31): paid messages to an author. Sends go only through the api Worker. */
export default function AuthorDm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const thread = useAuthorThread(id);
  const t = thread.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const [confirm, setConfirm] = useState(false);

  if (!t || !t.group_id || !t.cost_ack) {
    return (
      <View style={{ flex: 1, backgroundColor: c.org }}>
        <StatusBar style={c.onOrg === '#FFFFFF' ? 'light' : 'dark'} />
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <DmHead
            name={t?.author_name ?? ''}
            tone={avatarTone(id)}
            avatarUrl={t?.author_avatar}
            status={t ? 'Private · Author' : ''}
            onBack={back}
          />
          <View style={{ flex: 1, backgroundColor: c.white, justifyContent: 'center' }}>
            {thread.isPending ? (
              <ChatSkeleton />
            ) : thread.isError ? (
              <EmptyState
                title="Couldn’t load this chat"
                body="Check your connection and try again."
                action={{ label: 'Try again', onPress: () => void thread.refetch() }}
              />
            ) : (
              <EmptyState
                title={`Message ${firstName(t!.author_name)}`}
                body={`Messages to this author cost ${n(t!.cost_credits)} credits each.`}
                action={{ label: 'See the price first', onPress: () => setConfirm(true) }}
              />
            )}
          </View>
        </SafeAreaView>
        {t ? (
          <DmConfirmSheet
            authorId={id}
            name={t.author_name}
            open={confirm}
            onClose={() => setConfirm(false)}
            onStarted={() => {
              setConfirm(false);
              void thread.refetch();
            }}
          />
        ) : null}
      </View>
    );
  }
  return <Thread authorId={id} t={t} gid={t.group_id} onBack={back} />;
}

function Thread({
  authorId,
  t,
  gid,
  onBack,
}: {
  authorId: string;
  t: AuthorThread;
  gid: string;
  onBack: () => void;
}) {
  const { c, s } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const track = useTrack();
  const online = useOnline();
  const session = useSession();
  const me = session?.user.id;
  const bottom = useBottomInset(24);
  const history = useHistory(gid);
  // The socket brings the author's replies live; the reader never sends over it (paid_only).
  useChat(gid);
  const action = useChatAction(gid);
  const membership = useGroupMembership(gid);
  const costs = useQuery({
    queryKey: ['author', authorId, 'dm-costs', gid],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_author_dm_costs', { p_group: gid });
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.id, r.cost_credits]));
    },
  });
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [short, setShort] = useState<{ need: number; balance: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const listRef = useRef<FlatList<Item>>(null);
  const first = firstName(t.author_name);
  const price = `${n(t.cost_credits)} credits`;

  const send = async (p: Pending) => {
    setPending((l) => [...l.filter((x) => x.client_id !== p.client_id), { ...p, status: 'sending' }]);
    let res: Response;
    try {
      const { data } = await supabase.auth.getSession();
      res = await fetch(`${API}/v1/authors/${authorId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ client_id: p.client_id, body: p.body }),
      });
    } catch {
      // Offline or dropped: kept with its client_id, so "Tap to retry" never charges twice (rule 27).
      setPending((l) => l.map((x) => (x.client_id === p.client_id ? { ...x, status: 'failed' } : x)));
      return;
    }
    const json = (await res.json().catch(() => ({}))) as Partial<Sent> & {
      error?: string;
      detail?: { balance?: number; need?: number } | null;
    };
    if (!res.ok || !json.message) {
      setPending((l) => l.filter((x) => x.client_id !== p.client_id));
      if (res.status >= 500) {
        setPending((l) => [...l, { ...p, status: 'failed' }]);
        return;
      }
      setText((cur) => cur || p.body);
      if (json.error === 'insufficient_credits') {
        const balance = json.detail?.balance ?? t.balance;
        track('dm_blocked_by_balance', { balance });
        setShort({ need: json.detail?.need ?? t.cost_credits, balance });
      } else {
        toast({
          message:
            json.error === 'author_unavailable'
              ? `${t.author_name} isn’t taking messages right now`
              : json.error === 'blocked'
                ? `You blocked ${first}. Unblock them to send a message.`
                : json.error === 'rate_limited'
                  ? 'You’ve sent a lot of messages. Try again later.'
                  : json.error === 'rejected_by_rules'
                    ? 'New accounts can’t send links or phone numbers.'
                    : 'Couldn’t send. Try again.',
        });
        void qc.invalidateQueries({ queryKey: threadKey(authorId) });
      }
      return;
    }
    const sent = json as Sent;
    const m = sent.message;
    if (!sent.replayed)
      track('dm_message_sent', { credits: m.cost_credits, is_first_with_author: !!sent.first_with_author });
    qc.setQueryData<ChatMessage[]>(historyKey(gid), (old) => {
      const l = old ?? [];
      if (l.some((x) => x.id === m.id)) return l;
      const row: ChatMessage = {
        id: m.id,
        group_id: m.group_id,
        sender_id: m.sender_id,
        sender_name: m.sender_name,
        sender_avatar: m.sender_avatar,
        sender_is_author: false,
        kind: 'text',
        body: m.body,
        quote: null,
        reply_to_id: null,
        reply_to: null,
        state: 'visible',
        created_at: m.created_at,
        reactions: {},
        my_reaction: null,
        pinned: false,
      };
      return [...l, row];
    });
    qc.setQueryData<Map<string, number>>(['author', authorId, 'dm-costs', gid], (old) =>
      new Map(old ?? []).set(m.id, m.cost_credits),
    );
    qc.setQueryData<AuthorThread>(threadKey(authorId), (old) =>
      old ? { ...old, balance: sent.balance } : old,
    );
    setPending((l) => l.filter((x) => x.client_id !== p.client_id));
  };

  const submit = () => {
    if (!validMessage(text, t.max_chars)) return;
    const p: Pending = {
      client_id: Crypto.randomUUID(),
      body: text.trim(),
      at: new Date().toISOString(),
      status: 'sending',
    };
    setText('');
    // States: offline. Nothing is charged; the message waits as "Not sent. Tap to retry".
    if (!online) return setPending((l) => [...l, { ...p, status: 'failed' }]);
    void send(p);
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let lastDay = '';
    const push = (at: string, item: Item) => {
      const d = dayLabel(at);
      if (d !== lastDay) out.push({ key: `day-${at}`, day: d });
      lastDay = d;
      out.push(item);
    };
    const paid = costs.data;
    for (const m of history.data ?? []) {
      const mine = m.sender_id === me;
      const cost = paid?.get(m.id) ?? 0;
      push(m.created_at, {
        key: m.id,
        bubble: {
          key: m.id,
          me: mine,
          senderName: m.sender_name,
          senderTone: avatarTone(m.sender_id ?? m.id),
          senderAvatar: m.sender_avatar,
          author: false,
          hideName: true,
          body: m.state === 'visible' ? m.body : null,
          muted: m.state === 'removed' ? 'Removed by a moderator' : 'This message was deleted',
          time: mine && cost > 0 ? `${chatTime(m.created_at)} · ${n(cost)} credits` : chatTime(m.created_at),
        },
      });
    }
    for (const p of pending)
      push(p.at, {
        key: p.client_id,
        retry: p.status === 'failed' ? p : undefined,
        bubble: {
          key: p.client_id,
          me: true,
          senderName: 'You',
          senderTone: 'o',
          author: false,
          body: p.body,
          time: chatTime(p.at),
          sending: p.status === 'sending',
          failed: p.status === 'failed' ? 'Not sent. Tap to retry' : undefined,
        },
      });
    return out;
  }, [history.data, costs.data, pending, me]);

  useEffect(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [items.length]);

  const note =
    t.author_state === 'gone'
      ? 'This author is no longer on Arpedia.'
      : t.block === 'blocked'
        ? `You blocked ${first}.`
        : t.block === 'author_unavailable' || t.author_state === 'suspended'
          ? `${t.author_name} isn’t taking messages right now`
          : null;

  const profile = () => router.push({ pathname: '/author/[id]', params: { id: authorId, source: 'dm' } });
  const status = ['Private', 'Author', t.reply_label ? `usually replies ${t.reply_label}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ flex: 1, backgroundColor: c.org }}>
      <StatusBar style={c.onOrg === '#FFFFFF' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <DmHead
          name={t.author_name}
          tone={avatarTone(authorId)}
          avatarUrl={t.author_avatar}
          status={status}
          onBack={onBack}
          onMore={() => setMenu(true)}
        />
        <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: c.white }}>
          {!online ? (
            <View style={{ backgroundColor: c.warnT, paddingVertical: s(8), paddingHorizontal: s(16) }}>
              <Text size={13} color={c.warnInk} oneLine>
                Offline. Showing your last copy of this chat.
              </Text>
            </View>
          ) : null}
          <FlatList
            ref={listRef}
            data={history.isPending ? [] : items}
            keyExtractor={(i) => i.key}
            ListHeaderComponent={
              <>
                {/* .com-intro sits outside .chat: undo the list's 12px sides; 6 + 4 + gap 10 = .chat's 14 top. */}
                <View style={{ marginHorizontal: -s(12), marginBottom: s(4) }}>
                  <DmIntro
                    name={t.author_name}
                    tone={avatarTone(authorId)}
                    avatarUrl={t.author_avatar}
                    notice={`Messages to this author cost ${price} each. Private, only the author sees them.`}
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
                  <Text
                    variant="sm"
                    color="ink2"
                    center
                    style={{ paddingTop: s(20), paddingHorizontal: s(28) }}
                  >
                    {`Ask a question, say thanks or share what a chapter meant to you. ${price} a message.`}
                  </Text>
                ) : null}
              </>
            }
            contentContainerStyle={{ gap: s(10), paddingBottom: s(14), paddingHorizontal: s(12) }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) =>
              'day' in item ? (
                <DayMarker label={item.day} />
              ) : (
                <Bubble m={item.bubble} onRetry={item.retry ? () => void send(item.retry!) : undefined} />
              )
            }
          />
          {note ? (
            <ComposerNote
              text={note}
              action={
                t.block === 'blocked'
                  ? {
                      label: 'Unblock',
                      onPress: () =>
                        action.mutate(
                          { type: 'unblock', user_id: authorId },
                          {
                            onSuccess: () => {
                              void qc.invalidateQueries({ queryKey: threadKey(authorId) });
                              void qc.invalidateQueries({ queryKey: authorKey(authorId) });
                            },
                          },
                        ),
                    }
                  : undefined
              }
              bottom={bottom}
            />
          ) : (
            <DmComposer
              value={text}
              onChange={setText}
              onSend={submit}
              price={price}
              max={t.max_chars}
              sending={false}
              bottom={bottom}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Sheet
        open={!!short}
        onClose={() => setShort(null)}
        title={`You need ${short ? n(short.need) : ''} credits`}
      >
        <Text variant="sm" color="ink2">
          {short ? `Your balance is ${n(short.balance)}. Your message is still in the box.` : ''}
        </Text>
        <View style={{ gap: s(8) }}>
          <Btn
            label="Get credits"
            block
            onPress={() => {
              setShort(null);
              router.push('/credits');
            }}
          />
          <Btn label="Cancel" variant="g" block onPress={() => setShort(null)} />
        </View>
      </Sheet>

      <Sheet open={!!reporting} onClose={() => setReporting(null)} title="Why are you reporting this?">
        {reporting ? (
          <ReportBody
            name={t.author_name}
            reason={reason}
            details={details}
            alsoBlock={alsoBlock}
            canBlock
            sending={sendingReport}
            onReason={setReason}
            onDetails={setDetails}
            onAlsoBlock={setAlsoBlock}
            onCancel={() => setReporting(null)}
            onSend={() => {
              if (!reason) return;
              setSendingReport(true);
              createReport(
                {
                  content_type: 'dm',
                  content_id: reporting,
                  reason,
                  details: details.trim() || null,
                  also_block: alsoBlock,
                },
                !online,
              )
                .then(
                  (ref) => {
                    setReporting(null);
                    toast({ message: ref === null ? REPORT_SAVED : REPORT_SENT, duration: 6000 });
                    if (alsoBlock && ref !== null) {
                      void qc.invalidateQueries({ queryKey: threadKey(authorId) });
                      void qc.invalidateQueries({ queryKey: authorKey(authorId) });
                    }
                  },
                  (e) => toast({ message: reportErrorCopy(String((e as Error).message)) }),
                )
                .finally(() => setSendingReport(false));
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={t.author_name}>
        <OptionList
          items={[
            {
              key: 'profile',
              title: 'View profile',
              onPress: () => {
                setMenu(false);
                profile();
              },
            },
            {
              key: 'mute',
              title: 'Mute notifications',
              sub: 'No push for new replies',
              onPress: () => {
                setMenu(false);
                membership.mute.mutate('infinity', {
                  onSuccess: () => toast({ message: 'Notifications muted' }),
                  onError: () => toast({ message: 'Couldn’t mute. Try again.' }),
                });
              },
            },
            {
              key: 'report',
              title: 'Report',
              sub: 'Arpedia sees the last 50 messages for this report only',
              danger: true,
              onPress: () => {
                setMenu(false);
                // Thread report (rule 29): create_report 'dm' on the author's latest message; staff see the last 50.
                const last = (history.data ?? [])
                  .filter((m) => m.sender_id !== me && m.state === 'visible')
                  .pop();
                if (!last) return toast({ message: 'Nothing to report yet. You can block now.' });
                setReason(null);
                setDetails('');
                setAlsoBlock(false);
                setReporting(last.id);
              },
            },
            {
              key: 'block',
              title: `Block ${first}`,
              sub: 'Also unfollows and hides this chat',
              danger: true,
              onPress: () => {
                setMenu(false);
                action.mutate(
                  { type: 'block', user_id: authorId },
                  {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: authorKey(authorId) });
                      void qc.invalidateQueries({ queryKey: threadKey(authorId) });
                      onBack();
                    },
                    onError: () => toast({ message: 'Couldn’t block. Try again.' }),
                  },
                );
              },
            },
          ]}
        />
      </Sheet>
    </View>
  );
}
