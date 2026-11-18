import { useState } from 'react';
import { View } from 'react-native';
import { Btn, Field, IconButton, Link, Sheet, Text, useTheme } from '@arpedia/ui';
import { PASSWORD_MIN } from '@arpedia/core';
import { DividerOr, FormError, OnbHero, OnbSheet } from './parts';

// s-login and s-signup bodies (below the status bar). Pure views: the routes own state and calls,
// and tools/parity renders these with the prototype's values.

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** `.ib.onb-eye`: 36×36, margin-right −8, ink-3. Shows or hides the password. */
function Eye({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const { c, s } = useTheme();
  return (
    <IconButton
      icon="eye"
      label={shown ? 'Hide password' : 'Show password'}
      onPress={onToggle}
      color={c.ink3}
      style={{ width: s(36), height: s(36), marginRight: s(-8) }}
    />
  );
}

/** `.form` inside `.onb-sheet`: padding 22 20 24, gap 16. */
function Form({ children }: { children: React.ReactNode }) {
  const { s } = useTheme();
  return (
    <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24), gap: s(16) }}>
      {children}
    </View>
  );
}

/** `.t-sm.t-soft.t-center.onb-alt`: "New to Arpedia? Create an account". */
function AltLine({ lead, link, onPress }: { lead: string; link: string; onPress?: () => void }) {
  const { s } = useTheme();
  return (
    <View style={{ marginTop: s(4), flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
      <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
        {`${lead} `}
      </Text>
      <Text
        size={13.5}
        weight={600}
        color="orgInk"
        accessibilityRole="link"
        onPress={onPress}
        suppressHighlighting
        style={{ lineHeight: s(13.5) * 1.45 }}
      >
        {link}
      </Text>
    </View>
  );
}

export interface LoginValues {
  email: string;
  password: string;
}
export interface LoginViewProps {
  values: LoginValues;
  errors: FieldErrors<'email' | 'password' | 'form'>;
  busy?: 'password' | 'google' | null;
  onChange: (v: Partial<LoginValues>) => void;
  onBlur?: (field: keyof LoginValues) => void;
  onSubmit: () => void;
  onGoogle: () => void;
  onForgot: () => void;
  onCreate: () => void;
}

export function LoginView({
  values,
  errors,
  busy,
  onChange,
  onBlur,
  onSubmit,
  onGoogle,
  onForgot,
  onCreate,
}: LoginViewProps) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <OnbHero title="Welcome back" sub="Log in to continue reading." />
      <OnbSheet>
        <Form>
          <Field
            label="Email"
            placeholder="you@example.com"
            value={values.email}
            onChangeText={(email) => onChange({ email })}
            onBlur={() => onBlur?.('email')}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <Field
            label="Password"
            placeholder="Your password"
            value={values.password}
            onChangeText={(password) => onChange({ password })}
            onBlur={() => onBlur?.('password')}
            error={errors.password}
            secureTextEntry={!shown}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            trailing={<Eye shown={shown} onToggle={() => setShown((v) => !v)} />}
          />
          <View style={{ alignItems: 'flex-start' }}>
            <Link label="Forgot password?" onPress={onForgot} />
          </View>
          <View style={{ gap: 8 }}>
            <Btn
              label="Log in"
              block
              onPress={onSubmit}
              loading={busy === 'password'}
              disabled={!!busy && busy !== 'password'}
            />
            <FormError>{errors.form}</FormError>
          </View>
          <DividerOr />
          <Btn
            label="Continue with Google"
            variant="g"
            icon="g"
            block
            onPress={onGoogle}
            loading={busy === 'google'}
            disabled={!!busy && busy !== 'google'}
          />
          <AltLine lead="New to Arpedia?" link="Create an account" onPress={onCreate} />
        </Form>
      </OnbSheet>
    </>
  );
}

export interface SignupValues {
  name: string;
  email: string;
  password: string;
}
export interface SignupViewProps {
  values: SignupValues;
  errors: FieldErrors<'name' | 'email' | 'password' | 'form' | 'google'>;
  busy?: 'password' | 'google' | null;
  onChange: (v: Partial<SignupValues>) => void;
  onBlur?: (field: keyof SignupValues) => void;
  onSubmit: () => void;
  onGoogle: () => void;
  onLogin: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
  /** The "This email already has an account. Log in?" link under Email. */
  emailTakenLink?: boolean;
}

