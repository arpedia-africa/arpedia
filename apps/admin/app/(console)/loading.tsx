import styles from './console.module.css';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className={styles.band}>
        <div className="skel" style={{ width: 220, height: 28 }} />
      </div>
      <div className={styles.page}>
        <div className={`${styles.panel} ${styles.home}`} style={{ padding: 18 }}>
          <div className="skel" style={{ width: '40%', height: 16, marginBottom: 14 }} />
          <div className="skel" style={{ width: '100%', height: 14, marginBottom: 10 }} />
          <div className="skel" style={{ width: '85%', height: 14, marginBottom: 10 }} />
          <div className="skel" style={{ width: '70%', height: 14 }} />
        </div>
      </div>
    </div>
  );
}
