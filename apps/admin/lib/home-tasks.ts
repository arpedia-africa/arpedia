// Home tasks that don't come from a queue (flow 16 open question 4: launching with one Super admin
// is allowed, with a warning on every Super admin's Home until a second is added).

export interface HomeTask {
  id: string;
  href: string;
  title: string;
  sub: string;
  due: string;
}

/** The "add a second Super admin" task, while there is exactly one. */
export function soleSuperAdminTask(superAdmins: string[]): HomeTask | null {
  if (superAdmins.length !== 1) return null;
  return {
    id: 'sole-super-admin',
    href: '/team',
    title: 'Add a second Super admin',
    sub: 'You are the only one. Payout releases, price changes and large credit grants need a second person.',
    due: 'Until added',
  };
}
