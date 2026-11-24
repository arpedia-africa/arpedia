import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { PASSWORD_MIN, validPassword } from '@arpedia/core';
import { Screen } from '@arpedia/ui';
import { supabase } from '@/lib/supabase';
import { NewPasswordView } from '../features/01/AuthViews';
import { COPY, afterSignIn, isAccountDeleted, isNetworkError } from '../features/01/session';

/** Session tokens from the reset link: `#access_token=…&refresh_token=…` or `?code=…`; errors too. */
function linkParams(url: string) {
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash?.split('?')[1] ?? '';
  return new URLSearchParams(hash || query);
}

// arpedia://reset-password, opened from the reset email (rule 11). The link signs the reader in
// for recovery; a new password then ends every other session.
export default function ResetPassword() {
  const url = Linking.useURL();
  const [state, setState] = useState<'checking' | 'ready' | 'expired'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!url) {
      // Opened without a link (or it never arrived): nothing to recover with.
      const t = setTimeout(() => setState((st) => (st === 'checking' ? 'expired' : st)), 2000);
      return () => clearTimeout(t);
    }
    const p = linkParams(url);
    const done = ({ error: e }: { error: unknown }) => setState(e ? 'expired' : 'ready');
    const at = p.get('access_token');
    const rt = p.get('refresh_token');
    const code = p.get('code');
    if (p.get('error') || p.get('error_code')) setState('expired');
    else if (at && rt) void supabase.auth.setSession({ access_token: at, refresh_token: rt }).then(done);
    else if (code) void supabase.auth.exchangeCodeForSession(code).then(done);
    else setState('expired');
  }, [url]);

  const check = () => {
    const bad = validPassword(password) ? undefined : `Use at least ${PASSWORD_MIN} characters.`;
    setError(bad);
    return !bad;
  };

  const submit = async () => {
    if (busy || !check()) return;
    setBusy(true);
    setFormError(null);
    try {
      const { data, error: e } = await supabase.auth.updateUser({ password });
      if (e) throw e;
      await supabase.auth.signOut({ scope: 'others' });
      await afterSignIn(data.user.id);
    } catch (e) {
      setFormError(isAccountDeleted(e) ? COPY.deleted : isNetworkError(e) ? COPY.offline : COPY.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <NewPasswordView
        password={password}
        error={error}
        formError={formError}
        busy={busy || state === 'checking'}
        expired={state === 'expired'}
        onChange={(v) => {
          setPassword(v);
          if (error) setError(undefined);
        }}
        onBlur={() => password && check()}
        onSubmit={() => void submit()}
        onLogin={() => router.replace('/(auth)/login')}
      />
    </Screen>
  );
}
