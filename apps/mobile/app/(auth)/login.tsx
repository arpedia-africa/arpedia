import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { validEmail } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { ForgotSheet, LoginView, type FieldErrors, type LoginValues } from '../../features/01/AuthViews';
import { useTrack } from '../../features/01/analytics';
import { signInWithGoogle } from '../../features/01/google';
import { signInWithPassword } from '../../features/01/passwordSignIn';
import { COPY, afterSignIn, isNetworkError, isRateLimited } from '../../features/01/session';

export default function Login() {
  const track = useTrack();
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<'email' | 'password' | 'form'>>({});
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const running = useRef(false);
  const [forgot, setForgot] = useState({ open: false, email: '', sent: false, busy: false, error: '' });

  const checkEmail = (email = values.email) =>
    validEmail(email) ? undefined : 'Enter a valid email address.';

  const submit = async () => {
    if (running.current) return;
    const emailErr = checkEmail();
    const pwErr = values.password ? undefined : 'Enter your password.';
    setErrors({ email: emailErr, password: pwErr });
    if (emailErr || pwErr) return;
    running.current = true;
    setBusy('password');
    try {
      const { data, error } = await signInWithPassword(values.email.trim(), values.password);
      if (error) {
        const reason = isNetworkError(error) ? 'network' : isRateLimited(error) ? 'rate_limited' : 'wrong';
        track('login_failed', { reason });
        if (reason === 'network') setErrors({ form: COPY.offline });
        else setErrors({ password: reason === 'rate_limited' ? COPY.tooMany : COPY.wrongLogin });
        return;
      }
      track('login_succeeded', { method: 'email' });
      await afterSignIn(data.user.id);
    } catch (e) {
      setErrors({ form: isNetworkError(e) ? COPY.offline : COPY.generic });
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  const google = async () => {
    if (running.current) return;
    running.current = true;
    setBusy('google');
    setErrors({});
    try {
      if (!(await signInWithGoogle())) return; // picker closed: back to the form, no message
      const { data } = await supabase.auth.getUser();
      track('login_succeeded', { method: 'google' });
      if (data.user) await afterSignIn(data.user.id);
    } catch (e) {
      track('login_failed', { reason: 'google' });
      setErrors({ form: isNetworkError(e) ? COPY.offline : COPY.googleFailed });
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  const sendReset = async () => {
    if (!validEmail(forgot.email)) return setForgot((f) => ({ ...f, error: 'Enter a valid email address.' }));
    setForgot((f) => ({ ...f, busy: true, error: '' }));
    const { error } = await supabase.auth.resetPasswordForEmail(forgot.email.trim(), {
      redirectTo: 'arpedia://reset-password',
    });
    // Same reply for every email (rule 11); only a dead network is worth saying.
    setForgot((f) => ({
      ...f,
      busy: false,
      sent: !(error && isNetworkError(error)),
      error: error && isNetworkError(error) ? COPY.offline : '',
    }));
  };

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <LoginView
        values={values}
        errors={errors}
        busy={busy}
        onChange={(v) => {
          setValues((cur) => ({ ...cur, ...v }));
          setErrors((cur) => ({
            ...cur,
            ...(v.email !== undefined ? { email: undefined } : {}),
            password: undefined,
            form: undefined,
          }));
        }}
        onBlur={(f) => f === 'email' && values.email && setErrors((cur) => ({ ...cur, email: checkEmail() }))}
        onSubmit={submit}
        onGoogle={google}
        onForgot={() => setForgot({ open: true, email: values.email, sent: false, busy: false, error: '' })}
        onCreate={() => router.replace('/(auth)/signup')}
      />
      <ForgotSheet
        open={forgot.open}
        onClose={() => setForgot((f) => ({ ...f, open: false }))}
        email={forgot.email}
        onEmail={(email) => setForgot((f) => ({ ...f, email, error: '' }))}
        error={forgot.error || undefined}
        sent={forgot.sent}
        busy={forgot.busy}
        onSend={sendReset}
      />
    </Screen>
  );
}
