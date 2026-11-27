import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import type { InboxClientFrame, InboxServerFrame } from '@arpedia/core';
import { supabase } from '@/lib/supabase';

// Flow 06 Server: InboxDO (06-12). While the Community tab is on screen it keeps one socket to the
// reader's InboxDO, watching the conversations listed. `activity` refetches the rows and counts
// (debounced); `reading_now` feeds the Live badge (rule 25: 2 or more reading). The 20 s poll in
// data.ts stays as the fallback when the socket is down or the Worker has no InboxDO.

const CHAT_URL = process.env.EXPO_PUBLIC_CHAT_URL ?? '';
/** The InboxDO keeps at most 100 watches per reader. */
const MAX_WATCH = 100;
/** Watches expire after 10 minutes on the server; resend before then. */
const REWATCH_MS = 4 * 60_000;
const PING_MS = 25_000;
const REFETCH_DEBOUNCE_MS = 800;
/** Rule 25: a group is Live with at least 2 people in it. */
export const LIVE_MIN = 2;
/** After this many failed connects in a row the poll carries on alone until the next visit. */
const MAX_ATTEMPTS = 6;

function write(sock: WebSocket | null, f: InboxClientFrame) {
  if (sock?.readyState === WebSocket.OPEN) sock.send(JSON.stringify(f));
}

/** Reading-now counts pushed for the watched conversations (absent until the server says). */
export function useInboxLive(groupIds: string[], active: boolean): ReadonlyMap<string, number> {
  const qc = useQueryClient();
  const [readingNow, setReadingNow] = useState<ReadonlyMap<string, number>>(new Map());
  const ws = useRef<WebSocket | null>(null);
  const ids = groupIds.slice(0, MAX_WATCH);
  const key = ids.join(',');
  const watchRef = useRef<string[]>(ids);
  watchRef.current = ids;
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);

  // The list on screen changed: replace the watches.
  useEffect(() => {
    write(ws.current, { type: 'watch', groups: key ? key.split(',') : [] });
  }, [key]);

  useEffect(() => {
    if (!active || !appActive || !CHAT_URL) return;
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let rewatch: ReturnType<typeof setInterval> | undefined;
    let refetch: ReturnType<typeof setTimeout> | undefined;
    let connecting = false;

    const refresh = () => {
      if (refetch) clearTimeout(refetch);
      refetch = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['community', 'inbox'] });
        void qc.invalidateQueries({ queryKey: ['community', 'inbox-counts'] });
      }, REFETCH_DEBOUNCE_MS);
    };

    const onFrame = (f: InboxServerFrame) => {
      if (f.type === 'activity') refresh();
      else if (f.type === 'reading_now')
        setReadingNow((m) => {
          if (m.get(f.group_id) === f.reading_now) return m;
          const next = new Map(m);
          next.set(f.group_id, f.reading_now);
          return next;
        });
    };

    const connect = async () => {
      if (closed || connecting || ws.current || !onlineManager.isOnline()) return;
      connecting = true;
      let t: string | null;
      try {
        t = (await supabase.auth.getSession()).data.session?.access_token ?? null;
      } catch {
        t = null;
      } finally {
        connecting = false;
      }
      if (!t || closed || ws.current) return;
      const sock = new WebSocket(`${CHAT_URL.replace(/^http/, 'ws')}/inbox?token=${encodeURIComponent(t)}`);
      ws.current = sock;
      sock.onopen = () => {
        attempt = 0;
        write(sock, { type: 'watch', groups: watchRef.current });
        ping = setInterval(() => write(sock, { type: 'ping' }), PING_MS);
        rewatch = setInterval(() => write(sock, { type: 'watch', groups: watchRef.current }), REWATCH_MS);
        // Anything missed while the socket was down.
        refresh();
      };
      sock.onmessage = (e) => {
        try {
          onFrame(JSON.parse(String(e.data)) as InboxServerFrame);
        } catch {
          // ignore malformed frames
        }
      };
      sock.onclose = (e) => {
        if (ping) clearInterval(ping);
        if (rewatch) clearInterval(rewatch);
        if (ws.current === sock) ws.current = null;
        // 4xx-style closes (signed out, no InboxDO): stay on the poll, try again on the next visit.
        if (closed || (e.code >= 4000 && e.code < 4500) || attempt >= MAX_ATTEMPTS) return;
        retry = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** attempt++));
      };
    };

    void connect();
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
      if (rewatch) clearInterval(rewatch);
      if (refetch) clearTimeout(refetch);
      ws.current?.close();
      ws.current = null;
    };
  }, [active, appActive, qc]);

  return readingNow;
}
