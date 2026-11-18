import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthFrame } from '@/components/auth-frame';
import { getStaff } from '@/lib/staff';
import { SetupForm } from './setup-form';

export const metadata: Metadata = { title: 'Set up two-step · Arpedia Admin' };
export const dynamic = 'force-dynamic';

/**
 * First visit (flow 16 rule 14): a new staff member enrols an authenticator before anything else.
 * The prototype has no screen for this; it reuses the s-signin-2fa card and its pieces.
 */
export default async function SetupPage() {
  const staff = await getStaff();
  if (!staff) redirect('/sign-in');
  if (staff.mfaEnrolled && staff.mfaOk) redirect('/');
  if (staff.mfaEnrolled) redirect('/sign-in/two-step');
  return (
    <AuthFrame
      title="One more step."
      lead="Every staff account uses two-step sign-in. It protects readers' data and authors' money."
    >
      <SetupForm />
    </AuthFrame>
  );
}
