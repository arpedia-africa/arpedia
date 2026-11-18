import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { getStaff } from '@/lib/staff';
import { TwoStepForm } from './two-step-form';

export const metadata: Metadata = { title: 'Two-step code · Arpedia Admin' };
export const dynamic = 'force-dynamic';

/** s-signin-2fa: every sign-in, and again after 12 hours. */
export default async function TwoStepPage() {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  if (!staff.mfaEnrolled) redirect('/sign-in/two-step/setup');
  if (staff.mfaOk) redirect('/');
  return (
    <AuthFrame
      title="One more step."
      lead="Every staff account uses two-step sign-in. It protects readers' data and authors' money."
    >
      <TwoStepForm />
    </AuthFrame>
  );
}
