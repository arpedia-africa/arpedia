import { describe, expect, it } from 'vitest';
import { referrerParams, signupSourceFrom } from './signupSource';

describe('signupSourceFrom', () => {
  it('reads a plain Play Store install as Play Store search', () => {
    expect(signupSourceFrom({ referrer: 'utm_source=google-play&utm_medium=organic' })).toBe('play_search');
  });

  it('reads tagged install links', () => {
    expect(signupSourceFrom({ referrer: 'utm_source=instagram&utm_medium=social' })).toBe('instagram');
    expect(signupSourceFrom({ referrer: 'utm_source=IG' })).toBe('instagram');
    expect(signupSourceFrom({ referrer: 'utm_source=church-lagos&utm_campaign=sunday' })).toBe('church');
    expect(signupSourceFrom({ referrer: 'utm_source=author_code&utm_campaign=chiamaka' })).toBe(
      'author_code',
    );
    expect(signupSourceFrom({ referrer: 'ref=author-ngozi' })).toBe('author_code');
    expect(signupSourceFrom({ referrer: 'utm_source=book_link' })).toBe('book_link');
  });

  it('decodes a referrer that arrives encoded', () => {
    expect(signupSourceFrom({ referrer: 'utm_source%3Dinstagram%26utm_medium%3Dbio' })).toBe('instagram');
  });

  it('counts a book link that opened the app before sign-up', () => {
    expect(signupSourceFrom({ referrer: 'utm_source=google-play&utm_medium=organic', bookLink: true })).toBe(
      'book_link',
    );
    expect(signupSourceFrom({ bookLink: true })).toBe('book_link');
    // A tagged install still wins over the later link.
    expect(signupSourceFrom({ referrer: 'utm_source=church', bookLink: true })).toBe('church');
  });

  it('falls back to unknown', () => {
    expect(signupSourceFrom({})).toBe('unknown');
    expect(signupSourceFrom({ referrer: '' })).toBe('unknown');
    expect(signupSourceFrom({ referrer: 'utm_source=(not%20set)&utm_medium=(not%20set)' })).toBe('unknown');
    expect(signupSourceFrom({ referrer: '%E0%A4%A' })).toBe('unknown');
  });
});

describe('referrerParams', () => {
  it('keeps the first value and lower-cases it', () => {
    const p = referrerParams('utm_source=Instagram+Bio&utm_source=other');
    expect(p.get('utm_source')).toBe('instagram_bio');
  });
  it('reads the query of a full URL', () => {
    expect(referrerParams('https://x.test/?utm_medium=organic').get('utm_medium')).toBe('organic');
  });
});
