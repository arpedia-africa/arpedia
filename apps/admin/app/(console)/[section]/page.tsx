import { notFound } from 'next/navigation';
import { locate } from '@/lib/nav';
import styles from '../console.module.css';

/** Placeholder for console pages that later flows build, so sidebar links never 404. */
export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: key } = await params;
  const { section, page } = locate(`/${key}`);
  if (!section || !page) notFound();
  return (
    <>
      <div className={styles.band}>
        <div className={styles.bandRow}>
          <div className={styles.bandText}>
            <h1>{page.label}</h1>
          </div>
        </div>
      </div>
      <div className={`${styles.page} arrive`}>
        <section className={`${styles.panel} ${styles.home}`}>
          <div className={styles.empty}>
            <b>{page.label} is on the way</b>
            <span>This page comes with a later part of the build. Nothing here needs you yet.</span>
          </div>
        </section>
      </div>
    </>
  );
}
