import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { onlineManager } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CLOSE_FORBIDDEN,
  OFFLINE_QUEUE_MAX,
  uuid7,
  type ChatMessage,
  type ClientFrame,
  type PostBlock,
  type QuotePayload,
  type Reaction,
  type RoomProgressFrame,
  type SendError,
  type ServerFrame,
} from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { useAskPush } from '../15/push';
import { useTrack } from './analytics';

// Flow 06 chat client: history over HTTPS (get_messages, cached on device so a chat opens
// instantly and offline), live frames over the conversation Durable Object's WebSocket, optimistic
// sends that retry with the same client_id, and actions through the chat Worker.

const CHAT_URL = process.env.EXPO_PUBLIC_CHAT_URL ?? '';

export interface GroupInfo {
  id: string;
  kind: 'official' | 'club' | 'author' | 'readalong' | 'room' | 'dm';
  name: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  visibility: 'public' | 'followers' | 'private';
  slow_mode_seconds: number;
  member_count: number;
  live_count: number;
  is_member: boolean;
  role: 'owner' | 'moderator' | 'member' | null;
  notify_muted_until: string | null;
  post_block: PostBlock | null;
  post_block_until: string | null;
  blocked_here: number;
  weekly: { book_id: string; title: string; from: number; to: number; note: string | null } | null;
  pins: string[];
}

export const groupKey = (gid: string) => ['community', 'group', gid] as const;
export const historyKey = (gid: string) => ['community', 'history', gid] as const;

export function useGroup(gid: string) {
  return useQuery({
    queryKey: groupKey(gid),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_group', { p_group: gid });
      if (error) throw error;
      return data as unknown as GroupInfo;
    },
  });
}

/** The last 50 messages, oldest first (persisted with the query cache: the offline copy). */
export function useHistory(gid: string) {
  return useQuery({
    queryKey: historyKey(gid),
    queryFn: () => fetchHistory(gid),
  });
}

/** A message the user sent that the server hasn't acknowledged yet. */
export interface Pending {
  client_id: string;
  body: string;
  reply_to_id: string | null;
  quote: QuotePayload | null;
  at: string;
  status: 'sending' | 'failed';
  error?: SendError;
}

export type SocketState = 'connecting' | 'open' | 'closed' | 'forbidden';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function fetchHistory(gid: string) {
  const { data, error } = await supabase.rpc('get_messages', { p_group: gid, p_limit: 50 });
  if (error) throw error;
  return (data as unknown as ChatMessage[]).slice().reverse();
}

