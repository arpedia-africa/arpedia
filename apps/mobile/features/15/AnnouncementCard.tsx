import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Petals, Press, Sheet, Text, useTheme } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { useTrack } from './analytics';
import { openTarget, send, type Target } from './push';

// Home announcement card (flow 15 rule 21), mirroring the admin preview `.sy-bcard`
// (`node tools/screen.mjs --admin banner-edit --css`). Placements: Home top (<HomeAnnouncements /> under
// the hero, up to 2), Credits (<Announcements placement="credits" />, 1) and the launch modal
// (<LaunchAnnouncement />, 1 a day; the server marks it seen when it hands it out).

export interface Banner {
  id: string;
  headline: string;
  body: string | null;
  button_label: string | null;
  target: Target | null;
  dismissible: boolean;
}

export type Placement = 'home_top' | 'credits' | 'launch_modal';
type CardPlacement = Exclude<Placement, 'launch_modal'>;
export const bannersKey = (placement: Placement) => ['banners', placement];
export const BANNERS_KEY = bannersKey('home_top');

/** Live banners for this reader (audience, dates and dismissals applied by the server). */
export function useBanners(placement: CardPlacement) {
  return useQuery({
    queryKey: bannersKey(placement),
    // Rule 22: fresh on app open (the persisted copy is older than a minute) and every 15 minutes.
    staleTime: 60_000,
    refetchInterval: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_banners', {
        p_placement: placement,
        p_app_version: Application.nativeApplicationVersion ?? undefined,
      });
      if (error) throw error;
      return (data as unknown as Banner[] | null) ?? [];
    },
  });
}

/** `.sy-bcard`: orange card, petals top right, ✕, headline, body and a night button. */
export function AnnouncementCard({
  banner,
  onOpen,
  onDismiss,
}: {
  banner: Banner;
  onOpen: () => void;
  onDismiss?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={banner.headline}
      style={{ backgroundColor: c.org, borderRadius: s(18), padding: s(16), gap: s(8), overflow: 'hidden' }}
    >
      {/* ::after: 150px petal ring at right -50, top -60, opacity .55 */}
      <Petals size={s(150)} style={{ right: s(-50), top: s(-60) }} />
      <Text
        family="display"
        size={18}
        weight={800}
        color="onOrg"
        style={{ lineHeight: s(18) * 1.1, paddingRight: s(16) }}
      >
        {banner.headline}
      </Text>
      {banner.body ? (
        <Text size={12.5} color={`rgba(${c.onOrgRgb},0.85)`} style={{ lineHeight: s(12.5) * 1.4 }}>
          {banner.body}
        </Text>
      ) : null}
      {banner.button_label ? (
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: c.night,
            borderRadius: s(10),
            paddingVertical: s(7),
            paddingHorizontal: s(14),
          }}
        >
          <Text size={12.5} weight={700} color="#FFFFFF" oneLine>
            {banner.button_label}
          </Text>
        </View>
      ) : null}
      {banner.dismissible && onDismiss ? (
        <Press
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={s(14)}
          style={{ position: 'absolute', right: s(10), top: s(8), zIndex: 2 }}
        >
          <Text size={15} weight={700} color="onOrg">
            x
          </Text>
        </Press>
      ) : null}
    </Press>
  );
}

function useDismiss(placement: Placement) {
  const qc = useQueryClient();
  const track = useTrack();
  const key = bannersKey(placement);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('dismiss_banner', { p_banner: id });
      if (error) throw error;
    },
    onMutate: (id) => {
      track('banner_dismissed', { banner_id: id, placement });
      qc.setQueryData<Banner[]>(key, (old) => old?.filter((b) => b.id !== id));
    },
    onError: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

function useShown(data: Banner[] | undefined, placement: Placement) {
  const track = useTrack();
  const ids = (data ?? []).map((b) => b.id).join(',');
  useEffect(() => {
    for (const id of ids.split(',').filter(Boolean)) {
      send(supabase.rpc('banner_event', { p_banner: id, p_kind: 'shown' }));
      track('banner_shown', { banner_id: id, placement });
    }
  }, [ids, placement, track]);
}

function useTapped(placement: Placement) {
  const track = useTrack();
  return (b: Banner) => {
    send(supabase.rpc('banner_event', { p_banner: b.id, p_kind: 'tapped' }));
    track('banner_tapped', { banner_id: b.id, placement });
    openTarget(b.target);
  };
}

/** Live banners for one placement; counts shown and tapped, dismiss hides it for good. Nothing when none. */
export function Announcements({
  placement,
  style,
}: {
  placement: CardPlacement;
  style?: StyleProp<ViewStyle>;
}) {
  const { s } = useTheme();
  const { data } = useBanners(placement);
  const dismiss = useDismiss(placement);
  const tapped = useTapped(placement);
  useShown(data, placement);
  if (!data?.length) return null;
  return (
    <View style={[{ gap: s(12) }, style]}>
      {data.map((b) => (
        <AnnouncementCard
          key={b.id}
          banner={b}
          onOpen={() => tapped(b)}
          onDismiss={() => dismiss.mutate(b.id)}
        />
      ))}
    </View>
  );
}

/** Up to two live Home banners (rule 21). */
export const HomeAnnouncements = ({ style }: { style?: StyleProp<ViewStyle> }) => (
  <Announcements placement="home_top" style={style} />
);

/**
 * The launch modal is asked for once per app run, outside the persisted query cache: the server
 * counts handing it out as today's showing, so a cached copy must never come back on a restart.
 */
let launchAsked = false;
let launchBanner: Banner | null = null;
const closedLaunch = new Set<string>();

/** Modal on launch (rule 21): today's highest-priority card over the app, once per reader per day. */
export function LaunchAnnouncement() {
  const { s } = useTheme();
  const [, setTick] = useState(0);
  const dismiss = useDismiss('launch_modal');
  const tapped = useTapped('launch_modal');
  useEffect(() => {
    if (launchAsked) return;
    launchAsked = true;
    void supabase
      .rpc('get_active_banners', {
        p_placement: 'launch_modal',
        p_app_version: Application.nativeApplicationVersion ?? undefined,
      })
      .then(({ data }) => {
        launchBanner = (data as unknown as Banner[] | null)?.[0] ?? null;
        setTick((n) => n + 1);
      });
  }, []);
  const b = launchBanner;
  useShown(b ? [b] : undefined, 'launch_modal');
  if (!b) return null;
  const close = () => {
    closedLaunch.add(b.id);
    setTick((n) => n + 1);
  };
  return (
    <Sheet open={!closedLaunch.has(b.id)} onClose={close}>
      <View style={{ paddingBottom: s(4) }}>
        <AnnouncementCard
          banner={b}
          onOpen={() => {
            close();
            tapped(b);
          }}
          onDismiss={() => {
            close();
            dismiss.mutate(b.id);
          }}
        />
      </View>
    </Sheet>
  );
}
