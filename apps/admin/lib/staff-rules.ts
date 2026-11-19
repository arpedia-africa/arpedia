import type { StaffRole } from '@arpedia/core';

/** Google sign-in and invites are limited to this workspace domain. */
export const STAFF_DOMAIN = 'arpedia.africa';

/** Staff passwords need at least 12 characters (flow 16 rule 9). */
export const STAFF_PASSWORD_MIN = 12;

export const roleLabel: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  operations_admin: 'Operations admin',
  publisher: 'Publisher',
  moderator: 'Moderator',
  finance: 'Finance',
  support: 'Support',
  analyst: 'Analyst',
};

/** Roles in the order the console lists them (matrix columns, invite cards, Team sort). */
export const ROLE_ORDER: StaffRole[] = [
  'super_admin',
  'operations_admin',
  'publisher',
  'moderator',
  'finance',
  'support',
  'analyst',
];

/** Plural role names for sentences such as "open to Finance and Super admins". */
export const rolePlural: Record<StaffRole, string> = {
  super_admin: 'Super admins',
  operations_admin: 'Operations admins',
  publisher: 'Publishers',
  moderator: 'Moderators',
  finance: 'Finance',
  support: 'Support',
  analyst: 'Analysts',
};
