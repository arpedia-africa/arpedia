import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@arpedia/ui';
import { PASSWORD_MIN, PRIVACY_URL, TERMS_URL, validEmail, validName, validPassword } from '@arpedia/core';
import { supabase } from '@/lib/supabase';
import { SignupView, type FieldErrors, type SignupValues } from '../../features/01/AuthViews';
import { useTrack } from '../../features/01/analytics';
import { signInWithGoogle } from '../../features/01/google';
import {
  COPY,
  afterSignIn,
  isAccountDeleted,
  isNetworkError,
  registerDevice,
} from '../../features/01/session';
import { onboardingClock } from '../../features/01/steps';

// Policy versions the reader accepts by creating an account (stored with the time, rule 1).
const TERMS_VERSION = 1;
const PRIVACY_VERSION = 1;

type Errors = FieldErrors<'name' | 'email' | 'password' | 'form' | 'google'>;

const check = {
  name: (v: SignupValues) => (validName(v.name) ? undefined : 'Enter your name.'),
  email: (v: SignupValues) => (validEmail(v.email) ? undefined : 'Enter a valid email address.'),
  password: (v: SignupValues) =>
    validPassword(v.password) ? undefined : `Use at least ${PASSWORD_MIN} characters.`,
};

export default function Signup() {
  const track = useTrack();
  const [values, setValues] = useState<SignupValues>({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const running = useRef(false);

  useEffect(() => {
    onboardingClock.start();
    track('signup_started');
  }, [track]);

  const submit = async () => {
    if (running.current) return; // two taps create one account
    const next: Errors = {
      name: check.name(values),
      email: check.email(values),
      password: check.password(values),
    };
    setErrors(next);
    if (next.name || next.email || next.password) return;
    running.current = true;
    setBusy('password');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          data: {
            full_name: values.name.trim(),
            terms_version: TERMS_VERSION,
            privacy_version: PRIVACY_VERSION,
          },
        },
      });
      if (error) {
        if (isNetworkError(error)) setErrors({ form: COPY.offline });
        else if (error.code === 'user_already_exists' || /already registered/i.test(error.message))
          setEmailTaken(true);
        else if (error.code === 'weak_password')
          setErrors({ password: `Use at least ${PASSWORD_MIN} characters.` });
        else setErrors({ form: COPY.generic });
        return;
      }
      track('signup_completed', { method: 'email' });
      if (!data.session) {
        // Email confirmation is not required (rule 5); a project that requires it lands on Log in.
        router.replace('/(auth)/login');
        return;
      }
      void registerDevice();
      router.replace({ pathname: '/(onboarding)/interests', params: { fresh: '1' } });
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
      if (!(await signInWithGoogle())) return;
      const { data } = await supabase.auth.getUser();
      // An account Google already had signs in here too: that is a login, not a sign-up.
      const fresh = !!data.user && Date.now() - Date.parse(data.user.created_at) < 5 * 60_000;
      track(fresh ? 'signup_completed' : 'login_succeeded', { method: 'google' });
      if (data.user) await afterSignIn(data.user.id);
    } catch (e) {
      setErrors({
        google: isAccountDeleted(e) ? COPY.deleted : isNetworkError(e) ? COPY.offline : COPY.googleFailed,
      });
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  return (
    <Screen top="org" contentStyle={{ flexGrow: 1 }}>
      <SignupView
        values={values}
        errors={errors}
        busy={busy}
        emailTakenLink={emailTaken}
        onChange={(v) => {
          setValues((cur) => ({ ...cur, ...v }));
          const key = Object.keys(v)[0] as keyof SignupValues;
          if (key === 'email') setEmailTaken(false);
          setErrors((cur) => ({ ...cur, [key]: undefined, form: undefined }));
        }}
        onBlur={(f) => values[f] && setErrors((cur) => ({ ...cur, [f]: check[f](values) }))}
        onSubmit={submit}
        onGoogle={google}
        onLogin={() => router.replace('/(auth)/login')}
        onTerms={() => void Linking.openURL(TERMS_URL)}
        onPrivacy={() => void Linking.openURL(PRIVACY_URL)}
      />
    </Screen>
  );
}
