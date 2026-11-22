export type AppealSubject = 'sanction' | 'application' | 'book_rejection' | 'content_removal';
export type AppealStatus = 'new' | 'in_review' | 'upheld' | 'reduced' | 'overturned';

export const STATUS_LABEL: Record<AppealStatus, string> = {
  new: 'New',
  in_review: 'In review',
  upheld: 'Upheld',
  reduced: 'Reduced',
  overturned: 'Overturned',
};

/** Who is appealing, by what they appeal (the row's small line). */
export const APPELLANT_ROLE: Record<AppealSubject, string> = {
  sanction: 'Reader',
  content_removal: 'Reader',
  application: 'Applicant',
  book_rejection: 'Author',
};

/** "30-day suspension", "Removed content", "Rejected author application", "Book rejection". */
export function appealingLabel(subject: AppealSubject, decision: string | null): string {
  if (subject === 'application') return 'Rejected author application';
  if (subject === 'book_rejection') return 'Book rejection';
  const m = /^(\w+)(?:\s+(\d+)\s+days)?$/.exec(decision?.trim() ?? '');
  const kind = m?.[1];
  const d = m?.[2];
  if (subject === 'sanction' || kind === 'mute' || kind === 'suspend' || kind === 'ban') {
    if (kind === 'warn') return 'Warning';
    if (kind === 'ban') return 'Ban';
    if (kind === 'mute') return d ? `${d}-day mute` : 'Mute';
    if (kind === 'suspend') return d ? `${d}-day suspension` : 'Suspension';
  }
  return 'Removed content';
}

export const shortDate = (iso: string, now = new Date()) => {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' });
  const y = new Date(now.getTime() - 86_400_000);
  if (day(d) === day(now))
    return `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })}`;
  if (day(d) === day(y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
};
