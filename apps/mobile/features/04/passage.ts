// Passage discussion data (flow 04 H): one thread per paragraph, refreshed every 20 s while open
// (rule 50, no realtime). Posting appears at once and is marked failed with Retry when it fails.
import { useCallback, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { rpcError } from '../03/UnlockSheet';

export interface PassageComment {
  id: string;
  body: string | null;
  /** Set when the writer hid it until a later chapter the reader hasn't reached (rule 49). */
  hidden_until_chapter: number | null;
  created_at: string;
  mine: boolean;
  is_author: boolean;
  user: { id: string; name: string | null; username: string | null } | null;
  hearts: number;
  prays: number;
  my_reactions: ('heart' | 'pray')[];
  /** Local only: posting, or failed with Retry. */
  local?: 'sending' | 'failed';
}

export interface PassageThread {
  para_id: string;
  chapter_ord: number | null;
  count: number;
  comments: PassageComment[];
}

const REFRESH_MS = 20_000;
export const threadKey = (book: string, para: string) => ['passage-thread', book, para] as const;

export function usePassageThread(bookId: string, paraId: string | null) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PassageComment[]>([]);
  const q = useQuery({
    queryKey: threadKey(bookId, paraId ?? ''),
    enabled: !!paraId,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_passage_thread', { p_book: bookId, p_para: paraId! });
      if (error) throw error;
      return data as unknown as PassageThread;
    },
  });

  const post = useCallback(
    async (body: string, quote: string | null, localId: string = Crypto.randomUUID()) => {
      if (!paraId) return;
      const draft: PassageComment = {
        id: localId,
        body,
        hidden_until_chapter: null,
        created_at: new Date().toISOString(),
        mine: true,
        is_author: false,
        user: null,
        hearts: 0,
        prays: 0,
        my_reactions: [],
        local: 'sending',
      };
      setPending((l) => [...l.filter((c) => c.id !== localId), draft]);
      const { data, error } = await supabase.rpc('post_passage_comment', {
        p_book: bookId,
        p_para: paraId,
        p_body: body,
        p_quote: quote ?? undefined,
      });
      if (error) {
        setPending((l) => l.map((c) => (c.id === localId ? { ...c, local: 'failed' } : c)));
        return rpcError(error).code;
      }
      const saved = data as unknown as PassageComment;
      qc.setQueryData<PassageThread>(threadKey(bookId, paraId), (t) =>
        t ? { ...t, count: t.count + 1, comments: [...t.comments, saved] } : t,
      );
      setPending((l) => l.filter((c) => c.id !== localId));
      return null;
    },
    [bookId, paraId, qc],
  );

  const react = useCallback(
    async (c: PassageComment, kind: 'heart' | 'pray') => {
      if (!paraId || c.local) return;
      const on = !c.my_reactions.includes(kind);
      const field = kind === 'heart' ? 'hearts' : 'prays';
      const flip = (t: PassageThread | undefined, sign: 1 | -1, add: boolean) =>
        t && {
          ...t,
          comments: t.comments.map((x) =>
            x.id === c.id
              ? {
                  ...x,
                  [field]: Math.max(0, x[field] + sign),
                  my_reactions: add ? [...x.my_reactions, kind] : x.my_reactions.filter((k) => k !== kind),
                }
              : x,
          ),
        };
      qc.setQueryData<PassageThread>(threadKey(bookId, paraId), (t) => flip(t, on ? 1 : -1, on));
      const { error } = await supabase.rpc('react_passage_comment', {
        p_comment: c.id,
        p_kind: kind,
        p_on: on,
      });
      if (error) qc.setQueryData<PassageThread>(threadKey(bookId, paraId), (t) => flip(t, on ? -1 : 1, !on));
    },
    [bookId, paraId, qc],
  );

  return { q, pending, post, react, dropPending: () => setPending([]) };
}
