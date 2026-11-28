import { appLinkRoute } from '@arpedia/core';
import { noteIncomingLink } from '../features/15/signupSource';

// App links (coordinator request, 27 Nov): https://arpedia.africa/c, /r, /book, /author, /community
// and /account open their screen; any other arpedia.africa path opens Home through the start screen.
// Other links (the password reset, the dev client) pass through unchanged.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    noteIncomingLink(path); // a shared book link counts as the sign-up source (15-21)
    return appLinkRoute(path) ?? path;
  } catch {
    return path;
  }
}
