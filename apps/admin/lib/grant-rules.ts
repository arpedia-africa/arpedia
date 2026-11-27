import type { StaffRole } from '@arpedia/core';

// Flow 14 rule 38 (open question 3 default), the same limits staff_grant_credits and
// staff_remove_credits enforce: Support grants up to 200 at once, Operations and Super admins up
// to 500, more waits for a second person. Removing credits is Finance's (and Super admins').

/** The removal tier and the top of the Operations tier. */
export const BIG = 500;

/** How many credits this role adds at once (0: cannot grant). */
export function grantTier(role: StaffRole): number {
  if (role === 'super_admin' || role === 'operations_admin') return BIG;
  if (role === 'support') return 200;
  return 0;
}

export const canRemove = (role: StaffRole) => role === 'finance' || role === 'super_admin';

/** Who may decide a waiting request (never the person who asked; the server checks that too). */
export function canDecide(role: StaffRole, kind: 'add' | 'remove', credits: number): boolean {
  if (role === 'finance' || role === 'super_admin') return true;
  return role === 'operations_admin' && kind === 'add' && credits <= BIG;
}

/** Who a request over the caller's tier waits for, in words. */
export const approverOf = (kind: 'add' | 'remove', credits: number) =>
  kind === 'add' && credits <= BIG ? 'an Operations admin, Finance or a Super admin' : 'Finance or a Super admin';

const WHY: Record<string, string> = {
  'Failed unlock': ' to make up for a book that did not unlock',
  Goodwill: ' as a thank you',
  'Contest prize': ' for winning our contest',
  Correction: ' to put your balance right',
};

/** The push and in-app message the reader gets once the credits are in (s-user-grant preview). */
export function grantMessage(firstName: string, credits: number, reason: string): string {
  const hi = firstName.trim() ? `Hi ${firstName.trim()}, w` : 'W';
  return `${hi}e added ${credits.toLocaleString('en-NG')} credits to your Arpedia account${WHY[reason] ?? ''}. Enjoy your reading.`;
}
