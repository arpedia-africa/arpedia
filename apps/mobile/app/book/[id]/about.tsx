import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { creditsNaira, readTimeLong } from '@arpedia/core';
import { EmptyState, Screen, useTheme } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { AboutSkeleton, AboutView, BackHero, type Fact } from '../../../features/03/AboutViews';

// s-book-about (rules 39–41). A fact with no value is left out; there are no fallbacks.

interface AboutData {
  title: string;
  description: string | null;
  genre: string | null;
  author: { id: string; name: string | null };
  language: string | null;
  age: string | null;
  publisher: string | null;
  isbn: string | null;
  published_at: string | null;
  purchases: number;
  words: number | null;
  pages: number | null;
  price: number;
  chapters: number;
  read_minutes: number;
  file_bytes: number | null;
  content_notes: string[] | null;
  no_explicit: boolean | null;
}

const n = (v: number) => v.toLocaleString('en-NG');
const LANGUAGES: Record<string, string> = {
  en: 'English',
  yo: 'Yoruba',
  ig: 'Igbo',
  ha: 'Hausa',
  pcm: 'Pidgin',
};
const DATE = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

function facts(d: AboutData): Fact[] {
  const out: (Fact | null)[] = [
    d.language ? { k: 'Language', v: LANGUAGES[d.language] ?? d.language } : null,
    d.age ? { k: 'Age', v: d.age } : null,
    d.author.name ? { k: 'Author', v: d.author.name } : null,
    d.publisher ? { k: 'Publisher', v: d.publisher } : null,
    d.published_at ? { k: 'Published on', v: DATE.format(new Date(d.published_at)) } : null,
    d.isbn ? { k: 'ISBN', v: d.isbn, num: true } : null,
    d.genre ? { k: 'Genre', v: d.genre } : null,
    { k: 'Purchases', v: n(d.purchases), num: true },
    d.words && d.pages ? { k: 'Length', v: `${n(d.words)} words · ${n(d.pages)} pages` } : null,
    { k: 'Price', v: `${n(d.price)} credits (₦${n(creditsNaira(d.price))}) · half a credit a page` },
    d.chapters > 0
      ? { k: 'Chapters', v: `${d.chapters}${d.read_minutes > 0 ? ` · ${readTimeLong(d.read_minutes)}` : ''}` }
      : null,
    d.file_bytes ? { k: 'Size', v: `${(d.file_bytes / 1_000_000).toFixed(1)} MB` } : null,
  ];
  return out.filter((f): f is Fact => f !== null);
}

export default function About() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { s } = useTheme();
  const q = useQuery({
    queryKey: ['book-about', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_book_about', { p_book: id });
      if (error) throw error;
      return data as unknown as AboutData | null;
    },
  });
  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/book/[id]', params: { id } });
  const d = q.data;
  return (
    <Screen top="org">
      <BackHero
        title="About this ebook"
        sub={d ? [d.title, d.author.name].filter(Boolean).join(' · ') : undefined}
        onBack={back}
      />
      {d ? (
        <AboutView
          description={d.description ?? ''}
          facts={facts(d)}
          notes={d.content_notes ?? []}
          clean={d.no_explicit === true}
        />
      ) : q.isPending ? (
        <AboutSkeleton />
      ) : (
        <View style={{ paddingTop: s(24) }}>
          <EmptyState
            title={q.isError ? 'This didn’t load' : 'This book isn’t available right now'}
            body={q.isError ? 'Check your connection and try again.' : 'It may have been taken down.'}
            action={q.isError ? { label: 'Try again', onPress: () => void q.refetch() } : undefined}
          />
        </View>
      )}
    </Screen>
  );
}
