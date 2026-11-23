// Flow 17 · reports `first_open_after_v25` (yes or no) once, after the native first-launch cleanup
// (plugins/v25-cleanup.js) has removed v25's local data and left files/arpedia-launch.json.
// No personal data: just whether this first open was an update over an older install.
import { useEffect } from 'react';
import { File, Paths } from 'expo-file-system';
import { usePostHog } from 'posthog-react-native';

const NOTE = 'arpedia-launch.json';

export function readLaunchNote(text: string): 'yes' | 'no' | null {
  try {
    const v = (JSON.parse(text) as { after_v25?: unknown }).after_v25;
    return typeof v === 'boolean' ? (v ? 'yes' : 'no') : null;
  } catch {
    return null;
  }
}

function FirstOpenReport() {
  const posthog = usePostHog();
  useEffect(() => {
    try {
      const note = new File(Paths.document, NOTE);
      if (!note.exists) return;
      const after = readLaunchNote(note.textSync());
      if (after) posthog?.capture('first_open_after_v25', { after_v25: after });
      note.delete();
    } catch {
      // A missing or unreadable note only loses one analytics event.
    }
  }, [posthog]);
  return null;
}

/** Mounted once inside Telemetry (PostHog), beside the app. */
export function FirstOpen() {
  return process.env.EXPO_PUBLIC_POSTHOG_KEY ? <FirstOpenReport /> : <CleanupNote />;
}

/** Local builds send nothing; the note is still removed. */
function CleanupNote() {
  useEffect(() => {
    try {
      const note = new File(Paths.document, NOTE);
      if (note.exists) note.delete();
    } catch {
      // Nothing to do.
    }
  }, []);
  return null;
}
