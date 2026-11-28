import type { StaffRole } from '@arpedia/core';

/**
 * Flow 16 · spec check 16-25: a Super admin previews another role's sidebar and Home (s-overview
 * "Preview as"). Read-only: pages still act with the Super admin's own role; only the sidebar and
 * Home tasks follow the previewed role. Starting a preview is audited (staff_preview_as).
 */
export const PREVIEW_COOKIE = 'arp_preview_as';

/** The roles the prototype's Preview as switch offers, after Super admin itself. */
export const PREVIEW_ROLES = ['publisher', 'moderator', 'finance'] as const satisfies readonly StaffRole[];
export type PreviewRole = (typeof PREVIEW_ROLES)[number];

/** A preview ends by itself after 30 minutes. */
export const PREVIEW_MAX_AGE = 30 * 60;

/** The role a Super admin is previewing, from the cookie value; null for anyone else or no preview. */
export function previewRoleOf(staffRole: StaffRole | undefined, cookie: string | undefined): PreviewRole | null {
  if (staffRole !== 'super_admin' || !cookie) return null;
  return (PREVIEW_ROLES as readonly string[]).includes(cookie) ? (cookie as PreviewRole) : null;
}

/** Where a Preview as link goes: back to the Super admin view, or into a role's preview. */
export const previewHref = (role: PreviewRole | 'super_admin') => `/preview-as?role=${role}`;
