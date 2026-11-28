import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// get_book_discussion (rule 47): the reader's place, the 95% gate, the comment count on the
// current chapter and the club reading the book (its chat is the book room, flow 06).

export interface DiscussionData {
  title: string;
  percent: number;
  max_percent: number;
  unlocked: boolean;
  chapter_ord: number;
  chapters: number;
  chapter_comments: number;
  club: { id: string; name: string; members: number } | null;
}

export function useBookDiscussion(id: string | undefined) {
  return useQuery({
    queryKey: ['book-discussion', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_book_discussion', { p_book: id! });
      if (error) throw error;
      return data as unknown as DiscussionData | null;
    },
  });
}

/** "12 comments on chapter 7 · only up to where you are". */
export const passageSub = (count: number, chapter: number) =>
  `${count.toLocaleString('en-NG')} ${count === 1 ? 'comment' : 'comments'} on chapter ${Math.max(1, chapter)} · only up to where you are`;

/** "1,240 members reading together". */
export const clubSub = (members: number) =>
  `${members.toLocaleString('en-NG')} ${members === 1 ? 'member' : 'members'} reading together`;
