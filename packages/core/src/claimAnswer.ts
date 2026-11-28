// Flow 14 · rules 30 and 31: a claim on an author's book that staff sent to the author
// (`claim_ask_author`), and the author's answer (`respond_to_claim`, 20261120001400_14_trust.sql).
// Studio shows it on the book's card in My books; these turn the row into plain words.
import { dayMonth } from './appeal';

export type ClaimKind = 'copyright' | 'plagiarism' | 'impersonation';

/** The columns the author's card needs (never the claimant's name or contact). */
export interface AuthorClaim {
  id: string;
  ref: string;
  book_id: string;
  type: ClaimKind;
  details: string | null;
  author_response: string | null;
  author_due_at: string | null;
  due_at: string;
}

/** `copyright_claims.author_response` is capped at 4,000 characters. */
export const CLAIM_ANSWER_MAX = 4000;
export const CLAIM_ANSWER_SENT = "Answer sent. We'll tell you what we decide.";

const KIND: Record<ClaimKind, [string, string]> = {
  copyright: ['A copyright claim', 'says this book uses someone else’s work without permission'],
  plagiarism: ['A plagiarism claim', 'says this book copies someone else’s writing'],
  impersonation: ['An impersonation claim', 'says this book pretends to be by someone else'],
};

/** Longest stretch of the claimant's words shown on the card; the sheet shows them all. */
const SNIPPET = 220;

export function claimSnippet(details: string | null): string | null {
  const t = details?.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > SNIPPET ? `${t.slice(0, SNIPPET - 1).trimEnd()}…` : t;
}

/** Headline and next step for the card's warn callout. */
export function claimCallout(c: AuthorClaim): string {
  const [kind, says] = KIND[c.type];
  const head = `${kind} (${c.ref}) ${says}.`;
  const what = claimSnippet(c.details);
  const step = c.author_response?.trim()
    ? `We have your answer and will decide by ${dayMonth(c.due_at)}.`
    : c.author_due_at
      ? `Answer by ${dayMonth(c.author_due_at)}. The book is out of Discover until we decide.`
      : 'The book is out of Discover until we decide.';
  return [head, what ? `“${what}”` : null, step].filter(Boolean).join('\n');
}

/** The card's button. */
export function claimAction(c: Pick<AuthorClaim, 'author_response'>): string {
  return c.author_response?.trim() ? 'Change your answer' : 'Answer the claim';
}

/** `respond_to_claim` refusals in plain words. */
export function claimErrorCopy(message: string): string {
  if (/not_found/.test(message)) return 'This claim is already decided, so it can’t take an answer now.';
  if (/author_response_check|too long|check constraint/i.test(message))
    return `Keep your answer under ${CLAIM_ANSWER_MAX.toLocaleString('en-NG')} characters.`;
  if (/network|fetch|timeout/i.test(message)) return 'You’re offline. Connect to send your answer.';
  return 'We couldn’t send your answer. Try again.';
}

/** "1 claim to answer" for the Studio home's My Books row, or null when none waits. */
export function claimsWaitingLine(claims: Pick<AuthorClaim, 'author_response'>[]): string | null {
  const n = claims.filter((c) => !c.author_response?.trim()).length;
  if (!n) return null;
  return `${n} claim${n === 1 ? '' : 's'} to answer`;
}
