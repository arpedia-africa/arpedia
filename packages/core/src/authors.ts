// Flow 08 · author profile, posts and paid messages: formatting shared by the app and admin.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Profile counts (rule 7): exact below 1,000, then "3.4k", "12k", "1.2m". */
export function authorCount(n: number): string {
  if (n < 1000) return String(Math.max(0, Math.floor(n)));
  const [d, unit] = n < 1_000_000 ? [1000, 'k'] : [1_000_000, 'm'];
  const v = n / d;
  const s = v >= 10 ? String(Math.floor(v)) : String(Math.floor(v * 10) / 10);
  return s.replace(/\.0$/, '') + unit;
}

/**
 * Post and comment times (rule 8): "now", "N min ago", "N h ago", "1 day ago" / "N days ago" up to
 * 30 days, then "10 Nov" (with the year when it isn't this year).
 */
export function postTime(at: Date | string, now: Date = new Date()): string {
  const d = typeof at === 'string' ? new Date(at) : at;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return days === 1 ? '1 day ago' : `${days} days ago`;
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? date : `${date} ${d.getFullYear()}`;
}

/** s-dm header (rule 23): shown only with 5+ replies in the last 30 days. */
export function replyLabel(medianHours: number | null, sampleSize: number): string | null {
  if (medianHours == null || sampleSize < 5) return null;
  return medianHours < 24 ? 'within a day' : 'within a few days';
}

/** Average rating on the profile: one decimal, hidden below 5 ratings (rule 2). */
export function authorRating(avg: number | null, count: number): string | null {
  if (avg == null || count < 5) return null;
  return `${avg.toFixed(1)}★`;
}

/** Message and comment bodies: 1 to `max` characters after trimming (rules 13, 25). */
export function validMessage(body: string, max = 1000): boolean {
  const n = body.trim().length;
  return n >= 1 && n <= max;
}

/**
 * `dm_author_replied` (Analytics): hours from the reader's oldest unanswered message to the author's
 * reply, to one decimal. `messages` is the thread oldest first; `authorId` is the DM's owner. Null
 * when nothing from the reader is waiting since the author's last message (no event then).
 */
export function dmReplyHours(
  messages: readonly { sender_id: string | null; kind: string; state: string; created_at: string }[],
  authorId: string,
  now: Date = new Date(),
): number | null {
  let waitingSince: string | null = null;
  for (const m of messages) {
    if (m.kind === 'system' || !m.sender_id) continue;
    if (m.sender_id === authorId) waitingSince = null;
    else if (waitingSince === null && m.state !== 'deleted') waitingSince = m.created_at;
  }
  if (waitingSince === null) return null;
  const hours = (now.getTime() - new Date(waitingSince).getTime()) / 3_600_000;
  return Math.max(0, Math.round(hours * 10) / 10);
}
