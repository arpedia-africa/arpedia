import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { signupSourceFrom, type SignupSourceToken } from '@arpedia/core';

// Signups by source (flow 15 rule 26, 15-21 app half): `signup_completed` carries `source`, from
// the Play install referrer or a shared book link that opened the app before sign-up.
const BOOK_LINK_KEY = 'arpedia.signup.book-link';
const BOOK_LINK = /^https?:\/\/(www\.)?arpedia\.africa\/book\//i;
const REFERRER_WAIT_MS = 1500;

/** Called for every incoming link: remembers that a shared book link opened the app. */
export function noteIncomingLink(url: string) {
  if (BOOK_LINK.test(url)) AsyncStorage.setItem(BOOK_LINK_KEY, '1').catch(() => {});
}

let referrer: Promise<string | null> | null = null;

/** The Play install referrer, read once per app run; null off Android, off Play or after 1.5 s. */
function installReferrer(): Promise<string | null> {
  if (Platform.OS !== 'android') return Promise.resolve(null);
  referrer ??= Promise.race([
    Application.getInstallReferrerAsync().catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), REFERRER_WAIT_MS)),
  ]);
  return referrer;
}

/** Starts reading the referrer early (sign-up screen mount) so the event isn't held up. */
export function prefetchSignupSource() {
  void installReferrer();
}

/** The reader's sign-up source; clears the book-link mark once used. Never throws. */
export async function signupSource(): Promise<SignupSourceToken> {
  try {
    const [ref, link] = await Promise.all([
      installReferrer(),
      AsyncStorage.getItem(BOOK_LINK_KEY).catch(() => null),
    ]);
    if (link) AsyncStorage.removeItem(BOOK_LINK_KEY).catch(() => {});
    return signupSourceFrom({ referrer: ref, bookLink: link === '1' });
  } catch {
    return 'unknown';
  }
}
