import type { EditMeta } from './actions';

export interface Current {
  title: string;
  subtitle: string;
  description: string;
  genres: string[];
  language: string;
  age: string;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Only the fields that differ from what readers see now. An emptied subtitle or description is sent
 * as '' (publishing keeps the old value for a missing or null one).
 */
export function changes(now: Current, next: Current): EditMeta {
  const m: EditMeta = {};
  if (next.title.trim() !== now.title.trim()) m.title = next.title.trim();
  if (next.subtitle.trim() !== now.subtitle.trim()) m.subtitle = next.subtitle.trim();
  if (next.description.trim() !== now.description.trim()) m.description = next.description.trim();
  if (!same(next.genres, now.genres)) m.genres = next.genres;
  if (next.language !== now.language) m.language = next.language;
  if (next.age !== now.age) m.age = next.age;
  return m;
}
