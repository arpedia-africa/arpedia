import { describe, expect, it } from 'vitest';
import {
  claimAction,
  claimCallout,
  claimErrorCopy,
  claimSnippet,
  claimsWaitingLine,
  type AuthorClaim,
} from './claimAnswer';

const claim: AuthorClaim = {
  id: 'c1',
  ref: 'CLM-0412',
  book_id: 'b1',
  type: 'copyright',
  details: 'Chapter 3   copies\nmy short story.',
  author_response: null,
  author_due_at: '2026-12-04T10:00:00Z',
  due_at: '2026-12-06T10:00:00Z',
};

describe('claim answer copy', () => {
  it('names the claim, quotes the details and gives the answer date in Lagos time', () => {
    expect(claimCallout(claim)).toBe(
      'A copyright claim (CLM-0412) says this book uses someone else’s work without permission.\n' +
        '“Chapter 3 copies my short story.”\n' +
        'Answer by 4 Dec. The book is out of Discover until we decide.',
    );
    expect(claimAction(claim)).toBe('Answer the claim');
  });

  it('after an answer, promises the decision date and offers a change', () => {
    const answered = { ...claim, type: 'impersonation' as const, details: null, author_response: 'Mine.' };
    expect(claimCallout(answered)).toBe(
      'An impersonation claim (CLM-0412) says this book pretends to be by someone else.\n' +
        'We have your answer and will decide by 6 Dec.',
    );
    expect(claimAction(answered)).toBe('Change your answer');
  });

  it('shortens long details for the card', () => {
    const s = claimSnippet('a'.repeat(500))!;
    expect(s.length).toBe(220);
    expect(s.endsWith('…')).toBe(true);
    expect(claimSnippet('   ')).toBeNull();
  });

  it('counts only claims still waiting for an answer', () => {
    expect(claimsWaitingLine([])).toBeNull();
    expect(claimsWaitingLine([{ author_response: null }])).toBe('1 claim to answer');
    expect(
      claimsWaitingLine([{ author_response: null }, { author_response: ' ' }, { author_response: 'x' }]),
    ).toBe('2 claims to answer');
  });

  it('maps server refusals', () => {
    expect(claimErrorCopy('not_found')).toMatch(/already decided/);
    expect(
      claimErrorCopy('new row violates check constraint "copyright_claims_author_response_check"'),
    ).toMatch(/4,000/);
    expect(claimErrorCopy('TypeError: Network request failed')).toMatch(/offline/);
    expect(claimErrorCopy('boom')).toMatch(/Try again/);
  });
});
