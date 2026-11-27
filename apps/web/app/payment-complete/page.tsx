import type { Metadata } from 'next';
import { Page } from '@/components/chrome';

export const metadata: Metadata = {
  title: 'Payment',
  robots: { index: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// Flutterwave redirects here after web checkout with ?status=&tx_ref=&transaction_id=.
// Credits and plans are applied by the webhook, not by this page: it only says what to do next.
export default async function PaymentComplete({ searchParams }: Props) {
  const params = await searchParams;
  const status = first(params.status).toLowerCase();
  const txRef = first(params.tx_ref).slice(0, 80);
  const ok = status === 'successful' || status === 'completed';
  const cancelled = status === 'cancelled';
  const title = ok ? 'Payment received' : cancelled ? 'Payment cancelled' : 'Payment not completed';

  return (
    <Page className="doc">
      <div className="wrap doc__in">
        <h1>{title}</h1>
        <div className="prose" style={{ marginTop: 20 }}>
          {ok ? (
            <p>
              Thank you. Return to the Arpedia app. Your credits or plan will appear within a minute.
              If they do not, close and reopen the app.
            </p>
          ) : cancelled ? (
            <p>
              You cancelled the payment and have not been charged. You can return to the Arpedia app
              and try again.
            </p>
          ) : (
            <p>
              We could not confirm this payment. If you were charged, your credits will still be
              added once the payment is confirmed. Otherwise return to the app and try again.
            </p>
          )}
          {txRef ? (
            <p>
              Reference: <code>{txRef}</code>
            </p>
          ) : null}
          <p>
            Need help? <a href="/support">Contact support</a> with your reference.
          </p>
        </div>
      </div>
    </Page>
  );
}
