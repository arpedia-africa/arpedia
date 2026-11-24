import { describe, expect, it } from 'vitest';
import { appealErrorCopy, appealLine, appealSubject, decisionTitle } from './appeal';

describe('appeal copy', () => {
  const now = new Date('2026-11-24T10:00:00Z');

  it('names the end date of a live suspension in Lagos time', () => {
    expect(decisionTitle({ action: 'suspend', ends_at: '2026-12-11T23:30:00Z' }, now)).toBe(
      'Your account is suspended until 12 Dec',
    );
    expect(decisionTitle({ action: 'mute', ends_at: '2026-11-20T00:00:00Z' }, now)).toBe(
      'Your mute has ended',
    );
  });

  it('offers Appeal only while open, then follows the appeal', () => {
    expect(appealLine({ can_appeal: true, appeal_status: null })).toMatch(/within 14 days/);
    expect(appealLine({ can_appeal: false, appeal_status: null })).toBeNull();
    expect(appealLine({ can_appeal: false, appeal_status: 'in_review' })).toMatch(/3 days/);
  });

  it('appeals the sanction when there is one, else the removal', () => {
    expect(appealSubject({ action_id: 'a', sanction_id: 's' })).toEqual({ type: 'sanction', id: 's' });
    expect(appealSubject({ action_id: 'a', sanction_id: null })).toEqual({
      type: 'content_removal',
      id: 'a',
    });
  });

  it('maps server refusals', () => {
    expect(appealErrorCopy('already_appealed')).toMatch(/already/);
    expect(appealErrorCopy('appeal_window_closed')).toMatch(/14 days/);
    expect(appealErrorCopy('boom')).toMatch(/Try again/);
  });
});
