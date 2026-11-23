import { serverSupabase } from './supabase/server';

/** Actions that need a fresh code even inside a session (flow 16 rule 6). */
export type StepUpScope =
  | 'pricing_rules'
  | 'maintenance'
  | 'force_update'
  | 'ota_rollback'
  | 'rotate_key'
  | 'publish_policy'
  | 'release_payout'
  | 'confirm_price_change'
  | 'export_personal';

const BACKUP = /^[0-9a-f]{4}-[0-9a-f]{4}$/i;

/**
 * Turn a 6-digit authenticator code (or a backup code, xxxx-xxxx) into a single-use step-up for one
 * scope, valid 5 minutes. The authenticator code is verified with Supabase MFA, which renews the
 * session's TOTP proof; verify_stepup then records that proof once.
 */
export async function stepUp(code: string, scope: StepUpScope): Promise<{ id: string } | { error: string }> {
  const supabase = await serverSupabase();
  const clean = code.replace(/\s/g, '');
  if (BACKUP.test(clean)) {
    const { data, error } = await supabase.rpc('verify_stepup', { p_scope: scope, p_backup_code: clean });
    if (error || !data) return { error: "That code didn't work. Check it and try again." };
    return { id: data };
  }
  if (!/^\d{6}$/.test(clean)) return { error: 'Enter the 6-digit code from your authenticator app.' };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.find(f => f.status === 'verified');
  if (!factor) return { error: 'Set up two-step sign-in first.' };
  const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean });
  if (mfaError) return { error: "That code didn't work. Check your authenticator and try again." };
  const { data, error } = await supabase.rpc('verify_stepup', { p_scope: scope });
  if (error || !data) return { error: 'Code expired, enter a new one.' };
  return { id: data };
}

/** Plain words for the step-up errors every settings RPC can raise. */
export function stepUpError(message: string): string | null {
  if (message.includes('stepup_expired') || message.includes('stepup_used')) return 'Code expired, enter a new one.';
  return null;
}
