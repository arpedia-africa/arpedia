import { useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Screen, Skeleton } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { InterestsFoot, InterestsView } from '../../features/01/StepViews';
import { useTrack } from '../../features/01/analytics';
import { saveStep } from '../../features/01/steps';

// Fiction and Nigerian books are picked at first view (rule 13), but Skip saves nothing.
const DEFAULT_PICKS = ['fiction', 'nigerian-books'];

export default function Interests() {
  const track = useTrack();
  const { fresh } = useLocalSearchParams<{ fresh?: string }>();
  const genres = useQuery({
    queryKey: ['genres'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('genres')
        .select('id, name, slug')
        .eq('visible', true)
        .order('position');
      if (error) throw error;
      return data;
    },
  });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const seeded = useRef(false);
  useEffect(() => {
    if (genres.data && !seeded.current) {
      seeded.current = true;
      setPicked(new Set(genres.data.filter((g) => DEFAULT_PICKS.includes(g.slug)).map((g) => g.id)));
    }
  }, [genres.data]);
  useEffect(() => track('onboarding_step_viewed', { step: 'interests' }), [track]);
  // OS back on the first step leaves the app; it never undoes the account.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  const next = () => router.push('/(onboarding)/theme');
  const skip = () => {
    track('onboarding_step_skipped', { step: 'interests' });
    void saveStep('interests');
    next();
  };
  const cont = () => {
    const ids = [...(picked ?? [])];
    if (ids.length === 0) return skip(); // nothing picked behaves like Skip (rule 15)
    track('genres_selected', { count: ids.length });
    void saveStep('interests', { genre_ids: ids });
    next();
  };

  return (
    <Screen
      top="org"
      contentStyle={{ flexGrow: 1 }}
      footer={<InterestsFoot onSkip={skip} onContinue={cont} />}
    >
      {genres.isError && !genres.data ? (
        <EmptyState
          title="Genres didn’t load"
          body="Check your connection, or skip this for now."
          action={{ label: 'Try again', onPress: () => void genres.refetch() }}
        />
      ) : !genres.data || !picked ? (
        <Skeleton height={300} />
      ) : (
        <InterestsView
          genres={genres.data}
          picked={picked}
          onBack={fresh ? () => router.replace('/(auth)/signup') : undefined}
          onToggle={(id) =>
            setPicked((cur) => {
              const n = new Set(cur);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
        />
      )}
    </Screen>
  );
}