export function SignupView({
  values,
  errors,
  busy,
  onChange,
  onBlur,
  onSubmit,
  onGoogle,
  onLogin,
  onTerms,
  onPrivacy,
  emailTakenLink,
}: SignupViewProps) {
  const { s } = useTheme();
  const [shown, setShown] = useState(false);
  const small = { size: 12, style: { lineHeight: s(12) * 1.4 } } as const;
  return (
    <>
      <OnbHero title="Create your account" sub="Join Arpedia to read and connect." />
      <OnbSheet>
        <Form>
          <Field
            label="Full name"
            placeholder="Ada Writer"
            value={values.name}
            onChangeText={(name) => onChange({ name })}
            onBlur={() => onBlur?.('name')}
            error={errors.name}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={80}
            returnKeyType="next"
          />
          <View style={{ gap: s(6) }}>
            <Field
              label="Email"
              placeholder="you@example.com"
              value={values.email}
              onChangeText={(email) => onChange({ email })}
              onBlur={() => onBlur?.('email')}
              error={emailTakenLink ? undefined : errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            {emailTakenLink ? (
              <Text size={12} weight={500} color="err">
                {'This email already has an account. '}
                <Text size={12} weight={600} color="orgInk" accessibilityRole="link" onPress={onLogin}>
                  Log in?
                </Text>
              </Text>
            ) : null}
          </View>
          <Field
            label="Password"
            placeholder={`At least ${PASSWORD_MIN} characters`}
            value={values.password}
            onChangeText={(password) => onChange({ password })}
            onBlur={() => onBlur?.('password')}
            error={errors.password}
            hint={`Use at least ${PASSWORD_MIN} characters.`}
            secureTextEntry={!shown}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            trailing={<Eye shown={shown} onToggle={() => setShown((v) => !v)} />}
          />
          <View style={{ gap: 8 }}>
            <Btn
              label="Create account"
              block
              onPress={onSubmit}
              loading={busy === 'password'}
              disabled={!!busy && busy !== 'password'}
            />
            <FormError>{errors.form}</FormError>
          </View>
          <DividerOr />
          <View style={{ gap: 8 }}>
            <Btn
              label="Sign up with Google"
              variant="g"
              icon="g"
              block
              onPress={onGoogle}
              loading={busy === 'google'}
              disabled={!!busy && busy !== 'google'}
            />
            <FormError>{errors.google}</FormError>
          </View>
          <AltLine lead="Already have an account?" link="Log in" onPress={onLogin} />
          <Text {...small} color="ink3" center>
            {'By creating an account you agree to the '}
            <Text {...small} color="ink3" weight={600} accessibilityRole="link" onPress={onTerms}>
              Terms
            </Text>
            {' and '}
            <Text {...small} color="ink3" weight={600} accessibilityRole="link" onPress={onPrivacy}>
              Privacy Policy
            </Text>
            .
          </Text>
        </Form>
      </OnbSheet>
    </>
  );
}

/** Forgot password (rule 11, Q91 default: a sheet). Same reply for every email. */
export function ForgotSheet({
  open,
  onClose,
  email,
  onEmail,
  error,
  sent,
  busy,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  onEmail: (v: string) => void;
  error?: string;
  sent: boolean;
  busy: boolean;
  onSend: () => void;
}) {
  const { s } = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title="Reset your password">
      <View style={{ gap: s(16), paddingHorizontal: s(16), paddingBottom: s(16) }}>
        {sent ? (
          <Text color="ink2">
            If that email has an account, a link is on its way. It works once, for 60 minutes.
          </Text>
        ) : (
          <>
            <Text color="ink2">We’ll email you a link to set a new password.</Text>
            <Field
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={onEmail}
              error={error}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={onSend}
            />
          </>
        )}
        <Btn
          label={sent ? 'Done' : 'Send reset link'}
          block
          onPress={sent ? onClose : onSend}
          loading={busy}
        />
      </View>
    </Sheet>
  );
}
