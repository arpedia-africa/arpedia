import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_LINK_HOSTS, APP_LINK_PATHS, APP_LINK_PREFIXES, appLinkRoute, clubInviteUrl } from './applinks';

const ID = '8d2b0385-1c4e-4f2a-9b1d-2e6f7a8b9c0d';

describe('appLinkRoute', () => {
  it('opens each shared arpedia.africa path on its screen', () => {
    expect(appLinkRoute(`https://arpedia.africa/c/${ID}`)).toBe(`/chat/${ID}`);
    expect(appLinkRoute('https://arpedia.africa/r/grace24a')).toBe('/r/GRACE24A');
    expect(appLinkRoute(`https://www.arpedia.africa/book/${ID}`)).toBe(`/book/${ID}`);
    expect(appLinkRoute(`https://arpedia.africa/author/${ID.toUpperCase()}`)).toBe(`/author/${ID}`);
    expect(appLinkRoute(`https://arpedia.africa/community/${ID}?ref=x`)).toBe(`/community/${ID}`);
    expect(appLinkRoute('https://arpedia.africa/account')).toBe('/account');
  });

  it('searches for the words when the website link carries a name slug', () => {
    expect(appLinkRoute('https://arpedia.africa/book/the-alignment-8d2b0385')).toBe(
      '/search?q=the%20alignment',
    );
    expect(appLinkRoute('https://arpedia.africa/author/Ada%20Obi')).toBe('/search?q=Ada%20Obi');
    expect(appLinkRoute('https://arpedia.africa/community/grace-readers')).toBe('/community');
    expect(appLinkRoute('https://arpedia.africa/c/not-an-id')).toBe('/community');
  });

  it('opens Home for any other arpedia.africa path', () => {
    expect(appLinkRoute('https://arpedia.africa/')).toBe('/');
    expect(appLinkRoute('https://arpedia.africa/legal/terms')).toBe('/');
    expect(appLinkRoute('https://arpedia.africa/book/')).toBe('/');
    expect(appLinkRoute('https://arpedia.africa/r/')).toBe('/join-code');
  });

  it('rewrites the website hand-offs on the arpedia scheme', () => {
    expect(appLinkRoute(`arpedia://chat/${ID}`)).toBe(`/chat/${ID}`);
    expect(appLinkRoute('arpedia://join-code?code=grace-24a')).toBe('/join-code?code=GRACE24A');
    expect(appLinkRoute('arpedia://author/ada-obi')).toBe('/search?q=ada%20obi');
    expect(appLinkRoute(`arpedia://book/${ID}`)).toBe(`/book/${ID}`);
  });

  it('opens a private club invitation on its screen', () => {
    const T = '0a1b2c3d4e5f60718293a4b5';
    expect(clubInviteUrl(T)).toBe(`https://arpedia.africa/c/invite/${T}`);
    expect(appLinkRoute(clubInviteUrl(T))).toBe(`/club-invite/${T}`);
    expect(appLinkRoute(`https://www.arpedia.africa/c/invite/${T.toUpperCase()}`)).toBe(`/club-invite/${T}`);
    expect(appLinkRoute(`arpedia://c/invite/${T}`)).toBe(`/club-invite/${T}`);
    expect(appLinkRoute(`arpedia://club-invite/${T}`)).toBe(`/club-invite/${T}`);
    expect(appLinkRoute('https://arpedia.africa/c/invite/not-a-token')).toBe('/community');
    expect(appLinkRoute('https://arpedia.africa/c/invite/')).toBe('/community');
    expect(appLinkRoute(`https://arpedia.africa/c/invite/${T}/x`)).toBe('/community');
  });

  it('leaves other links alone', () => {
    expect(appLinkRoute('https://example.com/book/x')).toBeNull();
    expect(appLinkRoute('arpedia://reset-password#access_token=x')).toBeNull();
    expect(appLinkRoute(`arpedia://book/${ID}/reviews`)).toBeNull();
    expect(appLinkRoute('exp+arpedia://expo-development-client/?url=x')).toBeNull();
    expect(appLinkRoute('/home')).toBeNull();
    expect(appLinkRoute('')).toBeNull();
  });
});

describe('apps/mobile/app.json', () => {
  type Data = { scheme: string; host: string; pathPrefix?: string; path?: string };
  const app = JSON.parse(readFileSync(new URL('../../../apps/mobile/app.json', import.meta.url), 'utf8')) as {
    expo: {
      ios: { associatedDomains: string[] };
      android: { intentFilters: { autoVerify?: boolean; data: Data[] }[] };
    };
  };

  it('declares every app link host and path, verified', () => {
    const [filter] = app.expo.android.intentFilters;
    expect(filter?.autoVerify).toBe(true);
    const got = (filter?.data ?? []).map((d) => `${d.scheme}://${d.host}${d.pathPrefix ?? d.path}`);
    const want = APP_LINK_HOSTS.flatMap((h) =>
      [...APP_LINK_PREFIXES, ...APP_LINK_PATHS].map((p) => `https://${h}${p}`),
    );
    expect(got.sort()).toEqual(want.sort());
    expect(app.expo.ios.associatedDomains).toEqual(APP_LINK_HOSTS.map((h) => `applinks:${h}`));
  });
});
