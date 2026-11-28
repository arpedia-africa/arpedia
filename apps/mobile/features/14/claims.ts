import { useMutation, useQuery } from '@tanstack/react-query';
import type { AuthorClaim } from '@arpedia/core';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { isNetworkError } from '../01/session';

// Flow 14 · rules 30 and 31: claims staff sent to the author (status waiting_on_author) and the
// author's answer. RLS on `copyright_claims` lets an author read claims on their own books; the
// card reads only what it shows (never the claimant's name or contact).

export const authorClaimsKey = (uid: string | undefined) => ['author-claims', uid] as const;

export function useAuthorClaims(uid: string | undefined) {
  return useQuery({
    queryKey: authorClaimsKey(uid),
    enabled: !!uid,
    retry: (n, e) => n < 2 && isNetworkError(e),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('copyright_claims')
        .select('id, ref, book_id, type, details, author_response, author_due_at, due_at')
        .eq('status', 'waiting_on_author')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AuthorClaim[];
    },
  });
}

/** Send or change the answer; the server keeps it to the book's author and to open claims. */
export function useRespondToClaim(uid: string | undefined) {
  return useMutation({
    mutationFn: async (a: { id: string; text: string }) => {
      const { error } = await supabase.rpc('respond_to_claim', { p_claim: a.id, p_response: a.text.trim() });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: authorClaimsKey(uid) }),
  });
}
