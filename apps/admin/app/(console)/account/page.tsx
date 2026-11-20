import type { Metadata } from 'next';
import { getStaff, roleLabel } from '@/lib/staff';
import { serverSupabase } from '@/lib/supabase/server';
import { signOut } from '../../sign-in/actions';
import { AccountView, type Account } from './client';

export const metadata: Metadata = { title: 'My account · Arpedia Admin' };

/** My account (s-account): profile, two-step, active sessions, alerts and password. */
export default async function AccountPage() {
  const staff = await getStaff();
  if (!staff) return null;
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc('get_my_account');
  if (error) throw error;
  const account = data as unknown as Account;
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
      <AccountView account={account} id={staff.id} roleName={roleLabel[staff.role]} mustKeepTwoStep={staff.role === 'super_admin' || staff.role === 'finance'} />
    </section>
  );
}
