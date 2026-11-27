import { describe, expect, it } from 'vitest';
import { sortRows } from './table';

const rows = [
  { name: 'Chidi', books: 2, self: false },
  { name: 'ada', books: 5, self: false },
  { name: 'Bola', books: 5, self: true },
  { name: 'Emeka', books: null as number | null, self: false },
];
const names = (l: typeof rows) => l.map(r => r.name);

describe('sortRows', () => {
  it('sorts by one key, ascending or descending', () => {
    expect(names(sortRows(rows, [{ id: 'name', value: r => r.name }]))).toEqual(['ada', 'Bola', 'Chidi', 'Emeka']);
    expect(names(sortRows(rows, [{ id: 'name', value: r => r.name, desc: true }]))).toEqual([
      'Emeka',
      'Chidi',
      'Bola',
      'ada',
    ]);
  });

  it('breaks ties with the next key and puts missing values last', () => {
    const out = sortRows(rows, [
      { id: 'books', value: r => r.books, desc: true },
      { id: 'name', value: r => r.name },
    ]);
    expect(names(out)).toEqual(['ada', 'Bola', 'Chidi', 'Emeka']);
  });

  it('sorts booleans (true first when descending)', () => {
    expect(sortRows(rows, [{ id: 'self', value: r => r.self, desc: true }])[0]!.name).toBe('Bola');
  });

  it('keeps the input order for equal rows and never mutates the input', () => {
    const copy = [...rows];
    expect(names(sortRows(rows, [{ id: 'k', value: () => 1 }]))).toEqual(names(copy));
    expect(rows).toEqual(copy);
    expect(sortRows([], [{ id: 'k', value: () => 1 }])).toEqual([]);
  });
});
