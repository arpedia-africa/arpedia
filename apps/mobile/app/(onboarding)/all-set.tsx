import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { LAUNCH_PLANS, renewalDate, shortDate } from '@arpedia/core';
import { Screen } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import {
  AllSetBody,
  AllSetFoot,
  AllSetHero,
  AllSetPending,
  BookLead,
  PersonLead,
  type AllSetStep,
} from '../../features/01/PaywallViews';
import { useTrack } from '../../features/01/analytics';
import { finishOnboarding } from '../../features/01/finish';
import { useMyProfile, useSession } from '../../features/01/session';

interface AllSetData {
  credits: number | null;
  plan: string | null;
  granted_at: string | null;
  /** The live subscription's period end; null until the store webhook has made one. */
  renews_at: string | null;
  /** False for a plan cancelled or paused inside its period (no renewal to show). */
  renewing: boolean | null;
  book: { id: string; title: string; price: number | null } | null;
  author: { id: string; name: string; genre: string | null; books: number } | null;
}

const POLL_MS = 3000;
const LATE_MS = 30_000;

// s-all-set (rule 30): credits and renewal read from the ledger, never typed in. If the store
// webhook is late, "Setting up your credits" polls every 3 s and offers Refresh after 30 s.
export default function AllSet() {
  const track = useTrack();
  const session = useSession();
  const profile = useMyProfile(session?.user.id);
  const [late, setLate] = useState(false);
  const [round, setRound] = useState(0);

  const q = useQuery({
    queryKey: ['all-set'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_set');
      if (error) throw error;
      return data as unknown as AllSetData;
    },
    refetchInterval: (query) => (query.state.data?.credits == null && !late ? POLL_MS : false),
  });
  useEffect(() => {
    const t = setTimeout(() => setLate(true), LATE_MS);
    return () => clearTimeout(t);
  }, [round]);
  // Back after a purchase stays here; leaving goes Home (never back to the paywall).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const d = q.data;
  const plan = LAUNCH_PLANS.find((p) => p.id === d?.plan);
  const renews = d?.renews_at
    ? d.renews_at.slice(0, 10)
    : plan && d?.granted_at && d.renewing == null
      ? renewalDate(d.granted_at.slice(0, 10), plan.months)
      : null;
  const planLine = plan ? (renews ? `${plan.name} · renews ${shortDate(renews)}` : plan.name) : null;

  // Step cards lead to pages built in later flows (book 03, club 06, author 08); until then Home.
  const toHome = () => void finishOnboarding(track);
  const steps: AllSetStep[] = [];
  if (d?.book)
    steps.push({
      key: 'book',
      title: 'Read the #1 book this week',
      sub: d.book.price ? `${d.book.title} · ${d.book.price} credits` : d.book.title,
      lead: <BookLead title={d.book.title} />,
      onPress: toHome,
    });
  // "Join <club>" needs flow 06's clubs; hidden until they exist.
  const author: AllSetStep | null =
    profile.data?.signup_intent === 'author'
      ? {
          key: 'become',
          title: 'Become an author',
          sub: 'Publish your books and reach readers',
          onPress: toHome,
        }
      : d?.author
        ? {
            key: 'author',
            title: `Follow ${d.author.name}`,
            sub: [d.author.genre, `${d.author.books} ${d.author.books === 1 ? 'book' : 'books'}`]
              .filter(Boolean)
              .join(' · '),
            lead: <PersonLead name={d.author.name} />,
            onPress: toHome,
          }
        : null;
  if (author) {
    // Rule 19: an author-minded reader sees their card first.
    if (author.key === 'become') steps.unshift(author);
    else steps.push(author);
  }

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }} footer={<AllSetFoot onHome={toHome} />}>
      <AllSetHero credits={d?.credits ?? null} planLine={planLine} />
      {d && d.credits != null ? (
        <AllSetBody steps={steps} />
      ) : (
        <AllSetPending
          late={late || q.isError}
          onRefresh={() => {
            setLate(false);
            setRound((r) => r + 1);
            void q.refetch();
          }}
        />
      )}
    </Screen>
  );
}
