import type { Metadata } from 'next';
import { Page, StoreBadges } from '@/components/chrome';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false },
};

// The app sends web subscribers here (WEB_ACCOUNT_URL). Until a web account area exists, this page
// says where to manage a plan and how to get help.
export default function AccountPage() {
  return (
    <Page className="doc">
      <div className="wrap doc__in">
        <h1>Your account</h1>
        <div className="prose" style={{ marginTop: 20 }}>
          <p>
            Your plan, credits and reading all live in the Arpedia app. Open <b>Profile</b>, then{' '}
            <b>Subscription</b> to see your plan or to pause or cancel.
          </p>
          <p>
            Subscribed through Google Play or the App Store? Change or cancel it in your store subscriptions.
            Paid on the web? <a href="/support">Write to support</a> and we will help with your plan.
          </p>
          <StoreBadges />
          <p>
            To delete your account, see <a href="/legal/delete-account">how to delete your account</a>.
          </p>
        </div>
      </div>
    </Page>
  );
}
