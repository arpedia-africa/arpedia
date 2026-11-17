'use client';

import styles from './console.module.css';

export default function ConsoleError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={styles.page}>
      <section className={`${styles.panel} ${styles.home}`} role="alert">
        <div className={styles.empty}>
          <b>This page didn't load</b>
          <span>Check your connection and try again. If it keeps happening, tell engineering.</span>
          <div className={styles.actions}>
            <button type="button" className="btn btn-p" onClick={reset}>
              Try again
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
