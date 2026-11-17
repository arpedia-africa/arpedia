import { getStaff } from '@/lib/staff';

// Greeting by the time in Lagos (WAT), as on the prototype's Home.
function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-NG', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(now));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Home = My tasks for the signed-in role (s-overview markup). Tasks arrive with the flows that create them. */
export default async function Home() {
  const staff = await getStaff();
  const first = staff?.name.split(' ')[0] ?? '';
  return (
    <section className="screen enter">
      <div className="band band--home">
        <div className="band__row">
          <div className="band__text">
            <h1>
              {greeting()}, {first}
            </h1>
            <p>Nothing needs you right now.</p>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="home">
          <div className="panel">
            <div className="panel__head">
              <h2>Your tasks</h2>
            </div>
            <div className="empty">
              <b>You’re all caught up</b>
              <span>New books, reports and payouts will show here when they need you.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
