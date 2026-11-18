import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';

// Google sign-in through the device's account picker, then Supabase signInWithIdToken (rule 6).
// Needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (the OAuth web client set on the Supabase Google provider).
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
let configured = false;

export const googleConfigured = !!webClientId;

/** Returns true when signed in, false when the reader closed the picker. Throws on failure. */
export async function signInWithGoogle(): Promise<boolean> {
  if (!webClientId) throw new Error('google_not_configured');
  if (!configured) {
    GoogleSignin.configure({ webClientId });
    configured = true;
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (isCancelledResponse(res)) return false;
    const token = res.data.idToken;
    if (!token) throw new Error('google_no_id_token');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
    if (error) throw error;
    return true;
  } catch (e) {
    if (
      isErrorWithCode(e) &&
      (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)
    )
      return false;
    throw e;
  }
}

export async function signOutGoogle() {
  if (configured) await GoogleSignin.signOut().catch(() => {});
}
