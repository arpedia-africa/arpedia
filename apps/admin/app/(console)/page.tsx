import { getStaff } from '@/lib/staff';
import styles from './console.module.css';

/** Home = My tasks for the signed-in role. Tasks arrive with the flows that create them. */
// Greeting by the time in Lagos (WAT), as on the prototype's Home.
function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-NG', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(now));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default async function Home() {
  const staff = await getStaff();
  const first = staff?.name.split(' ')[0] ?? '';
  return (
    <>
      <div className={styles.bandHome}>
        <span className="petals" style={{ right: -90, top: -130, width: 300, height: 300, opacity: 0.55 }} aria-hidden="true" />
        <div className={`${styles.bandRow} arrive`}>
          <div className={styles.bandText}>
            <h1>
              {greeting()}, {first}
            </h1>
            <p>Nothing needs you right now.</p>
          </div>
        </div>
      </div>
      <div className={`${styles.page} arrive`} style={{ animationDelay: '40ms' }}>
        <div className={styles.home}>
        <section className={styles.panel} aria-labelledby="tasks-h">
          <div className={styles.panelHead}>
            <h2 id="tasks-h" className={styles.panelTitle}>
              Your tasks
            </h2>
          </div>
          <div className={styles.empty}>
            <b>You're all caught up</b>
            <span>New books, reports and payouts will show here when they need you.</span>
          </div>
        </section>
        </div>
      </div>
    </>
  );
}
