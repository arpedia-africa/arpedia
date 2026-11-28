'use client';

import { useSyncExternalStore } from 'react';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** Whether the browser is online (the console needs a connection: saves are disabled offline). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** The offline banner shown above settings pages (flow 16 states: Offline). */
export function OfflineNote({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="note warn" role="status">
      <span className="grow">
        <b>You're offline</b>Saving is off until the connection is back. Nothing you see has changed.
      </span>
    </div>
  );
}

/** The same banner for server-rendered pages (roles, audit), which can't call the hook themselves. */
export function OfflineBanner() {
  return <OfflineNote online={useOnline()} />;
}
