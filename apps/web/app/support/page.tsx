import type { Metadata } from 'next';
import { Page } from '@/components/chrome';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with your Arpedia account, payments, reading, or reports.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return (
    <Page className="doc">
      <div className="wrap doc__in">
        <p className="eyebrow">Help</p>
        <h1>Support</h1>
        <p className="meta">We read every message.</p>
        <div className="prose">
          <p>
            Email us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will reply as
            soon as we can, usually within two working days.
          </p>
          <a className="btn btn-p" href={`mailto:${SUPPORT_EMAIL}`}>
            Email support
          </a>

          <h2>What to include</h2>
          <ul>
            <li>The email address on your Arpedia account.</li>
            <li>Your device and app version (Settings in the app).</li>
            <li>
              For payment issues, the payment reference (Flutterwave) or the store receipt or order
              number.
            </li>
            <li>A screenshot, if something looks wrong.</li>
          </ul>

          <h2>Common questions</h2>
          <h3>My subscription from the App Store or Google Play</h3>
          <p>
            Cancellations, refunds and billing for those purchases are managed by Apple or Google. In
            the app stores, open your subscriptions list and pick Arpedia. Deleting your Arpedia
            account does not cancel a store subscription.
          </p>
          <h3>I paid on the web and my credits are missing</h3>
          <p>
            Credits normally appear within a minute. If not, send us the payment reference from your
            Flutterwave receipt.
          </p>
          <h3>Reporting a person or a post</h3>
          <p>
            In the app, use Report on any review, comment, room or message, and Block on a
            member&apos;s profile. For urgent safety concerns, email us with the details.
          </p>
          <h3>Authors</h3>
          <p>
            For upload, review status or earnings questions, email us from your author account
            address, or write to <a href="mailto:authors@arpedia.africa">authors@arpedia.africa</a>.
          </p>
          <h3>Deleting my account</h3>
          <p>
            See <a href="/legal/delete-account">how to delete your account</a>.
          </p>
          <h3>Copyright concerns</h3>
          <p>
            See our <a href="/legal/copyright">copyright notice process</a>.
          </p>
        </div>
      </div>
    </Page>
  );
}
