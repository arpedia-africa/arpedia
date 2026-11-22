import { serverSupabase } from '@/lib/supabase/server';

/**
 * Fresh two-step proof for a money change: verifying the code renews the session's AAL2 time, which
 * the RPCs check (changes need a code from the last 10 minutes). Returns an error to show, or null.
 */
export async function verifyCode(code: string): Promise<string | null> {
  const supabase = await serverSupabase();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find(f => f.status === 'verified');
  if (!factor) return 'Set up two-step sign-in first.';
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.replace(/\s/g, '') });
  return error ? "That code didn't work. Check your authenticator and try again." : null;
}
