import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Page } from '@/components/chrome';
import { fetchPublishedPolicy, policyBySlug, POLICIES } from '@/lib/legal';
import { BUNDLED } from '@/lib/legal-content';
import { SUPPORT_EMAIL } from '@/lib/site';

// Text comes from the api Worker's published version when there is one, refreshed about hourly.
export const revalidate = 3600;
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const policy = policyBySlug((await params).slug);
  if (!policy) return {};
  return {
    title: policy.title,
    description: policy.description,
    alternates: { canonical: `/legal/${policy.slug}` },
    openGraph: { title: `${policy.title} | Arpedia`, description: policy.description },
  };
}

const DELETE_MAIL = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my account')}`;

/** Always shown, even when the api is down (Google Play account deletion requirement). */
function DeleteSteps() {
  return (
    <section className="how" aria-labelledby="how-h">
      <h2 id="how-h">How to delete your Arpedia account</h2>
      <h3>In the app</h3>
      <ol>
        <li>Open Arpedia and sign in.</li>
        <li>
          Tap <b>Profile</b>, then <b>Settings</b>, then <b>Delete account</b> at the bottom.
        </li>
        <li>
          Read what will be removed, type <b>DELETE</b> and tap <b>Delete my account</b>.
        </li>
      </ol>
      <h3>Without the app</h3>
      <p>
        Email <a href={DELETE_MAIL}>{SUPPORT_EMAIL}</a> from the email address on your account, with the
        subject &quot;Delete my account&quot;. We reply to confirm it is you, then delete the account.
      </p>
      <a className="btn btn-p" href={DELETE_MAIL}>
        Email a deletion request
      </a>
    </section>
  );
}

export default async function PolicyPage({ params }: Props) {
  const { slug } = await params;
  const policy = policyBySlug(slug);
  if (!policy) notFound();

  const published = await fetchPublishedPolicy(slug);
  const bundled = BUNDLED[slug];
  const meta = published
    ? published.meta
    : bundled?.updated
      ? `Last updated ${bundled.updated}`
      : policy.subtitle;

  return (
    <Page className="doc">
      <div className="wrap doc__in">
        <a className="crumbs" href="/legal">
          All policies
        </a>
        <h1>{published?.title ?? policy.title}</h1>
        <p className="meta">{meta}</p>
        {slug === 'delete-account' ? <DeleteSteps /> : null}
        <div className="prose">
          {published ? <div dangerouslySetInnerHTML={{ __html: published.html }} /> : bundled?.body}
        </div>
      </div>
    </Page>
  );
}
