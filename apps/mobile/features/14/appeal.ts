import { useMutation, useQuery } from '@tanstack/react-query';
import type { AppealSubject, ModerationRow } from '@arpedia/core';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';

// Rule 26: decisions on the reader's own account and the Appeal they offer
// (`get_my_moderation`, `create_appeal` in 20261120001400_14_trust.sql).

export const moderationKey = (uid: string | undefined) => ['my-moderation', uid] as const;

/** Sanctions and removals of the last 90 days, newest first. */
export function useMyModeration(uid: string | undefined) {
  return useQuery({
    queryKey: moderationKey(uid),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_moderation');
      if (error) throw error;
      return (data ?? []) as ModerationRow[];
    },
  });
}

export interface AppealInput {
  type: AppealSubject;
  id: string;
  text: string;
}

/** Send an appeal; the server keeps the 14-day window and one open appeal per decision. */
export function useCreateAppeal(uid: string | undefined) {
  return useMutation({
    mutationFn: async (a: AppealInput) => {
      const { data, error } = await supabase.rpc('create_appeal', {
        p_subject_type: a.type,
        p_subject_id: a.id,
        p_text: a.text.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: moderationKey(uid) }),
  });
}
