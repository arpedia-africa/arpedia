export type ClaimType = 'copyright' | 'plagiarism' | 'impersonation';
export type ClaimStatus = 'new' | 'waiting_on_author' | 'upheld' | 'rejected';
export type ClaimTab = 'open' | 'waiting' | 'decided';

export const TYPE_LABEL: Record<ClaimType, string> = {
  copyright: 'Copyright',
  plagiarism: 'Plagiarism',
  impersonation: 'Impersonation',
};

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  new: 'New',
  waiting_on_author: 'Waiting on author',
  upheld: 'Upheld',
  rejected: 'Rejected',
};

/** Only New and Waiting on author get pills; decided claims are plain text. */
export const STATUS_PILL: Partial<Record<ClaimStatus, string>> = { new: 'st st-org', waiting_on_author: 'st st-warn' };

/** "12 Nov, 08:40" for Received; the year only when it isn't this year. */
export function receivedAt(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const year = (x: Date) => x.toLocaleDateString('en-GB', { year: 'numeric', timeZone: 'Africa/Lagos' });
  const day = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(year(d) === year(now) ? {} : { year: 'numeric' }),
    timeZone: 'Africa/Lagos',
  });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  return `${day}, ${time}`;
}

/** "19 Nov" for Due. */
export const dayMonth = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/**
 * Passages in `copyright_claims.similarity` mark the matching words with [[…]]. Splits a passage
 * into plain and marked runs for <mark>.
 */
export function markRuns(text: string): { text: string; mark: boolean }[] {
  return text
    .split(/(\[\[[\s\S]*?\]\])/)
    .filter(Boolean)
    .map((t) => (t.startsWith('[[') ? { text: t.slice(2, -2), mark: true } : { text: t, mark: false }));
}
