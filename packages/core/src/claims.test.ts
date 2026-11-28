import { describe, expect, it } from 'vitest';
import { claimPassages, claimSimilarity, claimTypeOf, isClaimAddress, senderName } from './claims';

const BOOK = [
  {
    title: 'Chapter 1',
    paragraphs: ['Morning came slowly over the city, and nobody in the house was awake yet.'],
  },
  { title: '', paragraphs: ['A short line.'] },
  {
    title: 'Chapter 3',
    paragraphs: [
      'The harmattan dust sat on the windowsill like a debt nobody wanted to name. Garba counted the coins twice, then a third time, as if the numbers might change their mind.',
      '"You will not leave this city with my brother\'s name in your mouth," she told him.',
    ],
  },
];

describe('claimPassages', () => {
  it('takes quoted runs of 8 words or more when the claimant quotes', () => {
    expect(
      claimPassages(
        'Our text reads "The harmattan dust sat on the windowsill like a debt" and “too short here”.',
      ),
    ).toEqual(['The harmattan dust sat on the windowsill like a debt']);
  });

  it('falls back to sentences of 8 words or more', () => {
    expect(claimPassages('Hello there. This sentence has more than eight words in it, surely. Bye.')).toEqual(
      ['This sentence has more than eight words in it, surely.'],
    );
  });

  it('keeps at most 40 and drops repeats', () => {
    const s = Array.from(
      { length: 50 },
      (_, i) => `Sentence number ${i} has enough words to be checked here.`,
    );
    expect(claimPassages([s[0], s[0], ...s].join(' '))).toHaveLength(40);
  });
});

describe('claimSimilarity across paragraphs', () => {
  it('finds a long quote the book splits into paragraphs', () => {
    const paras = Array.from(
      { length: 3 },
      (_, p) =>
        `Paragraph ${p} begins here with words that only it has, then it goes on about thing ${p} and more thing ${p}. It ends with another sentence of its own about place ${p} today.`,
    );
    const sim = claimSimilarity(`They copied: "${paras.join(' ')}"`, [
      { title: 'Chapter 1', paragraphs: paras },
    ]);
    expect(sim.flagged).toBeGreaterThanOrEqual(3);
    expect(sim.score).toBeGreaterThan(80);
  });

  it('splits a quote on its blank lines', () => {
    expect(
      claimPassages(
        '"one two three four five six seven eight\n\nnine ten eleven twelve thirteen fourteen fifteen sixteen"',
      ),
    ).toEqual([
      'one two three four five six seven eight',
      'nine ten eleven twelve thirteen fourteen fifteen sixteen',
    ]);
  });
});

describe('claimSimilarity', () => {
  it('flags passages found in the book, with the chapter and marked words', () => {
    const sim = claimSimilarity(
      'Kano Nights reuses our novel. Page 41: "The harmattan dust sat on the windowsill like a debt nobody wanted to name. Musa counted the coins twice, then a third time." Also: "You will not leave this city with my brother\'s name in your mouth," she said.',
      BOOK,
    );
    expect(sim.flagged).toBe(2);
    expect(sim.checked).toBe(2);
    expect(sim.chapter).toBe('Chapter 3');
    expect(sim.chapters).toBe(1);
    expect(sim.score).toBeGreaterThan(50);
    expect(sim.score).toBeLessThan(100);
    const dust = sim.passages.find((p) => p.source.includes('harmattan'))!;
    expect(dust.source).toContain(
      '[[The harmattan dust sat on the windowsill like a debt nobody wanted to name.',
    );
    expect(dust.source).toContain('Musa');
    expect(dust.source).not.toContain('[[Musa');
    expect(dust.book).toContain('[[The harmattan dust');
  });

  it('checks every sentence when nothing is quoted', () => {
    const sim = claimSimilarity(
      "You will not leave this city with my brother's name in your mouth, she said to him. This is our own sentence that is nowhere in the book at all.",
      BOOK,
    );
    expect(sim.checked).toBe(2);
    expect(sim.flagged).toBe(1);
    expect(sim.score).toBe(77);
    expect(sim.passages[0]!.source).toContain('[[You will not leave');
    expect(sim.passages[0]!.book).toMatch(/^\[\["You will not leave/);
  });

  it('flags nothing for unrelated text', () => {
    const sim = claimSimilarity(
      'This complaint text has nothing in common with any line of the book at all.',
      BOOK,
    );
    expect(sim).toMatchObject({ score: 0, flagged: 0, checked: 1, chapter: null, passages: [] });
  });

  it('names an untitled chapter by its number', () => {
    const sim = claimSimilarity('"Morning came slowly over the city, and nobody in the house"', [
      { title: ' ', paragraphs: BOOK[0]!.paragraphs },
    ]);
    expect(sim.chapter).toBe('Chapter 1');
  });

  it('cuts a long book paragraph to the match', () => {
    const filler = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const sim = claimSimilarity('"The harmattan dust sat on the windowsill like a debt nobody wanted"', [
      {
        title: 'One',
        paragraphs: [
          `${filler} The harmattan dust sat on the windowsill like a debt nobody wanted ${filler}`,
        ],
      },
    ]);
    expect(sim.passages[0]!.book.startsWith('… ')).toBe(true);
    expect(sim.passages[0]!.book.endsWith(' …')).toBe(true);
    expect(sim.passages[0]!.book.split(/\s+/).length).toBeLessThan(60);
  });

  it('ignores [[ ]] in the input so marks cannot be forged', () => {
    const sim = claimSimilarity('"[[The harmattan dust sat on the windowsill like a debt]]"', BOOK);
    expect(sim.passages[0]!.source).toBe('[[The harmattan dust sat on the windowsill like a debt]]');
  });

  it('handles an empty book', () => {
    expect(claimSimilarity('"one two three four five six seven eight nine"', []).flagged).toBe(0);
  });
});

describe('email intake helpers', () => {
  it('reads the claim type from the subject, then the body', () => {
    expect(claimTypeOf('Plagiarism report', '')).toBe('plagiarism');
    expect(claimTypeOf('Hello', 'This author is impersonating me')).toBe('impersonation');
    expect(claimTypeOf('Copyright: Kano Nights', 'they plagiarised')).toBe('copyright');
    expect(claimTypeOf('Hi', 'please look')).toBe('copyright');
  });

  it('spots the copyright address in to or cc', () => {
    expect(isClaimAddress(['Support <support@arpedia.africa>', 'COPYRIGHT@arpedia.africa'])).toBe(true);
    expect(isClaimAddress({ email: 'copyright@arpedia.africa' })).toBe(true);
    expect(isClaimAddress('support@arpedia.africa')).toBe(false);
    expect(isClaimAddress(undefined)).toBe(false);
  });

  it('takes the display name of the sender', () => {
    expect(senderName('"Barr. Yetunde Coker" <legal@paramount.ng>')).toBe('Barr. Yetunde Coker');
    expect(senderName('legal@paramount.ng')).toBeNull();
    expect(senderName({ name: 'Paramount Books', email: 'x@y.ng' })).toBe('Paramount Books');
  });
});
