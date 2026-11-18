import type { Metadata } from 'next';
import Link from 'next/link';
import type { StaffRole } from '@arpedia/core';
import { AuthFrame } from '@/components/auth-frame';
import { roleLabel } from '@/lib/staff-rules';
import { AcceptForm } from './accept-form';

export const metadata: Metadata = { title: 'Join Arpedia Admin' };
export const dynamic = 'force-dynamic';

interface Invite {
  email: string;
  full_name: string;
  role: StaffRole;
  state: 'open' | 'used' | 'revoked' | 'expired';
}

/**
 * The invite link (flow 16 rule 14): set a password, then authenticator setup. The prototype has
 * no screen for this; it reuses the sign-in card. Used or expired links get a "request a new link" page.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let invite: Invite | null = null;
  let offline = false;
  try {
    const r = await fetch(`${process.env.ARPEDIA_API_URL ?? 'http://127.0.0.1:8787'}/v1/staff-invites/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    if (r.ok) invite = (await r.json()) as Invite;
  } catch {
    offline = true;
  }
  return (
    <AuthFrame
      title="Run the reading room."
      lead="Books, people, safety and money for Arpedia, in one place. Staff accounts only."
    >
      {invite?.state === 'open' ? (
        <AcceptForm token={token} email={invite.email} name={invite.full_name} role={roleLabel[invite.role]} />
      ) : (
        <div className="auth__card">
          <div className="stack s4">
            <h2>{offline ? 'No connection' : 'This invite link has expired'}</h2>
            <p className="muted">
              {offline
                ? 'Check your network and refresh the page.'
                : 'Invite links work once and expire after 72 hours. Ask the Super admin who invited you to send a new one.'}
            </p>
          </div>
          <Link className="btn btn-p lg block" href="/sign-in">
            Go to sign in
          </Link>
        </div>
      )}
    </AuthFrame>
  );
}
