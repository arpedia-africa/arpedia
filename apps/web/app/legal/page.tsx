import type { Metadata } from 'next';
import { Page } from '@/components/chrome';
import { POLICIES } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Policies',
  description:
    'Arpedia terms, privacy, community guidelines, copyright, author agreement, refunds and account deletion.',
  alternates: { canonical: '/legal' },
};

export default function LegalIndex() {
  return (
    <Page className="doc">
      <div className="wrap doc__in">
        <p className="eyebrow">Arpedia</p>
        <h1>Policies</h1>
        <p className="meta">The rules and promises behind the app, in plain words.</p>
        <ul className="policy-list">
          {POLICIES.map((p) => (
            <li key={p.slug}>
              <a href={`/legal/${p.slug}`}>
                <b>{p.title}</b>
                <span>{p.subtitle}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
