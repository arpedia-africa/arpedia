import { describe, expect, it } from 'vitest';
import { held, pagesDelta, paragraphHint, perFinished, tookPart } from './reading';

describe('Reading tab numbers (flow 15 rule 27)', () => {
  it('compares pages per session with the previous period', () => {
    expect(pagesDelta(17, 16)).toEqual({ text: '+1', up: true });
    expect(pagesDelta(15.2, 15.7)).toEqual({ text: '-0.5', up: false });
    expect(pagesDelta(17, null)).toBeNull();
    expect(pagesDelta(null, 16)).toBeNull();
  });

  it('hides figures the server held back', () => {
    expect(perFinished(12.64)).toBe('12.6 per finished book');
    expect(perFinished(null)).toBeNull();
    expect(tookPart(1820)).toBe('1,820 readers took part');
    expect(tookPart(null)).toBeNull();
  });

  it('dates a room in Lagos time', () => {
    expect(held('2026-11-11T18:00:00Z')).toBe('Wed 11 Nov, 19:00');
    expect(held('2026-11-07T23:30:00Z')).toBe('Sun 8 Nov, 00:30');
  });

  it('describes a paragraph without naming any reader', () => {
    expect(
      paragraphHint({ book_id: 'b', title: 'T', quote: 'q', chapter: 6, comments: 412, highlights: 1180 }),
    ).toBe('chapter 6 · 412 comments · 1,180 highlights');
    expect(paragraphHint({ book_id: 'b', title: 'T', quote: null, chapter: null, comments: 1, highlights: 1 })).toBe(
      '1 comment · 1 highlight',
    );
  });
});
