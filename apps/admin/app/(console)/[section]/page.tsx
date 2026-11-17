import { notFound } from 'next/navigation';
import { locate } from '@/lib/nav';

/** Placeholder for console pages that later flows build, so sidebar links never 404. */
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: key } = await params;
  const { section, page } = locate(`/${key}`);
  if (!section || !page) notFound();
  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>{page.label}</h1>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="panel">
          <div className="empty" style={{ padding: '64px 24px' }}>
            <b>{page.label} is on the way</b>
            <span>This page comes with a later part of the build. Nothing here needs you yet.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