/** Ask the conversation DO to re-read this user's access (after join or leave). */
async function refreshSelf(gid: string) {
  await fetch(`${CHAT_URL}/c/${gid}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ self: true }),
  }).catch(() => {});
}

/**
 * One socket per open chat. Merges live frames into the history cache, tracks presence and the
 * composer block, and keeps the pending queue (sent in order when the socket opens).
 */
export function useChat(
  gid: string,
  onError?: (e: SendError, waitSeconds?: number) => void,
  /** Reading rooms (flow 07 rule 24): a member's synced place, relayed by the api Worker. */
  onProgress?: (f: RoomProgressFrame) => void,
) {
  const qc = useQueryClient();
  const track = useTrack();
  const ws = useRef<WebSocket | null>(null);
  const [state, setState] = useState<SocketState>('connecting');
  const [readingNow, setReadingNow] = useState<number | null>(null);
  const [block, setBlock] = useState<{ reason: PostBlock | null; until: string | null } | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [lastSentAt, setLastSentAt] = useState(0);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  // States: offline. The queue lives on the phone per reader and conversation, so a message typed
  // offline still goes out (same client_id, never twice) after the app is closed and reopened.
  const queueKey = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const uid = (await supabase.auth.getSession()).data.session?.user.id;
      if (!uid || !live) return;
      const key = `chat.queue.${uid}.${gid}`;
      const raw = await AsyncStorage.getItem(key).catch(() => null);
      if (!live) return;
      queueKey.current = key;
      const saved = raw ? (JSON.parse(raw) as Pending[]) : [];
      if (!saved.length) return;
      setPending((cur) => [...saved.filter((s) => !cur.some((c) => c.client_id === s.client_id)), ...cur]);
      if (ws.current?.readyState === WebSocket.OPEN)
        for (const p of saved)
          ws.current.send(
            JSON.stringify({
              type: 'send',
              client_id: p.client_id,
              body: p.body,
              reply_to_id: p.reply_to_id,
              quote: p.quote,
            }),
          );
    })();
    return () => {
      live = false;
      queueKey.current = null;
    };
  }, [gid]);
  useEffect(() => {
    const key = queueKey.current;
    if (!key) return;
    const waiting = pending.filter((p) => p.status === 'sending');
    void (
      waiting.length ? AsyncStorage.setItem(key, JSON.stringify(waiting)) : AsyncStorage.removeItem(key)
    ).catch(() => undefined);
  }, [pending]);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const patchHistory = useCallback(
    (fn: (list: ChatMessage[]) => ChatMessage[]) =>
      qc.setQueryData<ChatMessage[]>(historyKey(gid), (old) => fn(old ?? [])),
    [qc, gid],
  );

  const write = useCallback((frame: ClientFrame) => {
    if (ws.current?.readyState !== WebSocket.OPEN) return false;
    ws.current.send(JSON.stringify(frame));
    return true;
  }, []);

  const flush = useCallback(() => {
    for (const p of pendingRef.current)
      if (p.status === 'sending')
        write({
          type: 'send',
          client_id: p.client_id,
          body: p.body,
          reply_to_id: p.reply_to_id,
          quote: p.quote,
        });
  }, [write]);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let hellos = 0;

    const onFrame = (f: ServerFrame | RoomProgressFrame) => {
      switch (f.type) {
        case 'progress':
          onProgressRef.current?.(f);
          break;
        case 'hello':
          setReadingNow(f.reading_now);
          setBlock({ reason: f.post_block, until: f.post_block_until });
          flush();
          // Reconnected: catch up on what was sent while the socket was down. Merge rather than
          // replace, so live messages not yet written to Postgres stay.
          if (hellos++ > 0)
            void fetchHistory(gid)
              .then((fresh) =>
                patchHistory((l) => {
                  const byId = new Map(l.map((m) => [m.id, m]));
                  for (const m of fresh) byId.set(m.id, m);
                  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
                }),
              )
              .catch(() => {});
          break;
        case 'presence':
          setReadingNow(f.reading_now);
          break;
        case 'group':
          setBlock({ reason: f.post_block, until: f.post_block_until });
          void qc.invalidateQueries({ queryKey: groupKey(gid) });
          break;
        case 'message':
          patchHistory((l) => {
            if (l.some((m) => m.id === f.message.id)) return l;
            // Live frames carry only reply_to_id: quote the replied-to message from what we have
            // (not there = blocked or older than the loaded page; history fills it on refetch).
            const r = f.message.reply_to_id ? l.find((m) => m.id === f.message.reply_to_id) : undefined;
            const reply_to = r
              ? {
                  id: r.id,
                  sender_name: r.sender_name,
                  state: r.state,
                  body: r.state === 'visible' ? (r.body ?? r.quote?.text ?? '').slice(0, 140) || null : null,
                }
              : f.message.reply_to;
            return [...l, { ...f.message, reply_to }];
          });
          if (f.client_id) setPending((p) => p.filter((x) => x.client_id !== f.client_id));
          break;
        case 'ack':
          setPending((p) => p.filter((x) => x.client_id !== f.client_id));
          break;
        case 'error':
          if (f.client_id)
            setPending((p) =>
              p.map((x) => (x.client_id === f.client_id ? { ...x, status: 'failed', error: f.error } : x)),
            );
          onErrorRef.current?.(f.error, f.wait_seconds);
          break;
        case 'state':
          patchHistory((l) =>
            l.map((m) =>
              m.id === f.message_id
                ? {
                    ...m,
                    state: f.state,
                    body: f.state === 'visible' ? m.body : null,
                    quote: f.state === 'visible' ? m.quote : null,
                  }
                : m,
            ),
          );
          break;
        case 'reactions':
          patchHistory((l) => l.map((m) => (m.id === f.message_id ? { ...m, reactions: f.reactions } : m)));
          break;
        case 'pins':
          patchHistory((l) => l.map((m) => ({ ...m, pinned: f.pins.includes(m.id) })));
          break;
        case 'pong':
          break;
      }
    };

    // The retry timer and the online event can both fire: only one socket at a time.
    let connecting = false;
    const connect = async () => {
      if (closed || !CHAT_URL || connecting || ws.current) return;
      connecting = true;
      let t: string | null;
      try {
        t = await token();
      } finally {
        connecting = false;
      }
      if (!t || closed || ws.current) return;
      if (retry) clearTimeout(retry);
      setState('connecting');
      const url = `${CHAT_URL.replace(/^http/, 'ws')}/c/${gid}?token=${encodeURIComponent(t)}`;
      const sock = new WebSocket(url);
      ws.current = sock;
      sock.onopen = () => {
        attempt = 0;
        setState('open');
        ping = setInterval(() => write({ type: 'ping' }), 25_000);
      };
      sock.onmessage = (e) => {
        try {
          onFrame(JSON.parse(String(e.data)) as ServerFrame);
        } catch {
          // ignore malformed frames
        }
      };
      sock.onclose = (e) => {
        if (ping) clearInterval(ping);
        if (ws.current === sock) ws.current = null;
        if (e.code === CLOSE_FORBIDDEN) {
          setState('forbidden');
          void qc.invalidateQueries({ queryKey: groupKey(gid) });
          return;
        }
        setState('closed');
        if (!closed) retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++));
      };
    };
    void connect();
    // Reconnect at once when the phone comes back online.
    const unsub = onlineManager.subscribe((online) => {
      if (online && !ws.current && !closed) {
        if (retry) clearTimeout(retry);
        attempt = 0;
        void connect();
      }
    });
    return () => {
      closed = true;
      unsub();
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      ws.current?.close();
      ws.current = null;
    };
  }, [gid, qc, flush, patchHistory, write]);

  /** Optimistic send; offline it queues (up to 5) and goes out in order on reconnect. */
  const send = useCallback(
    (body: string, opts: { reply_to_id?: string | null; quote?: QuotePayload | null } = {}) => {
      const queued = pendingRef.current.filter((p) => p.status === 'sending').length;
      if (ws.current?.readyState !== WebSocket.OPEN && queued >= OFFLINE_QUEUE_MAX) return false;
      const p: Pending = {
        client_id: uuid7(Date.now(), Crypto.getRandomBytes),
        body,
        reply_to_id: opts.reply_to_id ?? null,
        quote: opts.quote ?? null,
        at: new Date().toISOString(),
        status: 'sending',
      };
      setPending((l) => [...l, p]);
      setLastSentAt(Date.now());
      const open = ws.current?.readyState === WebSocket.OPEN;
      track('message_sent', {
        group_kind: qc.getQueryData<{ kind?: string }>(groupKey(gid))?.kind ?? 'unknown',
        kind: p.quote ? 'quote' : 'text',
        has_reply: !!p.reply_to_id,
        offline_queued: !open,
      });
      write({
        type: 'send',
        client_id: p.client_id,
        body: p.body,
        reply_to_id: p.reply_to_id,
        quote: p.quote,
      });
      return true;
    },
    [write, track, qc, gid],
  );

  /** "Not sent. Tap to retry": same client_id, so the server never posts it twice. */
  const retrySend = useCallback(
    (client_id: string) => {
      const p = pendingRef.current.find((x) => x.client_id === client_id);
      if (!p) return;
      setPending((l) =>
        l.map((x) => (x.client_id === client_id ? { ...x, status: 'sending', error: undefined } : x)),
      );
      write({ type: 'send', client_id, body: p.body, reply_to_id: p.reply_to_id, quote: p.quote });
    },
    [write],
  );

  return { state, readingNow, block, pending, send, retrySend, lastSentAt };
}

export type ChatAction =
  | { type: 'react'; message_id: string; emoji: Reaction | null }
  | { type: 'delete'; message_id: string }
  | { type: 'pin' | 'unpin'; message_id: string }
  | {
      type: 'report';
      message_id: string;
      reason: string;
      details?: string | null;
      also_block?: boolean;
    }
  | { type: 'block' | 'unblock'; user_id: string; at?: string | null };

/** Actions run as the user in the chat Worker, which relays them to everyone live. */
export async function chatAction(gid: string, action: ChatAction) {
  const t = await token();
  const res = await fetch(`${CHAT_URL}/c/${gid}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify(action),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function useChatAction(gid: string) {
  const qc = useQueryClient();
  const track = useTrack();
  return useMutation({
    mutationFn: (a: ChatAction) => chatAction(gid, a),
    onSuccess: (_d, a) => {
      if (a.type === 'react' && a.emoji) track('message_reacted', { emoji: a.emoji });
      else if (a.type === 'pin') track('message_pinned');
      else if (a.type === 'delete') track('message_deleted');
      else if (a.type === 'report')
        track('report_sent', { content_type: 'message', reason: a.reason, also_block: !!a.also_block });
      else if (a.type === 'block') track('user_blocked');
      else if (a.type === 'unblock') track('user_unblocked', { undo: true });
      if (a.type === 'report' || a.type === 'block' || a.type === 'unblock' || a.type === 'delete')
        void qc.invalidateQueries({ queryKey: ['community'] });
    },
  });
}

export function useMarkRead(gid: string, newestId: string | undefined, member: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!member || !newestId) return;
    void supabase.rpc('mark_read', { p_group: gid, p_up_to: newestId }).then(() => {
      void qc.invalidateQueries({ queryKey: ['community', 'inbox'] });
      void qc.invalidateQueries({ queryKey: ['community', 'inbox-counts'] });
    });
  }, [gid, newestId, member, qc]);
}

