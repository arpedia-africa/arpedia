import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Btn, Callout, Hero, IconButton, Screen, useBottomInset, useTheme, useToast } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useTrack } from '../../../features/03/analytics';
import { bookKey, useBookPage } from '../../../features/03/book';
import { WriteReviewView } from '../../../features/03/ReviewViews';
import { rpcError } from '../../../features/03/UnlockSheet';

// s-write-review (rules 43–44): finishers only (checked again by the server), one review per book;
// reopening edits it.

const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long' });

export default function WriteReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, s } = useTheme();
  const toast = useToast();
  const track = useTrack();
  const qc = useQueryClient();
  const bottom = useBottomInset(26);
  const page = useBookPage(id);
  const d = page.data;
  const mine = d?.my_review;
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (d && !seeded) {
      setSeeded(true);
      if (mine) {
        setStars(mine.stars);
        setBody(mine.body ?? '');
        setSpoiler(mine.spoiler);
      }
    }
  }, [d, mine, seeded]);

  const post = useMutation({
    mutationFn: async () => {
      const { error: e } = await supabase.rpc('post_review', {
        p_book: id,
        p_stars: stars,
        p_body: body.trim(),
        p_spoiler: spoiler,
      });
      if (e) throw e;
    },
    onSuccess: () => {
      track('review_posted', { book_id: id, stars, spoiler, has_text: body.trim().length > 0 });
      void qc.invalidateQueries({ queryKey: ['reviews', id] });
      void qc.invalidateQueries({ queryKey: bookKey(id) });
      toast({ message: mine ? 'Review updated' : 'Thanks for your review' });
      router.back();
    },
    onError: (e) => {
      const { code } = rpcError(e);
      setError(
        code === 'not_finished'
          ? 'Finish the book to review it.'
          : code === 'network'
            ? 'No connection. Your review wasn’t posted. Try again.'
            : 'Something went wrong. Try again.',
      );
    },
  });

  const finishedOn = d?.progress?.finished_at ? DATE.format(new Date(d.progress.finished_at)) : null;
  const close = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/book/[id]', params: { id } });
  return (
    <Screen
      top="org"
      footer={
        <View
          style={{
            paddingTop: s(12),
            paddingHorizontal: s(16),
            paddingBottom: bottom,
            borderTopWidth: 1,
            borderTopColor: c.line,
            backgroundColor: c.white,
            gap: s(8),
          }}
        >
          {error ? <Callout tone="err">{error}</Callout> : null}
          <Btn
            label={mine ? 'Save review' : 'Post review'}
            block
            disabled={stars === 0}
            loading={post.isPending}
            onPress={() => post.mutate()}
          />
        </View>
      }
    >
      <Hero
        barBack
        bar={<IconButton icon="x" label="Close" onPress={close} color={c.onOrg} />}
        title="Rate this ebook"
        sub={
          d
            ? [d.book.title, finishedOn ? `you finished it on ${finishedOn}` : null]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
      />
      <WriteReviewView
        stars={stars}
        onStars={setStars}
        body={body}
        onBody={setBody}
        spoiler={spoiler}
        onSpoiler={setSpoiler}
      />
    </Screen>
  );
}
