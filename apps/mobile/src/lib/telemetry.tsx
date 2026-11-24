import type { ReactNode } from 'react';
import * as Sentry from '@sentry/react-native';
import { PostHogProvider } from 'posthog-react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

// Errors go to Sentry and feature flags come from PostHog. Both stay off when no key is set
// (local builds), so nothing is sent from developer machines.
export function initSentry() {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0.1, sendDefaultPii: false });
}

export function Telemetry({ children }: { children: ReactNode }) {
  if (!posthogKey) return <>{children}</>;
  return (
    <PostHogProvider
      apiKey={posthogKey}
      options={{ host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com' }}
      autocapture={false}
    >
      {children}
    </PostHogProvider>
  );
}

/** Sends an error to Sentry with tags (no-op without a DSN). */
export function captureError(e: unknown, tags: Record<string, string | number | null | undefined>) {
  if (!dsn) return;
  const clean = Object.fromEntries(
    Object.entries(tags).filter((t): t is [string, string | number] => t[1] != null),
  );
  Sentry.captureException(e instanceof Error ? e : new Error(String(e)), { tags: clean });
}

export const wrapRoot = (C: () => React.JSX.Element) => (dsn ? Sentry.wrap(C) : C);
