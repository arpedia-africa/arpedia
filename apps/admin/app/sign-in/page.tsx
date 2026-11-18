import type { Metadata } from 'next';
import { AuthFrame } from '@/components/auth-frame';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in · Arpedia Admin' };

/** Staff sign in: the s-signin markup inside the prototype's full-screen console frame. */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthFrame
      title="Run the reading room."
      lead="Books, people, safety and money for Arpedia, in one place. Staff accounts only."
    >
      <SignInForm oauthError={error === 'google' || error === 'refused' ? error : undefined} />
    </AuthFrame>
  );
}
