import { REASON_LABELS, type ReportContentType, type ReportReason } from '@arpedia/core';

export { REASON_LABELS };
export type { ReportContentType, ReportReason };

export type Severity = 'high' | 'medium' | 'low';
export type ReportTab = 'open' | 'mine' | 'resolved' | 'auto_hidden';
export type TypeFilter =
  'all' | 'message' | 'discussion_comment' | 'review' | 'rooms' | 'post_comment' | 'profile' | 'book' | 'dm';

export const TABS: { key: ReportTab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'auto_hidden', label: 'Auto-hidden' },
];

export const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'message', label: 'Messages' },
  { key: 'discussion_comment', label: 'Discussions' },
  { key: 'review', label: 'Reviews' },
  { key: 'rooms', label: 'Reading rooms' },
  { key: 'post_comment', label: 'Posts' },
  { key: 'profile', label: 'Profiles' },
  { key: 'book', label: 'Books' },
  { key: 'dm', label: 'DMs' },
];

export const TYPE_LABEL: Record<ReportContentType, string> = {
  message: 'Message',
  discussion_comment: 'Discussion comment',
  review: 'Review',
  post_comment: 'Post comment',
  author_post: 'Author post',
  profile: 'Profile',
  book: 'Book',
  dm: 'DM',
};

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export const OUTCOME_LABEL: Record<string, string> = {
  keep: 'Kept',
  dismissed: 'Kept',
  removed: 'Removed',
  spoiler: 'Marked as spoiler',
  actioned: 'Removed, user actioned',
};

/** "6 min", "3 h", "1 day", "2 days" (queue age). */
export function age(iso: string, now = Date.now()): string {
  const mins = Math.max(1, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 day' : `${d} days`;
}

export function watTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    (parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
  ).toUpperCase();
}

/** Avatar tint from the name (prototype classes o, g, r, k, t). */
export function tint(name: string): string {
  const tints = ['o', 'g', 'r', 'k', 't'];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tints[h % tints.length]!;
}
