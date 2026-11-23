import { describe, expect, it } from 'vitest';
import {
  bookTimeLeft,
  compareItems,
  formatMB,
  matchesQuery,
  mergePage,
  offlineLine,
  paymentLine,
  shelvesOf,
  type LibraryItem,
} from './library';

const item = (o: Partial<LibraryItem>): LibraryItem => ({
  book_id: 'b',
  title: 'T',
  author_name: 'A',
  cover_key: null,
  percent: 0,
  max_percent: 0,
  chapter_uid: null,
  chapter_ord: 1,
  chapters_total: 14,
  pages: 200,
  last_opened_at: null,
  finished_at: null,
  owns_book: false,
  paid_credits: 0,
  price_credits: 100,
  remaining_credits: 100,
  preview_percent: 10,
  preview_ended: false,
  coming_soon_at: null,
  gift_from_name: null,
  my_stars: null,
  words_left: 0,
  unpublished: false,
  shelves: { reading: false, saved: false, finished: false },
  ...o,
});

describe('shelvesOf', () => {
  const base = {
    opened: false,
    max_percent: 0,
    finished_at: null,
    owns_book: false,
    saved_row: false,
    hidden: false,
  };
  it('reading: opened, progress, not finished', () => {
    expect(shelvesOf({ ...base, opened: true, max_percent: 94.9 })).toEqual({
      reading: true,
      saved: false,
      finished: false,
    });
  });
  it('finished once finished_at is set; never both', () => {
    expect(shelvesOf({ ...base, opened: true, max_percent: 100, finished_at: '2026-11-10' })).toEqual({
      reading: false,
      saved: false,
      finished: true,
    });
  });
  it('owned and never opened is Saved, unless hidden; opening moves it out', () => {
    expect(shelvesOf({ ...base, owns_book: true }).saved).toBe(true);
    expect(shelvesOf({ ...base, owns_book: true, hidden: true }).saved).toBe(false);
    expect(shelvesOf({ ...base, owns_book: true, opened: true, max_percent: 1 })).toEqual({
      reading: true,
      saved: false,
      finished: false,
    });
  });
  it('a finished book can also be Saved', () => {
    expect(shelvesOf({ ...base, opened: true, finished_at: 'x', max_percent: 100, saved_row: true })).toEqual(
      {
        reading: false,
        saved: true,
        finished: true,
      },
    );
  });
});

describe('bookTimeLeft', () => {
  it('hours and minutes at 230 wpm', () => {
    expect(bookTimeLeft(230 * 130)).toBe('2 h 10 min left');
    expect(bookTimeLeft(230 * 60)).toBe('1 h left');
    expect(bookTimeLeft(230 * 25 + 100)).toBe('25 min left');
    expect(bookTimeLeft(100)).toBe('Less than a minute left');
    expect(bookTimeLeft(-5)).toBe('Less than a minute left');
  });
});

describe('offlineLine', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const h = 3_600_000;
  it('days left rounded down', () => {
    expect(offlineLine(now + 6 * 24 * h + 23 * h, now).label).toBe('Ready offline · 6 days left');
    expect(offlineLine(now + 24 * h, now).label).toBe('Ready offline · 1 day left');
  });
  it('under 24 h and expired', () => {
    expect(offlineLine(now + 23 * h, now).label).toBe('Ready offline · Less than a day left');
    expect(offlineLine(now, now)).toEqual({ expired: true, label: 'Expired · connect to refresh' });
  });
});

describe('formatMB', () => {
  it('0 or 1 decimal', () => {
    expect(formatMB(3.44 * 1_048_576)).toBe('3.4 MB');
    expect(formatMB(12.6 * 1_048_576)).toBe('13 MB');
    expect(formatMB(0)).toBe('0 MB');
  });
});

describe('compareItems', () => {
  const a = item({
    book_id: '1',
    title: 'banana',
    percent: 30,
    last_opened_at: '2026-11-19T10:00Z',
    finished_at: '2026-11-01',
  });
  const b = item({
    book_id: '2',
    title: 'Apple',
    percent: 70,
    last_opened_at: '2026-11-18T10:00Z',
    finished_at: '2026-11-05',
  });
  const c = item({
    book_id: '3',
    title: 'cherry',
    percent: 70,
    last_opened_at: '2026-11-17T10:00Z',
    finished_at: '2026-10-01',
  });
  const ids = (shelf: Parameters<typeof compareItems>[0], s: Parameters<typeof compareItems>[1]) =>
    [a, b, c].sort(compareItems(shelf, s)).map((i) => i.book_id);
  it('last opened newest first', () => expect(ids('reading', 'last_opened')).toEqual(['1', '2', '3']));
  it('title A to Z, case-insensitive', () => expect(ids('reading', 'title')).toEqual(['2', '1', '3']));
  it('progress highest first, ties by id like the server', () =>
    expect(ids('reading', 'progress')).toEqual(['3', '2', '1']));
  it('finished by finish date unless title or progress', () => {
    expect(ids('finished', 'last_opened')).toEqual(['2', '1', '3']);
    expect(ids('finished', 'title')).toEqual(['2', '1', '3']);
  });
});

describe('mergePage', () => {
  it('appends the next page without repeating books', () => {
    const p1 = [item({ book_id: '1' }), item({ book_id: '2' })];
    const p2 = [item({ book_id: '2' }), item({ book_id: '3' })];
    expect(mergePage(p1, p2).map((i) => i.book_id)).toEqual(['1', '2', '3']);
  });
});

describe('matchesQuery', () => {
  it('title or author, accents and case ignored', () => {
    expect(matchesQuery({ title: 'Harmattan Letters', author_name: 'Ifeoma' }, 'harm')).toBe(true);
    expect(matchesQuery({ title: 'X', author_name: 'Chinụa Ọkọ' }, 'okO')).toBe(true);
    expect(matchesQuery({ title: 'X', author_name: null }, 'zzz')).toBe(false);
    expect(matchesQuery({ title: 'X', author_name: null }, '  ')).toBe(true);
  });
});

describe('paymentLine', () => {
  it('by payment state', () => {
    expect(paymentLine(item({ owns_book: true, chapter_ord: 7 }))).toBe('Chapter 7 of 14 · unlocked');
    expect(paymentLine(item({ paid_credits: 132, price_credits: 184 }))).toBe(
      'Pay as you read · Paid 132 of 184 credits',
    );
    expect(paymentLine(item({ preview_ended: true }))).toBe('Free preview finished');
  });
});
