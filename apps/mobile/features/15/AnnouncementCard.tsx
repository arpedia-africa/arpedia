import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Petals, Press, Text, useTheme } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { openTarget, type Target } from './push';

// Home announcement card (flow 15 rule 21), mirroring the admin preview `.sy-bcard`
// (`node tools/screen.mjs --admin banner-edit --css`). Flow 02 places <HomeAnnouncements /> on Home.

export interface Banner {
  id: string;
  headline: string;
  body: string | null;
  button_label: string | null;
  target: Target | null;
  dismissible: boolean;
}

const KEY = ['banners', 'home_top'];

/** Live Home banners for this reader (audience, dates and dismissals applied by the server). */
export function useHomeBanners() {
  return useQuery({
    queryKey: KEY,
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_active_banners', {
        p_placement: 'home_top',
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

/** Up to two live Home banners; counts shown and tapped, dismiss hides it for good. Nothing when none. */
export function HomeAnnouncements() {
  const { s } = useTheme();
  const qc = useQueryClient();
  const { data } = useHomeBanners();
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('dismiss_banner', { p_banner: id });
      if (error) throw error;
    },
    onMutate: (id) => qc.setQueryData<Banner[]>(KEY, (old) => old?.filter((b) => b.id !== id)),
    onError: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
  const ids = (data ?? []).map((b) => b.id).join(',');
  useEffect(() => {
    for (const id of ids.split(',').filter(Boolean))
      void supabase.rpc('banner_event', { p_banner: id, p_kind: 'shown' });
  }, [ids]);
  if (!data?.length) return null;
  return (
    <View style={{ gap: s(12) }}>
      {data.map((b) => (
        <AnnouncementCard
          key={b.id}
          banner={b}
          onOpen={() => {
            void supabase.rpc('banner_event', { p_banner: b.id, p_kind: 'tapped' });
            openTarget(b.target);
          }}
          onDismiss={() => dismiss.mutate(b.id)}
        />
      ))}
    </View>
  );
}
