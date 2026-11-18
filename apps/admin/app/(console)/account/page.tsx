import { getStaff, roleLabel } from '@/lib/staff';
import { signOut } from '../../sign-in/actions';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');

/** My account (s-account). Flow 00 ships Profile and Sign out; two-step, sessions and alerts come in flow 16. */
export default async function AccountPage() {
  const staff = await getStaff();
  if (!staff) return null;
  return (
    <section className="screen enter">
      <div className="band">
        <div className="band__row">
          <div className="band__text">
            <h1>My account</h1>
          </div>
          <form className="band__acts" action={signOut}>
            <button type="submit" className="btn btn-n">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="page page--narrow">
        <div className="panel">
          <div className="panel__head">
            <h2>Profile</h2>
          </div>
          <div className="panel__body">
            <div className="row">
              <span className="av lg g">{initials(staff.name)}</span>
              <span className="stack s4">
                <b>{staff.name}</b>
                <span className="muted">{staff.email}</span>
              </span>
              <span className="grow" />
              <span className="muted">{roleLabel[staff.role]}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
