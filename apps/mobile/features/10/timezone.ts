// Flow 10 rule 19 / flow 15 rule 4: quiet hours use the device time zone. On sign-in and every
// return to the app, the phone's zone is written to notification_preferences when it differs.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { useSession } from '../01/session';
import { prefsKey } from './data';

/** The phone's IANA time zone ("Africa/Lagos"), or null when the runtime can't tell. */
export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

async function syncTimeZone() {
  const tz = deviceTimeZone();
  if (!tz) return;
  const { data, error } = await supabase.rpc('get_notification_preferences');
  if (error || !data) return;
  if ((data as { timezone?: string | null }).timezone === tz) return;
  // The server refuses zones Postgres doesn't know; quiet hours then stay on the saved zone.
  const saved = await supabase.rpc('set_notification_preferences', { p_patch: { timezone: tz } });
  if (!saved.error) queryClient.setQueryData(prefsKey, saved.data);
}

export function useSyncTimeZone() {
  const uid = useSession()?.user.id;
  useEffect(() => {
    if (!uid) return;
    void syncTimeZone().catch(() => undefined);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncTimeZone().catch(() => undefined);
    });
    return () => sub.remove();
  }, [uid]);
}
