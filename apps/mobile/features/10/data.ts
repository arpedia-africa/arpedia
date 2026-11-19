// Flow 10 · server data for Profile and Settings (TanStack Query over the flow 10 RPCs).
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';

export interface ProfileSummary {
  books_read: number;
  following: number;
  highlights: number;
  bookmarks: number;
  notes: number;
  year: number;
  /** Lagos date, YYYY-MM-DD. */
  today: string;
  read_this_year: number;
  goal: number | null;
  last_year: { target: number; read: number } | null;
  is_author: boolean;
}

export const summaryKey = ['profile-summary'] as const;

/** Profile counts and goal in one call (rule 2); cached so Profile works offline. */
export function useProfileSummary(enabled = true) {
  return useQuery({
    queryKey: summaryKey,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profile_summary');
      if (error) throw error;
      return data as unknown as ProfileSummary;
    },
  });
}

/** Set goal for a year; the count never changes (rule 9). */
export function useSetGoal() {
  return useMutation({
    mutationFn: async ({ year, target }: { year: number; target: number }) => {
      const { error } = await supabase.rpc('set_reading_goal', { p_year: year, p_target: target });
      if (error) throw error;
      return target;
    },
    onSuccess: (target) =>
      queryClient.setQueryData<ProfileSummary>(summaryKey, (old) => (old ? { ...old, goal: target } : old)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: summaryKey }),
  });
}