export function useGroupMembership(gid: string) {
  const qc = useQueryClient();
  const askPush = useAskPush();
  const track = useTrack();
  const kind = () => qc.getQueryData<{ kind?: string }>(groupKey(gid))?.kind ?? 'unknown';
  const refresh = () => qc.invalidateQueries({ queryKey: ['community'] });
  const join = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('join_group', { p_group: gid });
      if (error) throw error;
      // The DO re-reads access so the open socket may post at once.
      await refreshSelf(gid);
    },
    onSuccess: () => {
      askPush('join');
      // Joined from the group's own page: reached by an invite or share link.
      track('group_joined', { group_kind: kind(), source: 'invite' });
      return refresh();
    },
  });
  const leave = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('leave_group', { p_group: gid });
      if (error) throw error;
      // Stop live delivery and posting now, not when the DO's access cache expires.
      await refreshSelf(gid);
    },
    onSuccess: () => {
      track('group_left', { group_kind: kind() });
      return refresh();
    },
  });
  const mute = useMutation({
    mutationFn: async (until: string | null) => {
      const { error } = await supabase.rpc('set_group_mute', { p_group: gid, p_until: until as string });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  return { join, leave, mute };
}

/** History plus the user's unacknowledged sends, as one list for the chat. */
export function useMergedMessages(history: ChatMessage[] | undefined, pending: Pending[]) {
  return useMemo(() => {
    const ids = new Set((history ?? []).map((m) => m.id));
    return { list: history ?? [], pending: pending.filter((p) => !ids.has(p.client_id)) };
  }, [history, pending]);
}
