import { describe, expect, it } from 'vitest';
import { bookPrice, standardPages } from './pricing';
import {
  balanceAfter,
  booksCovered,
  chaptersCovered,
  compactCount,
  mainButton,
  perChapter,
  pickTopupPack,
  readMinutes,
  readTimeLong,
  readTimeShort,
  remainingPrice,
  spendSheet,
  tipNaira,
} from './unlock';

describe('price from length', () => {
  it('pages from words, price from pages (Harmattan Letters)', () => {
    expect(standardPages(62400)).toBe(250);
    expect(bookPrice(250)).toBe(125);
    expect(bookPrice(standardPages(62501))).toBe(126);
  });
  it('per chapter is the price over chargeable chapters, rounded', () => {
    expect(perChapter(125, 14)).toBe(9);
    expect(perChapter(125, 0)).toBeNull();
  });
});

describe('reading time', () => {
  it('rounds to the nearest 5 minutes at 230 words a minute', () => {
    expect(readMinutes(62400)).toBe(270);
    expect(readMinutes(10000)).toBe(45);
  });
  it('labels', () => {
    expect(readTimeShort(270)).toBe('about 5 hr read');
    expect(readTimeShort(45)).toBe('about 45 min read');
    expect(readTimeLong(270)).toBe('about 4 h 30 min');
    expect(readTimeLong(300)).toBe('about 5 h');
  });
});

describe('counts', () => {
  it('shows 1.2K above 999', () => {
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1200)).toBe('1.2K');
    expect(compactCount(1250)).toBe('1.2K');
    expect(compactCount(18000)).toBe('18K');
    expect(compactCount(2_000_000)).toBe('2M');
  });
});

describe('balance after', () => {
  it('subtracts and never goes below zero', () => {
    expect(balanceAfter(840, 125)).toBe(715);
    expect(balanceAfter(40, 125)).toBe(0);
  });
  it('pay the rest: cap minus paid, snapshot cap wins when lower', () => {
    expect(remainingPrice(125, 27)).toBe(98);
    expect(remainingPrice(140, 27, 125)).toBe(98);
    expect(remainingPrice(100, 27, 125)).toBe(73);
    expect(remainingPrice(125, 130)).toBe(0);
  });
});

describe('k chapters covered', () => {
  it('counts consecutive unpaid chapters the balance pays', () => {
    expect(chaptersCovered(40, [9, 9, 9, 9, 9])).toBe(4);
    expect(chaptersCovered(8, [9, 9])).toBe(0);
    expect(chaptersCovered(18, [9, 10, 1])).toBe(1);
    expect(chaptersCovered(100, [])).toBe(0);
  });
});

describe('top-up pack selection', () => {
  it('smallest pack that covers missing', () => {
    expect(pickTopupPack(85)).toEqual({ pack: { credits: 200, naira: 600 }, enough: true });
    expect(pickTopupPack(200).pack.credits).toBe(200);
    expect(pickTopupPack(201).pack.credits).toBe(500);
    expect(pickTopupPack(1000).pack.credits).toBe(1000);
  });
  it('largest pack and a second top-up when missing exceeds 1,000', () => {
    expect(pickTopupPack(1001)).toEqual({ pack: { credits: 1000, naira: 3000 }, enough: false });
  });
});

describe('credit checks (rule 14)', () => {
  it('confirm with enough credits, plan or not', () => {
    expect(spendSheet(125, 840, 'plan')).toBe('confirm');
    expect(spendSheet(125, 125, 'none')).toBe('confirm');
  });
  it('low with a plan, nosub without', () => {
    expect(spendSheet(125, 40, 'plan')).toBe('low');
    expect(spendSheet(125, 40, 'none')).toBe('nosub');
  });
});

describe('tip and plan copy', () => {
  it('₦1.60 per credit reaches the author', () => {
    expect(tipNaira(50)).toBe(80);
    expect(tipNaira(20)).toBe(32);
  });
  it('quarterly plan covers 800 ÷ price books, rounded down', () => {
    expect(booksCovered(800, 125)).toBe(6);
  });
});

describe('main button', () => {
  const base = { comingSoon: false, percent: null, maxPercent: null, previewPercent: 10 };
  it('follows the reader state', () => {
    expect(mainButton(base)).toBe('Start reading · first 10% free');
    expect(mainButton({ ...base, percent: 38.4, maxPercent: 40 })).toBe('Continue reading · 38%');
    expect(mainButton({ ...base, percent: 100, maxPercent: 100 })).toBe('Read again');
    // Finished at 95% (flow 04), not only at 100.
    expect(mainButton({ ...base, percent: 96.2, maxPercent: 96.2 })).toBe('Read again');
    expect(mainButton({ ...base, percent: 94, maxPercent: 94 })).toBe('Continue reading · 94%');
    expect(mainButton({ ...base, comingSoon: true })).toBe('Notify me');
    expect(mainButton({ ...base, owned: true })).toBe('Start reading');
    expect(mainButton({ ...base, owned: true, percent: 38.4, maxPercent: 40 })).toBe(
      'Continue reading · 38%',
    );
  });
});
