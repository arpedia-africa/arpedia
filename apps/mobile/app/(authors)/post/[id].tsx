import { useMemo, useRef, useState, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';
import { KeyboardAvoidingView, Platform, ScrollView, Share, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { authorCount, postTime, validMessage } from '@arpedia/core';
import { Btn, Callout, EmptyState, Screen, Sheet, Text, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { avatarTone } from '../../../features/03/BookViews';
import { useOnline } from '../../../features/03/book';
import { rpcError } from '../../../features/03/UnlockSheet';
import { OptionList, ReportBody, type OptionItem, type ReportReason } from '../../../features/06/SheetViews';
import { createReport, REPORT_SAVED, REPORT_SENT, reportErrorCopy } from '../../../features/14/report';
import { useTrack } from '../../../features/08/analytics';
import {
  CommentBox,
  CommentItem,
  CommentsHead,
  PostBody,
  PostHead,
  PostSkeleton,
  type CommentView,
} from '../../../features/08/PostViews';
import {
  authorKey,
  commentsKey,
  firstName,
  postKey,
  usePost,
  usePostComments,
  type CommentRow,
  type CommentsPage,
  type PostData,
} from '../../../features/08/data';

interface Pending {
  client_id: string;
  parent_id: string | null;
  body: string;
  state: 'sending' | 'failed';
  at: string;
}

const COMMENT_ERRORS: Record<string, string> = {
  rate_limited: 'You’re commenting fast. Wait a minute and try again.',
  rejected_by_rules: 'This comment can’t be posted. New accounts can’t share links or phone numbers.',
  blocked: 'You can’t comment on this post.',
  not_found: 'This post or comment is no longer available.',
  bad_body: 'Write 1 to 1,000 characters.',
};

function toView(r: CommentRow, now: Date, reply: boolean, isPostAuthor: boolean): CommentView {
  const gone = r.state === 'removed' || r.state === 'deleted';
  return {
    id: r.id,
    name: r.name,
    avatarUrl: r.avatar_url,
    tone: avatarTone(r.user_id ?? r.id),
    time: postTime(r.created_at, now),
    isAuthor: r.is_author,
    text:
      r.state === 'removed'
        ? 'Comment removed by author'
        : r.state === 'deleted'
          ? 'This comment was deleted'
          : (r.body ?? ''),
    muted: gone,
    review: r.state === 'auto_hidden' && (r.mine || isPostAuthor),
    status: null,
    canReply: !gone,
    canMenu: !gone && (r.can_delete || !r.mine),
    reply,
  };
}

export default function PostPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const qc = useQueryClient();
  const online = useOnline();
  const post = usePost(id);
  const comments = usePostComments(id);
  const d = post.data;
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ parent: string; name: string } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [menu, setMenu] = useState<CommentRow | null>(null);
  const [reporting, setReporting] = useState<CommentRow | null>(null);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const like = useMutation({
    mutationFn: async (on: boolean) => {
      const { data, error } = await supabase.rpc('like_post', { p_post: id, p_liked: on });
      if (error) throw error;
      return data as unknown as { liked: boolean; like_count: number };
    },
    onMutate: (on) =>
      qc.setQueryData<PostData>(postKey(id), (o) =>
        o ? { ...o, liked: on, like_count: Math.max(0, o.like_count + (on ? 1 : -1)) } : o,
      ),
    onSuccess: (r, on) => {
      if (on) track('post_liked', { post_id: id });
      qc.setQueryData<PostData>(postKey(id), (o) =>
        o ? { ...o, liked: r.liked, like_count: r.like_count } : o,
      );
    },
    onError: (_e, on) => {
      qc.setQueryData<PostData>(postKey(id), (o) =>
        o ? { ...o, liked: !on, like_count: Math.max(0, o.like_count + (on ? -1 : 1)) } : o,
      );
      toast({ message: 'Couldn’t update your like. Try again.' });
    },
  });

  const send = async (p: Pending) => {
    setPending((list) => [...list.filter((x) => x.client_id !== p.client_id), { ...p, state: 'sending' }]);
    const { error } = await supabase.rpc('add_comment', {
      p_post: id,
      // null = a top-level comment (the generated types mark the argument required)
      p_parent: p.parent_id as string,
      p_body: p.body,
      p_client_id: p.client_id,
    });
    if (error) {
      const { code } = rpcError(error);
      if (code === 'network') {
        // Kept with its client_id: a retry never posts twice (rule 27 applies to comments too).
        setPending((list) => list.map((x) => (x.client_id === p.client_id ? { ...x, state: 'failed' } : x)));
        return;
      }
      setPending((list) => list.filter((x) => x.client_id !== p.client_id));
      setText((t) => t || p.body);
      toast({ message: COMMENT_ERRORS[code] ?? 'Couldn’t post your comment. Try again.' });
      return;
    }
    track('comment_added', { post_id: id, is_reply: !!p.parent_id, is_author: !!d?.is_author });
    await Promise.all([
      qc.invalidateQueries({ queryKey: commentsKey(id) }),
      qc.invalidateQueries({ queryKey: postKey(id) }),
    ]);
    setPending((list) => list.filter((x) => x.client_id !== p.client_id));
  };

  const submit = () => {
    if (!validMessage(text)) return;
    const p: Pending = {
      client_id: Crypto.randomUUID(),
      parent_id: replyTo?.parent ?? null,
      body: text.trim(),
      state: 'sending',
      at: new Date().toISOString(),
    };
    setText('');
    setReplyTo(null);
    input.current?.blur();
    // States: offline. The comment waits as "Not sent. Tap to retry" with its client_id.
    if (!online) return setPending((l) => [...l, { ...p, state: 'failed' }]);
    void send(p);
  };

  const remove = useMutation({
    mutationFn: async (comment: string) => {
      const { error } = await supabase.rpc('delete_comment', { p_comment: comment });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: commentsKey(id) });
      void qc.invalidateQueries({ queryKey: postKey(id) });
    },
    onError: () => toast({ message: 'Couldn’t delete the comment. Try again.' }),
  });

  const block = useMutation({
    mutationFn: async (user: string) => {
      const { error } = await supabase.rpc('block_user', { p_user: user });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ message: 'Blocked. You won’t see their comments.' });
      void qc.invalidateQueries({ queryKey: commentsKey(id) });
      if (d) void qc.invalidateQueries({ queryKey: authorKey(d.author_id) });
    },
    onError: () => toast({ message: 'Couldn’t block. Try again.' }),
  });

  const rows = useMemo(() => {
    const now = new Date();
    const isPostAuthor = !!d?.is_author;
    const out: { v: CommentView; row: CommentRow | null; pending?: Pending }[] = [];
    const pages = (comments.data as InfiniteData<CommentsPage> | undefined)?.pages ?? [];
    const pendingFor = (parent: string | null) =>
      pending
        .filter((p) => p.parent_id === parent)
        .map((p) => ({
          row: null,
          pending: p,
          v: {
            id: p.client_id,
            name: 'You',
            avatarUrl: null,
            tone: 'o' as const,
            time: 'now',
            isAuthor: isPostAuthor,
            text: p.body,
            muted: false,
            review: false,
            status: p.state === 'failed' ? 'Not sent. Tap to retry' : 'Sending…',
            canReply: false,
            canMenu: false,
            reply: !!parent,
          },
        }));
    for (const page of pages) {
      for (const r of page.comments) {
        out.push({ v: toView(r, now, false, isPostAuthor), row: r });
        for (const rep of r.replies ?? []) out.push({ v: toView(rep, now, true, isPostAuthor), row: rep });
        out.push(...pendingFor(r.id));
      }
    }
    out.push(...pendingFor(null));
    return out;
  }, [comments.data, pending, d?.is_author]);

  if (!d) {
    return (
      <Screen top="org" header={<PostHead name="" tone="m" status="" onBack={back} />}>
        {post.isPending && !post.isError ? (
          <PostSkeleton />
        ) : (
          <View style={{ paddingTop: s(48) }}>
            {rpcError(post.error).code === 'not_found' ? (
              <EmptyState
                title="This post isn’t available"
                body="The author may have taken it down."
                action={{ label: 'Go back', onPress: back }}
              />
            ) : (
              <EmptyState
                title="Couldn’t load this post"
                body={
                  online
                    ? 'Something went wrong on our side. Try again.'
                    : 'You’re offline. Connect and try again.'
                }
                action={{ label: 'Try again', onPress: () => void post.refetch() }}
              />
            )}
          </View>
        )}
      </Screen>
    );
  }

  const total = comments.data?.pages[0]?.total ?? d.comment_count;
  const menuItems: OptionItem[] = menu
    ? [
        ...(menu.can_delete
          ? [
              {
                key: 'delete',
                title: 'Delete',
                sub: menu.mine ? 'Remove your comment' : 'Remove it from your post',
                danger: true,
                onPress: () => {
                  setMenu(null);
                  remove.mutate(menu.id);
                },
              },
            ]
          : []),
        ...(!menu.mine && menu.user_id
          ? [
              {
                key: 'block',
                title: `Block ${firstName(menu.name)}`,
                sub: 'You won’t see their comments or messages',
                danger: true,
                onPress: () => {
                  const u = menu.user_id!;
                  setMenu(null);
                  if (online) block.mutate(u);
                  else toast({ message: 'Connect to do this' });
                },
              },
              {
                key: 'report',
                title: 'Report',
                sub: 'Tell Arpedia about this comment',
                onPress: () => {
                  setMenu(null);
                  setReason(null);
                  setDetails('');
                  setAlsoBlock(false);
                  setReporting(menu);
                },
              },
            ]
          : []),
      ]
    : [];

  return (
    <Screen
      top="org"
      scroll={false}
      header={
        <PostHead
          name={d.author_name}
          tone={avatarTone(d.author_id)}
          avatarUrl={d.author_avatar}
          status={`${d.author_name} · ${postTime(d.published_at)}`}
          onBack={back}
          onShare={() => void Share.share({ message: `${d.title} · ${d.author_name} on Arpedia` })}
        />
      }
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: s(28) }}
        >
          {!online ? (
            <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
              <Callout tone="quiet">Offline. Liking and commenting need a connection.</Callout>
            </View>
          ) : null}
          <PostBody
            title={d.title}
            body={d.body}
            likes={`${authorCount(d.like_count)} ${d.like_count === 1 ? 'like' : 'likes'}`}
            comments={`${authorCount(d.comment_count)} ${d.comment_count === 1 ? 'comment' : 'comments'}`}
            liked={d.liked}
            onLike={() => (online ? like.mutate(!d.liked) : toast({ message: 'Connect to do this' }))}
            onComments={() => input.current?.focus()}
            likeOff={d.state !== 'published'}
          />
          {replyTo ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: s(16),
                gap: s(8),
              }}
            >
              <Text variant="xs" color="ink2" ellipsis numberOfLines={1} style={{ flex: 1 }}>
                {`Replying to ${replyTo.name}`}
              </Text>
              <Btn
                label="Cancel"
                variant="g"
                size="sm"
                onPress={() => {
                  setReplyTo(null);
                  setText('');
                }}
              />
            </View>
          ) : null}
          {d.can_comment ? (
            <CommentBox
              ref={input}
              value={text}
              onChange={setText}
              onSend={submit}
              sendOff={!validMessage(text) || !online}
              placeholder="Write a thoughtful comment…"
              editable
            />
          ) : (
            <View style={{ paddingHorizontal: s(16) }}>
              <Callout tone="quiet">Comments are closed on this post.</Callout>
            </View>
          )}
          <CommentsHead total={`${authorCount(total)} total`} />
          {comments.isPending ? (
            <PostSkeleton />
          ) : comments.isError && rows.length === 0 ? (
            <View style={{ paddingHorizontal: s(16), gap: s(8) }}>
              <Callout tone="quiet">Couldn’t load comments.</Callout>
              <Btn label="Try again" variant="g" size="md" onPress={() => void comments.refetch()} />
            </View>
          ) : rows.length === 0 ? (
            <Text variant="sm" color="ink2" center style={{ paddingVertical: s(24) }}>
              No comments yet. Be the first.
            </Text>
          ) : (
            rows.map(({ v, row, pending: p }) => (
              <CommentItem
                key={v.id}
                v={v}
                onRetry={p?.state === 'failed' ? () => void send(p) : undefined}
                onMenu={row ? () => setMenu(row) : undefined}
                onReply={
                  row && d.can_comment
                    ? () => {
                        const name = firstName(row.name);
                        setReplyTo({ parent: row.parent_id ?? row.id, name: row.name });
                        // Replying to a reply starts with the name (rule 13).
                        if (row.parent_id) setText(`${name} `);
                        input.current?.focus();
                      }
                    : undefined
                }
              />
            ))
          )}
          {comments.hasNextPage ? (
            <View style={{ paddingTop: s(12), paddingHorizontal: s(16) }}>
              <Btn
                label="Load more"
                variant="g"
                size="md"
                block
                loading={comments.isFetchingNextPage}
                onPress={() => void comments.fetchNextPage()}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu ? menu.name : undefined}>
        <OptionList items={menuItems} />
      </Sheet>
      <Sheet open={!!reporting} onClose={() => setReporting(null)} title="Why are you reporting this?">
        {reporting ? (
          <ReportBody
            name={reporting.name}
            reason={reason}
            details={details}
            alsoBlock={alsoBlock}
            canBlock={!!reporting.user_id}
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
                  content_type: 'post_comment',
                  content_id: reporting.id,
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
                      void qc.invalidateQueries({ queryKey: commentsKey(id) });
                      if (d) void qc.invalidateQueries({ queryKey: authorKey(d.author_id) });
                    }
                  },
                  (e) => toast({ message: reportErrorCopy(String((e as Error).message)) }),
                )
                .finally(() => setSendingReport(false));
            }}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}
