import { Icon } from '@/components/icon';
import { getStaff } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';

// Greeting by the time in Lagos (WAT), as on the prototype's Home.
function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-NG', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(now));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

interface Task {
  href: string;
  title: string;
  sub: string;
  due: string;
}

const since = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'Today' : days === 1 ? 'Since yesterday' : `${days} days`;
};

/** Tasks for the signed-in role, most urgent first. Bans waiting for a Super admin (flow 14 rule 17). */
async function tasksFor(role: string | undefined): Promise<Task[]> {
  if (role !== 'super_admin') return [];
  const supabase = await serverSupabase();
  const { data } = await supabase.rpc('admin_pending_bans');
  return (data ?? []).map((b) => ({
    href: b.report_id ? `/reports/${b.report_id}` : '/reports',
    title: `Confirm or turn down a ban on ${b.user_name ?? 'a reader'}`,
    sub: `${b.decided_by_name ?? 'A moderator'} asked for it${b.reason ? ` · ${b.reason}` : ''}${b.is_minor ? ' · under 18' : ''}`,
    due: since(b.created_at),
  }));
}

/** Home = My tasks for the signed-in role (s-overview markup). Tasks arrive with the flows that create them. */
export default async function Home() {
  const staff = await getStaff();
  const first = staff?.name.split(' ')[0] ?? '';
  const tasks = await tasksFor(staff?.role);
  return (
    <section className="screen enter">
      <div className="band band--home">
        <div className="band__row">
          <div className="band__text">
            <h1>
              {greeting()}, {first}
            </h1>
            <p>
              {tasks.length
                ? `${tasks.length} ${tasks.length === 1 ? 'needs' : 'need'} you now, most urgent first.`
                : 'Nothing needs you right now.'}
            </p>
          </div>
        </div>
      </div>
      <div className="page">
        <div className="home">
          <div className="panel">
            <div className="panel__head">
              <h2>Your tasks</h2>
            </div>
            {tasks.length ? (
              <div className="tasks">
                {tasks.map((t) => (
                  <a key={t.href + t.title} className="task" href={t.href}>
                    <span className="task__b">
                      <b>{t.title}</b>
                      <small>{t.sub}</small>
                    </span>
                    <span className="task__due">{t.due}</span>
                    <Icon name="chev" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="empty">
                <b>You’re all caught up</b>
                <span>New books, reports and payouts will show here when they need you.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
