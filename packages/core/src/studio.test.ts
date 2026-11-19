import { describe, expect, it } from 'vitest';
import { splitParts } from './pricing';
import {
  bookQuote,
  fieldStep,
  formatKobo,
  missingApplicationFields,
  perReadEarningKobo,
  studioBookLine,
  type ApplicationDraft,
} from './studio';

describe('bookQuote', () => {
  it('prices from words and full-page images (pages ÷ 2, rounded up)', () => {
    expect(bookQuote(62_500)).toMatchObject({ pages: 250, price: 125, naira: 375 });
    expect(bookQuote(62_501)).toMatchObject({ pages: 251, price: 126 });
    expect(bookQuote(1_000, 3)).toMatchObject({ pages: 7, price: 4 });
    expect(bookQuote(0)).toMatchObject({ pages: 0, price: 1 });
  });
});

describe('perReadEarningKobo', () => {
  it('is price × ₦1.60', () => {
    expect(perReadEarningKobo(125)).toBe(20_000); // a 250-page book pays ₦200 per full read
    expect(perReadEarningKobo(1)).toBe(160);
    expect(perReadEarningKobo(0)).toBe(0);
    expect(bookQuote(62_500).perReadKobo).toBe(20_000);
  });
  it('rejects bad prices', () => {
    expect(() => perReadEarningKobo(-1)).toThrow(RangeError);
    expect(() => perReadEarningKobo(1.5)).toThrow(RangeError);
  });
});

describe('chapter split into parts', () => {
  it('splits a 12,000-word chapter into 3 parts and leaves a short one alone', () => {
    const parts = splitParts([
      { title: 'One', paragraphs: Array(120).fill(100) },
      { title: 'Two', paragraphs: Array(10).fill(100) },
    ]);
    expect(parts.filter((p) => p.parentOrd === 0)).toHaveLength(3);
    expect(parts.filter((p) => p.parentOrd === 0).every((p) => p.kind === 'part')).toBe(true);
    expect(parts.filter((p) => p.parentOrd === 1)).toEqual([expect.objectContaining({ kind: 'chapter', words: 1000 })]);
  });
});

describe('formatKobo', () => {
  it('shows naira with separators', () => {
    expect(formatKobo(20_000)).toBe('₦200');
    expect(formatKobo(123_450)).toBe('₦1,234.50');
    expect(formatKobo(100_000)).toBe('₦1,000');
  });
});

describe('missingApplicationFields', () => {
  const done: ApplicationDraft = {
    legal_name: 'Tola Adeyemi',
    email: 'tola@example.com',
    phone: null,
    date_of_birth: '1995-01-01',
    state: 'Lagos',
    categories: ['Poetry'],
    bio: 'I write poems.',
    sample_file_key: null,
    sample_text: 'Once upon a time',
  };
  it('is empty for a complete draft with the box ticked', () => {
    expect(missingApplicationFields(done, true)).toEqual([]);
  });
  it('lists what blocks Send and the step it is on', () => {
    const miss = missingApplicationFields({ ...done, categories: [], sample_text: '  ', phone: '0803' }, false);
    expect(miss).toEqual(['phone', 'categories', 'sample', 'terms']);
    expect(miss.map(fieldStep)).toEqual([1, 2, 3, 4]);
  });
  it('caps the bio at 300 characters', () => {
    expect(missingApplicationFields({ ...done, bio: 'x'.repeat(301) }, true)).toEqual(['bio']);
  });
});

describe('studioBookLine', () => {
  it('tells readers keep v1 while an update is in review', () => {
    expect(studioBookLine('update_in_review', 2, 1).note).toBe('Update v2 in review · readers still see v1');
    expect(studioBookLine('draft', 1, null).note).toBe('Confirm your chapters and submit when ready');
    expect(studioBookLine('changes_requested', 1, null).action).toBe('Upload new file');
  });
});
