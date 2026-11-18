import type { Metadata } from 'next';
import { AuthFrame } from '@/components/auth-frame';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Reset password · Arpedia Admin' };

/** s-signin-reset. */
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthFrame
      title="Back in, safely."
      lead="We'll send a link to your work email. It works once and expires in 30 minutes."
    >
      <ResetForm expired={error === 'expired'} />
    </AuthFrame>
  );
}
