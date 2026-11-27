import { describe, expect, it } from 'vitest';
import { changes, type Current } from './changes';

const now: Current = {
  title: 'Harmattan Letters',
  subtitle: '',
  description: 'Twelve letters.',
  genres: ['Christian & Faith', 'African stories'],
  language: 'en',
  age: 'Everyone',
};

describe('changes', () => {
  it('sends nothing when only spaces were added', () => {
    expect(changes(now, { ...now, title: '  Harmattan Letters ', description: 'Twelve letters. ' })).toEqual({});
  });

  it('sends only the fields that differ, trimmed', () => {
    expect(changes(now, { ...now, title: ' Harmattan Letters (new) ', age: '13+' })).toEqual({
      title: 'Harmattan Letters (new)',
      age: '13+',
    });
  });

  it('clears an emptied optional field and notices genre order and removal', () => {
    expect(changes(now, { ...now, description: '  ', genres: ['African stories', 'Christian & Faith'] })).toEqual({
      description: '',
      genres: ['African stories', 'Christian & Faith'],
    });
    expect(changes(now, { ...now, genres: ['Christian & Faith'] })).toEqual({ genres: ['Christian & Faith'] });
  });

  it('ignores stray spaces or a newline already stored', () => {
    expect(changes({ ...now, description: 'Twelve letters.\n' }, { ...now, description: 'Twelve letters.\n' })).toEqual({});
  });

  it('adds a subtitle that was empty', () => {
    expect(changes(now, { ...now, subtitle: 'From Kano' })).toEqual({ subtitle: 'From Kano' });
  });
});
