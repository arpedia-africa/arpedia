import { describe, expect, it } from 'vitest';
import { approverOf, canDecide, canRemove, grantMessage, grantTier } from './grant-rules';

describe('grant rules (14-11)', () => {
  it('Support adds 200 at once, Operations and Super admins 500, others none', () => {
    expect(grantTier('support')).toBe(200);
    expect(grantTier('operations_admin')).toBe(500);
    expect(grantTier('super_admin')).toBe(500);
    expect(grantTier('finance')).toBe(0);
    expect(grantTier('moderator')).toBe(0);
  });

  it('only Finance and Super admins remove credits', () => {
    expect(canRemove('finance')).toBe(true);
    expect(canRemove('super_admin')).toBe(true);
    expect(canRemove('operations_admin')).toBe(false);
    expect(canRemove('support')).toBe(false);
  });

  it('Operations decides grants up to 500; Finance and Super admins decide everything', () => {
    expect(canDecide('operations_admin', 'add', 500)).toBe(true);
    expect(canDecide('operations_admin', 'add', 501)).toBe(false);
    expect(canDecide('operations_admin', 'remove', 100)).toBe(false);
    expect(canDecide('finance', 'add', 5000)).toBe(true);
    expect(canDecide('super_admin', 'remove', 900)).toBe(true);
    expect(canDecide('support', 'add', 300)).toBe(false);
    expect(approverOf('add', 300)).toBe('an Operations admin, Finance or a Super admin');
    expect(approverOf('add', 800)).toBe('Finance or a Super admin');
    expect(approverOf('remove', 100)).toBe('Finance or a Super admin');
  });

  it('the reader message matches the prototype preview', () => {
    expect(grantMessage('Ngozi', 90, 'Failed unlock')).toBe(
      'Hi Ngozi, we added 90 credits to your Arpedia account to make up for a book that did not unlock. Enjoy your reading.',
    );
    expect(grantMessage('', 1200, 'Other')).toBe('We added 1,200 credits to your Arpedia account. Enjoy your reading.');
  });
});
