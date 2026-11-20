import { describe, expect, it } from 'vitest';
import {
  canAppeal,
  hasBlockedLink,
  hasPhoneNumber,
  matchMutedWords,
  normaliseForMatch,
  reasonsFor,
  reducedSanction,
  reportDueAt,
  sanctionEndsAt,
  severityFor,
  slaLabel,
  suspendedUntilCopy,
  type MutedWord,
} from './trust';

describe('severity mapping', () => {
  it('maps reasons to High, Medium and Low (rule 4)', () => {
    expect(severityFor('violence')).toBe('high');
    expect(severityFor('self_harm')).toBe('high');
    expect(severityFor('spam')).toBe('medium');
    expect(severityFor('impersonation')).toBe('medium');
    expect(severityFor('spoilers')).toBe('low');
    expect(severityFor('other')).toBe('low');
  });
  it('lets the safety settings override a reason', () => {
    expect(severityFor('spam', { spam: 'high' })).toBe('high');
  });
  it('offers reasons by content type (rule 3)', () => {
    expect(reasonsFor('message')).toHaveLength(8);
    expect(reasonsFor('message')).not.toContain('spoilers');
    expect(reasonsFor('review')).toContain('spoilers');
    expect(reasonsFor('profile')).toContain('impersonation');
    expect(reasonsFor('book')).toEqual(['copyright', 'sexual', 'other']);
  });
});

describe('SLA due dates', () => {
  const from = new Date('2026-11-19T10:00:00Z');
  it('promises High in 24 hours and others in 3 days', () => {
    expect(reportDueAt('high', from).toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(reportDueAt('medium', from).toISOString()).toBe('2026-11-22T10:00:00.000Z');
    expect(reportDueAt('low', from).toISOString()).toBe('2026-11-22T10:00:00.000Z');
  });
  it('labels time left and time over', () => {
    expect(slaLabel(new Date('2026-11-19T15:30:00Z'), from)).toEqual({ text: '5h left', late: false });
    expect(slaLabel(new Date('2026-11-19T07:00:00Z'), from)).toEqual({ text: '3h over', late: true });
    expect(slaLabel(new Date('2026-11-19T10:20:00Z'), from).text).toBe('20m left');
    expect(slaLabel(new Date('2026-11-22T10:00:00Z'), from).text).toBe('3d left');
  });
});

describe('muted word matcher', () => {
  const w = (text: string, extra: Partial<MutedWord> = {}): MutedWord => ({
    id: text,
    text,
    is_phrase: false,
    scope: 'everywhere',
    action: 'hide',
    ...extra,
  });
  it('matches whole words only', () => {
    expect(matchMutedWords('You are an idiot', [w('idiot')], 'chat').action).toBe('hide');
    expect(matchMutedWords('Idiotic plot twist', [w('idiot')], 'chat').action).toBeNull();
    expect(matchMutedWords('Read Scunthorpe stories', [w('cunt')], 'chat').action).toBeNull();
  });
  it('ignores case, repeated letters and common substitutions', () => {
    expect(normaliseForMatch('STUUUPID!')).toBe('stuuupid');
    expect(normaliseForMatch('1d10t!')).toBe('idiot');
    expect(matchMutedWords('you are STUUUPID', [w('stupid')], 'chat').hits).toHaveLength(1);
    // A word with a double letter never matches the shorter common word.
    expect(matchMutedWords('as soon as possible', [w('ass')], 'chat').hits).toHaveLength(0);
    expect(matchMutedWords('what an asss', [w('ass')], 'chat').hits).toHaveLength(1);
    expect(matchMutedWords('you are st00pid', [w('stopid')], 'chat').hits).toHaveLength(1);
    expect(matchMutedWords('IDIOOOT', [w('idiot')], 'dm').hits).toHaveLength(1);
    expect(matchMutedWords('$cam alert', [w('scam')], 'chat').hits).toHaveLength(1);
  });
  it('matches phrases across spaces and spacing tricks', () => {
    const phrase = w('send money', { is_phrase: true, action: 'hide_and_report' });
    expect(matchMutedWords('please SEND   money now', [phrase], 'chat').action).toBe('hide_and_report');
    expect(matchMutedWords('s.e.n.d m.o.n.e.y', [phrase], 'chat').action).toBe('hide_and_report');
  });
  it('respects scope and keeps the strongest action', () => {
    const words = [
      w('spoiler', { scope: 'reviews', action: 'blur' }),
      w('idiot', { action: 'warn' }),
      w('scam', { action: 'hide_and_report' }),
    ];
    expect(matchMutedWords('spoiler idiot', words, 'chat').action).toBe('warn');
    expect(matchMutedWords('spoiler idiot', words, 'review').action).toBe('blur');
    expect(matchMutedWords('idiot scam', words, 'chat').action).toBe('hide_and_report');
  });
  it('spots phone numbers and links outside arpedia.africa', () => {
    expect(hasPhoneNumber('call 0803 123 4567')).toBe(true);
    expect(hasPhoneNumber('+2348031234567')).toBe(true);
    expect(hasPhoneNumber('chapter 12 of 300')).toBe(false);
    expect(hasBlockedLink('see https://arpedia.africa/books/1')).toBe(false);
    expect(hasBlockedLink('see www.free-books.com now')).toBe(true);
    expect(hasBlockedLink('I loved it.Really')).toBe(false);
  });
});

describe('sanction end dates', () => {
  const start = new Date('2026-11-19T10:00:00Z');
  it('mutes for 7 days, suspends for 30, bans forever', () => {
    expect(sanctionEndsAt('mute', start)?.toISOString()).toBe('2026-11-26T10:00:00.000Z');
    expect(sanctionEndsAt('suspend', start)?.toISOString()).toBe('2026-12-19T10:00:00.000Z');
    expect(sanctionEndsAt('ban', start)).toBeNull();
    expect(sanctionEndsAt('mute', start, 1)?.toISOString()).toBe('2026-11-20T10:00:00.000Z');
  });
  it('restores access at once when a reduced length has passed', () => {
    expect(reducedSanction(start, 7, new Date('2026-11-29T10:00:00Z')).endedNow).toBe(true);
    expect(reducedSanction(start, 7, new Date('2026-11-21T10:00:00Z')).endedNow).toBe(false);
  });
  it('keeps appeals open for 14 days', () => {
    expect(canAppeal(start, new Date('2026-12-03T10:00:00Z'))).toBe(true);
    expect(canAppeal(start, new Date('2026-12-03T10:00:01Z'))).toBe(false);
  });
  it('says when a suspension ends in WAT', () => {
    expect(suspendedUntilCopy(new Date('2026-12-11T23:30:00Z'))).toBe(
      'Your account is suspended until 12 Dec. You can appeal from the email we sent.',
    );
  });
});
