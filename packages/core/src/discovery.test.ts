import { describe, expect, it } from 'vitest';
import {
  LENGTH_BANDS,
  greeting,
  hoursRead,
  isSearchable,
  isTrending,
  lengthBand,
  movement,
  movementLabel,
  normalizeQuery,
  recommendationScore,
  searchesLabel,
  trimSnippet,
} from './discovery';

describe('normalizeQuery', () => {
  it('trims, lowercases, collapses spaces and drops accents', () => {
    expect(normalizeQuery('  Things   FALL\tApart ')).toBe('things fall apart');
    expect(normalizeQuery('Chínụ́a Àchebe')).toBe('chinua achebe');
  });
  it('cuts to 80 characters', () => {
    expect(normalizeQuery('a'.repeat(200))).toHaveLength(80);
  });
  it('runs nothing under 2 characters or only spaces', () => {
    expect(isSearchable('   ')).toBe(false);
    expect(isSearchable(' g ')).toBe(false);
    expect(isSearchable('gr')).toBe(true);
  });
});

describe('recommendationScore', () => {
  it('weights picked genres 60% and popularity 40%', () => {
    expect(
      recommendationScore(['Fiction', 'Nigerian books'], ['fiction', 'nigerian books'], 1, 8),
    ).toBeCloseTo(1);
    expect(recommendationScore(['Fiction'], ['Fiction', 'Drama'], 5, 8)).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.5);
  });
  it('uses popularity only without picks, and 0 when unranked', () => {
    expect(recommendationScore(['Fiction'], [], 3, 5)).toBeCloseTo(0.6);
    expect(recommendationScore(['Drama'], ['Fiction'], null, 5)).toBe(0);
  });
  it('counts a genre listed twice once', () => {
    expect(recommendationScore(['Fiction', 'fiction'], ['Fiction'], null, 5)).toBeCloseTo(0.6);
  });
});

describe('movement', () => {
  it('up, down, same and new', () => {
    expect(movementLabel(movement(2, 5))).toBe('▲ 3');
    expect(movementLabel(movement(4, 3))).toBe('▼ 1');
    expect(movementLabel(movement(5, 5))).toBe('—');
    expect(movementLabel(movement(3, null))).toBe('New');
    expect(movementLabel(movement(3, 14))).toBe('New');
  });
});

describe('lengthBand', () => {
  it('maps credits to the page bands at the edges', () => {
    expect(lengthBand(74)).toBe('short');
    expect(lengthBand(75)).toBe('medium');
    expect(lengthBand(149)).toBe('medium');
    expect(lengthBand(150)).toBe('long');
  });
  it('labels say pages = credits × 2', () => {
    expect(LENGTH_BANDS.map((b) => b.label)).toEqual(['Under 150 pages', '150 to 300 pages', '300+ pages']);
  });
});

describe('greeting', () => {
  it('switches at noon and 5 pm', () => {
    expect(greeting(0)).toBe('Good morning');
    expect(greeting(11)).toBe('Good morning');
    expect(greeting(12)).toBe('Good afternoon');
    expect(greeting(16)).toBe('Good afternoon');
    expect(greeting(17)).toBe('Good evening');
    expect(greeting(23)).toBe('Good evening');
  });
});

describe('trimSnippet', () => {
  const text =
    'The tin smelled of dust. I prayed for you today, though I do not know your name yet. By grace we meet.';
  it('returns the sentence around the match', () => {
    expect(trimSnippet(text, 'prayed')).toBe('I prayed for you today, though I do not know your name yet.');
    expect(trimSnippet(text, 'GRACE')).toBe('By grace we meet.');
    expect(trimSnippet(text, 'missing')).toBeNull();
  });
  it('cuts long sentences to 120 characters around the match', () => {
    const long = `${'word '.repeat(40)}harmattan ${'more '.repeat(40)}.`;
    const s = trimSnippet(long, 'harmattan')!;
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s).toContain('harmattan');
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
  });
});

describe('trending and labels', () => {
  it('needs 20 searchers and results', () => {
    expect(isTrending(20, 3)).toBe(true);
    expect(isTrending(19, 3)).toBe(false);
    expect(isTrending(500, 0)).toBe(false);
  });
  it('formats counts and hours', () => {
    expect(searchesLabel(2400)).toBe('2.4k searches this week');
    expect(searchesLabel(860)).toBe('860 searches this week');
    expect(hoursRead(62400)).toBe(5);
    expect(hoursRead(100)).toBe(1);
  });
});
