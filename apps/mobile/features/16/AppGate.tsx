import { useCallback, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import * as Application from 'expo-application';
import { usePathname } from 'expo-router';
import { usePostHog } from 'posthog-react-native';
import { useSession } from '../01/session';
import {
  useAcceptPolicies,
  useAppConfig,
  useOnShown,
  usePendingPolicies,
  type PendingPolicy,
} from './config';
import { ForceUpdateView, MaintenanceView, PolicyAcceptView } from './GateViews';

type GateEvent =
  'maintenance_screen_shown' | 'force_update_shown' | 'policy_accept_shown' | 'policy_accepted';
type Track = (event: GateEvent, props?: Record<string, string | number>) => void;

function usePostHogTrack(): Track {
  const posthog = usePostHog();
  return useCallback<Track>((event, props) => posthog.capture(event, props), [posthog]);
}
const noop: Track = () => {};
const useTrack: () => Track = process.env.EXPO_PUBLIC_POSTHOG_KEY ? usePostHogTrack : () => noop;

// Kit / parity galleries used for screen checks never show a notice.
const KIT_ROUTE = /^\/(kit|parity|gate-preview)(\/|$)/;
// Routes that stay open in maintenance mode so books on the phone keep opening (rule 26): the
// Library tab (flow 05) and the reader `/read/<id>` (flow 04).
const OPEN_IN_MAINTENANCE = /^\/(library|read\/[^/]+|read\/end\/[^/]+)$/;

const storeUrl = () => `market://details?id=${Application.applicationId ?? 'com.arpedia.reader'}`;

/**
 * Flow 16 app side. Order: force update, then maintenance, then policies to accept again. Each is a
 * full-screen notice over the current route, re-checked on every screen change (the config query
 * refetches when stale) and when the app returns to the foreground. A failed config load never
 * blocks the app.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const userId = session?.user.id;
  const cfg = useAppConfig();
  const pending = usePendingPolicies(userId);
  const accept = useAcceptPolicies(userId);
  const track = useTrack();

  const kit = KIT_ROUTE.test(pathname);
  const forceUpdate = !kit && cfg.data?.force_update === true;
  const maintenanceOn = !kit && !forceUpdate && cfg.data?.maintenance.on === true;
  const maintenance = maintenanceOn && !OPEN_IN_MAINTENANCE.test(pathname);
  // Accept-again blocks the whole app (rule 38); held back only while maintenance is on.
  const policies = !kit && !forceUpdate && !maintenanceOn ? (pending.data ?? []) : [];
  const askPolicies = policies.length > 0;

  useOnShown(forceUpdate, () => track('force_update_shown'));
  useOnShown(maintenance, () => track('maintenance_screen_shown'));
  useOnShown(askPolicies, () =>
    policies.forEach((p) => track('policy_accept_shown', { policy: p.slug, version: p.version })),
  );

  const onAccept = () =>
    accept.mutate(
      policies.map((p) => p.id),
      {
        onSuccess: () =>
          policies.forEach((p) => track('policy_accepted', { policy: p.slug, version: p.version })),
      },
    );
  const openPolicy = (p: PendingPolicy) => void Linking.openURL(`https://arpedia.africa/legal/${p.slug}`);

  let overlay: ReactNode = null;
  if (forceUpdate)
    overlay = (
      <ForceUpdateView
        minVersion={cfg.data?.min_version ?? null}
        onUpdate={() => void Linking.openURL(storeUrl())}
      />
    );
  else if (maintenance)
    overlay = (
      <MaintenanceView
        message={cfg.data?.maintenance.message ?? null}
        checking={cfg.isFetching}
        onRetry={() => void cfg.refetch()}
      />
    );
  else if (askPolicies)
    overlay = (
      <PolicyAcceptView
        policies={policies}
        accepting={accept.isPending}
        error={accept.isError ? "Couldn't save. Check your connection and try again." : null}
        onOpen={openPolicy}
        onAccept={onAccept}
      />
    );

  return (
    <View style={{ flex: 1 }}>
      {children}
      {overlay ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>{overlay}</View>
      ) : null}
    </View>
  );
}
