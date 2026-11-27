import { describe, expect, it } from 'vitest';
import { AASA, APP_ID } from './aasa';
import { parseWorkerPolicy, POLICIES } from './legal';
import { redirects } from './redirects';
import { cleanCode, deepLink, nameFromSlug, titleFromSlug } from './share';

const long = 'A real paragraph of policy text. '.repeat(20);
const page = (body: string, steps = '') =>
  `<!doctype html><html><body><main><header><a href="/legal">arpedia</a></header><h1>Privacy &amp; you</h1><p class="meta">Version 2 · 24 November 2026</p>${steps}${body}<footer><a href="/legal">All policies</a></footer></main></body></html>`;

describe('parseWorkerPolicy', () => {
  it('takes the title, meta and body from the api Worker page', () => {
    const p = parseWorkerPolicy(page(`<p>${long}</p>`));
    expect(p?.title).toBe('Privacy & you');
    expect(p?.meta).toBe('Version 2 · 24 November 2026');
    expect(p?.html).toBe(`<p>${long}</p>`);
  });

  it('treats the one-line placeholder as not published', () => {
    expect(
      parseWorkerPolicy(
        page('<p>Privacy policy\n\nThe full text is published at arpedia.africa/legal/privacy.</p>'),
      ),
    ).toBeNull();
  });

  it('drops the Worker delete steps (the page shows its own) and scripts', () => {
    const p = parseWorkerPolicy(
      page(`<p>${long}</p><script>alert(1)</script>`, '<section class="steps"><h2>How</h2></section>'),
    );
    expect(p?.html).not.toContain('steps');
    expect(p?.html).not.toContain('script');
  });

  it('returns null for an error page', () => {
    expect(parseWorkerPolicy('<h1>Page not found</h1>')).toBeNull();
  });
});

describe('policies and redirects', () => {
  it('has every slug from the console', () => {
    expect(POLICIES.map((p) => p.slug)).toEqual([
      'terms',
      'privacy',
      'community-guidelines',
      'copyright',
      'author-agreement',
      'refunds',
      'delete-account',
    ]);
  });

  it('sends the old v25 URLs to their new homes', () => {
    const to = (s: string) => redirects.find((r) => r.source === s)?.destination;
    expect(to('/privacy')).toBe('/legal/privacy');
    expect(to('/terms')).toBe('/legal/terms');
    expect(to('/copyright')).toBe('/legal/copyright');
    expect(to('/delete-account')).toBe('/legal/delete-account');
    expect(to('/help')).toBe('/support');
    expect(to('/legal/refund')).toBe('/legal/refunds');
  });
});

describe('share links', () => {
  it('reads titles and names from slugs', () => {
    expect(titleFromSlug('the-alignment-8d2b0385')).toBe('The Alignment');
    expect(nameFromSlug('Ada%20Obi')).toBe('Ada Obi');
    expect(nameFromSlug('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('cleans room codes', () => {
    expect(cleanCode('grace-24a')).toBe('GRACE24A');
    expect(cleanCode('<script>x</script>')).toBe('SCRIPTXSCRIPT');
    expect(deepLink.room('grace24a')).toBe('arpedia://join-code?code=GRACE24A');
  });

  it('serves the app ids and share paths for universal links', () => {
    expect(APP_ID).toBe('FV22ZB99P8.africa.arpedia.reader');
    expect(AASA.applinks.details[0]!.components.map((c) => c['/'])).toContain('/r/*');
  });
});
