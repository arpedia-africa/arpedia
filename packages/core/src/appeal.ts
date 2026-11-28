// Flow 14 · rule 26: the decision message a sanctioned reader or author sees, and the Appeal it
// offers. `get_my_moderation` and `create_appeal` (20261120001400_14_trust.sql) hold the rules
// (14 days, one open appeal per decision); these turn their rows and errors into plain words.

export type ModerationActionKind =
  'keep' | 'remove' | 'mark_spoiler' | 'warn' | 'mute' | 'suspend' | 'ban' | 'lock_chat' | 'restore';
export type AppealStatus = 'new' | 'in_review' | 'upheld' | 'reduced' | 'overturned';
export type AppealSubject = 'sanction' | 'application' | 'book_rejection' | 'content_removal';

export const APPEAL_MAX = 1000;
export const APPEAL_SENT = "Appeal sent. We'll reply within 3 days.";

export interface ModerationRow {
  action_id: string;
  sanction_id: string | null;
  action: ModerationActionKind;
  ends_at: string | null;
  message: string | null;
  created_at: string;
  can_appeal: boolean;
  appeal_status: AppealStatus | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "12 Dec" in Lagos time. */
export function dayMonth(iso: string) {
  const d = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Headline for a decision; the staff message (if any) follows it. */
export function decisionTitle(r: Pick<ModerationRow, 'action' | 'ends_at'>, now = new Date()): string {
  const until = r.ends_at && new Date(r.ends_at) > now ? ` until ${dayMonth(r.ends_at)}` : '';
  switch (r.action) {
    case 'remove':
      return 'We removed something you posted';
    case 'mark_spoiler':
      return 'We marked something you posted as a spoiler';
    case 'warn':
      return 'You have a warning on your account';
    case 'mute':
      return until ? `You can't post or message${until}` : 'Your mute has ended';
    case 'suspend':
      return until ? `Your account is suspended${until}` : 'Your suspension has ended';
    case 'ban':
      return 'Your account is banned';
    case 'lock_chat':
      return 'We locked a chat you started';
    default:
      return 'A decision on your account';
  }
}

/** What the decision card says under the headline about appealing. */
export function appealLine(r: Pick<ModerationRow, 'can_appeal' | 'appeal_status'>): string | null {
  switch (r.appeal_status) {
    case 'new':
    case 'in_review':
      return "We're looking at your appeal. We'll reply within 3 days.";
    case 'upheld':
      return 'We looked again and kept this decision.';
    case 'reduced':
      return 'We looked again and shortened this.';
    case 'overturned':
      return 'We looked again and reversed this.';
    default:
      return r.can_appeal ? 'You can appeal within 14 days if you think we got it wrong.' : null;
  }
}

/** Which appeal a row is: the sanction when there is one, else the removal itself. */
export function appealSubject(r: Pick<ModerationRow, 'action_id' | 'sanction_id'>): {
  type: AppealSubject;
  id: string;
} {
  return r.sanction_id
    ? { type: 'sanction', id: r.sanction_id }
    : { type: 'content_removal', id: r.action_id };
}

/** Plain words for a refused appeal; anything else is a retryable failure. */
export function appealErrorCopy(message: string): string {
  if (/already_appealed/.test(message)) return 'You already appealed this decision.';
  if (/appeal_window_closed/.test(message)) return 'The 14 days to appeal this have passed.';
  if (/not_found/.test(message)) return 'This decision is no longer on your account.';
  return "Couldn't send your appeal. Try again.";
}
