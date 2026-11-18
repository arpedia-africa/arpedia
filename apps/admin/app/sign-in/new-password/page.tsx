import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { serverSupabase } from '@/lib/supabase/server';
import { NewPasswordForm } from './new-password-form';

export const metadata: Metadata = { title: 'New password · Arpedia Admin' };
export const dynamic = 'force-dynamic';

/** After the reset link. The prototype has no screen for this; it reuses the s-signin-reset card. */
export default async function NewPasswordPage() {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in/reset?error=expired');
  return (
    <AuthFrame
      title="Back in, safely."
      lead="We'll send a link to your work email. It works once and expires in 30 minutes."
    >
      <NewPasswordForm />
    </AuthFrame>
  );
}
