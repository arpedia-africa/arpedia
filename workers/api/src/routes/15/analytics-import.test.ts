import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../env';
import {
  analyticsImport,
  decodeReport,
  googleToken,
  importPlayInstalls,
  importSignupSources,
  isImportTime,
  parseInstalls,
  reportMonths,
  signupSource,
} from './analytics-import';

const rpc = vi.fn();
vi.mock('../../db', () => ({ serviceDb: () => ({ rpc }) }));

// 28 Nov 2026, 02:30 UTC = 03:30 in Lagos.
const NOW = Date.UTC(2026, 10, 28, 2, 30);

const CSV = [
  'Date,Package Name,Daily Device Installs,Daily Device Uninstalls,Daily Device Upgrades,Total User Installs,Daily User Installs,Daily User Uninstalls,Active Device Installs,Install events,Update events,Uninstall events',
  '2026-11-01,com.arpedia.reader,45,3,10,1200,40,2,900,50,12,4',
  '2026-11-02,com.arpedia.reader,70,1,8,1260,60,1,950,75,9,1',
  '2026-11-03,com.arpedia.reader,,,,,,,,,,',
].join('\n');

/** Play writes its reports in UTF-16LE with a byte-order mark. */
const utf16 = (s: string) => {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < s.length; i++) {
    out[2 + i * 2] = s.charCodeAt(i) & 0xff;
    out[3 + i * 2] = s.charCodeAt(i) >> 8;
  }
  return out;
};

let keys: CryptoKeyPair;
let serviceAccount: string;
beforeEach(async () => {
  rpc.mockReset();
  rpc.mockImplementation(async (_fn: string, args: { p_rows: unknown[] }) => ({
    data: args.p_rows.length,
    error: null,
  }));
  keys ??= (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey('pkcs8', keys.privateKey)) as ArrayBuffer);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).replace(/.{64}/g, '$&\n')}\n-----END PRIVATE KEY-----\n`;
  serviceAccount = JSON.stringify({
    client_email: 'reports@arpedia.iam.gserviceaccount.com',
    private_key: pem,
  });
});

const env = (over: Partial<Env> = {}) =>
  ({
    APP_ENV: 'production',
    PLAY_REPORTS_BUCKET: 'pubsite_prod_rev_0123',
    PLAY_REPORTS_SERVICE_ACCOUNT: serviceAccount,
    POSTHOG_HOST: 'https://eu.i.posthog.com',
    POSTHOG_PROJECT_ID: '4242',
    POSTHOG_PERSONAL_API_KEY: 'phx_test',
    ...over,
  }) as Env;

const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

describe('analytics-import (flow 15, 15-21)', () => {
  it('runs at 03:30 in Lagos only', () => {
    expect(isImportTime(NOW)).toBe(true);
    expect(isImportTime(NOW + 60_000)).toBe(false);
    expect(isImportTime(NOW + 3_600_000)).toBe(false);
  });

  it('groups what the app sent into the sources rule 26 names', () => {
    expect(signupSource('play_search')).toBe('play_search');
    expect(signupSource('Google Play')).toBe('play_search');
    expect(signupSource('book_link')).toBe('book_link');
    expect(signupSource('church_lagos_island')).toBe('church');
    expect(signupSource('instagram_story')).toBe('instagram');
    expect(signupSource('author_code')).toBe('author_code');
    expect(signupSource('tiktok')).toBe('unknown');
    expect(signupSource(null)).toBe('unknown');
    expect(signupSource('')).toBe('unknown');
  });

  it('reads Play daily user installs from a UTF-16 report, skipping empty days', () => {
    expect(parseInstalls(decodeReport(utf16(CSV)))).toEqual([
      { day: '2026-11-01', value: 40 },
      { day: '2026-11-02', value: 60 },
    ]);
    expect(parseInstalls('Date,Daily Device Installs\n2026-10-01,5')).toEqual([
      { day: '2026-10-01', value: 5 },
    ]);
    expect(() => parseInstalls('Day,Something\n1,2')).toThrow(/column missing/);
  });

  it('covers last month and this month in Lagos', () => {
    expect(reportMonths(NOW)).toEqual([
      { yyyymm: '202610', from: '2026-10-01', to: '2026-10-31' },
      { yyyymm: '202611', from: '2026-11-01', to: '2026-11-30' },
    ]);
    // 31 Dec 23:30 UTC is already 1 Jan in Lagos.
    expect(reportMonths(Date.UTC(2026, 11, 31, 23, 30)).map((m) => m.yyyymm)).toEqual(['202612', '202701']);
  });

  it('signs a service-account token request that Google can verify', async () => {
    const fetcher = vi.fn(async () => Response.json({ access_token: 'ya29.t' }));
    expect(await googleToken(serviceAccount, fetcher, NOW)).toBe('ya29.t');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const form = init.body as URLSearchParams;
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [h, p, s] = form.get('assertion')!.split('.');
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p!)));
    expect(claims).toMatchObject({
      iss: 'reports@arpedia.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/devstorage.read_only',
      aud: 'https://oauth2.googleapis.com/token',
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    });
    expect(
      await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        keys.publicKey,
        fromB64url(s!),
        new TextEncoder().encode(`${h}.${p}`),
      ),
    ).toBe(true);
  });

  it('saves each month of installs Play has written, and keeps a month it has not', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com')) return Response.json({ access_token: 'ya29.t' });
      if (url.includes('202610')) return new Response('not found', { status: 404 });
      return new Response(utf16(CSV));
    }) as unknown as typeof fetch;
    expect(await importPlayInstalls(env(), fetcher, NOW)).toBe(2);
    const calls = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
    expect(calls[2]![0]).toBe(
      'https://storage.googleapis.com/storage/v1/b/pubsite_prod_rev_0123/o/stats%2Finstalls%2Finstalls_com.arpedia.reader_202611_overview.csv?alt=media',
    );
    expect((calls[2]![1].headers as Record<string, string>).authorization).toBe('Bearer ya29.t');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('analytics_import_save', {
      p_metric: 'installs',
      p_from: '2026-11-01',
      p_to: '2026-11-30',
      p_rows: [
        { day: '2026-11-01', value: 40 },
        { day: '2026-11-02', value: 60 },
      ],
    });
  });

  it('asks PostHog for 35 days of signups to yesterday and saves them by source', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        results: [
          ['2026-11-20', 'instagram', 4],
          ['2026-11-20', 'Instagram Story', 2],
          ['2026-11-20', null, 3],
          ['2026-11-21', 'church_ikeja', 5],
          ['2026-11-28', 'book_link', 1],
        ],
      }),
    ) as unknown as typeof fetch;
    expect(await importSignupSources(env(), fetcher, NOW)).toBe(3);
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://eu.posthog.com/api/projects/4242/query/');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer phx_test');
    const q = JSON.parse(init.body as string).query;
    expect(q.kind).toBe('HogQLQuery');
    expect(q.query).toContain("event = 'signup_completed'");
    expect(q.query).toContain("between toDate('2026-10-24') and toDate('2026-11-27')");
    expect(rpc).toHaveBeenCalledWith('analytics_import_save', {
      p_metric: 'signups_by_source',
      p_from: '2026-10-24',
      p_to: '2026-11-27',
      p_rows: [
        { day: '2026-11-20', dim: { source: 'instagram' }, value: 6 },
        { day: '2026-11-20', dim: { source: 'unknown' }, value: 3 },
        { day: '2026-11-21', dim: { source: 'church' }, value: 5 },
      ],
    });
  });

  it('does nothing without settings, and one failing source does not stop the other', async () => {
    const none = vi.fn() as unknown as typeof fetch;
    expect(
      await analyticsImport(
        env({ PLAY_REPORTS_SERVICE_ACCOUNT: undefined, POSTHOG_PERSONAL_API_KEY: undefined }),
        NOW,
        none,
      ),
    ).toEqual({ installs: 0, sources: 0 });
    expect(none).not.toHaveBeenCalled();

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetcher = vi.fn(async (url: string) =>
      url.startsWith('https://oauth2.googleapis.com')
        ? new Response('bad key', { status: 400 })
        : Response.json({ results: [['2026-11-20', 'book_link', 7]] }),
    ) as unknown as typeof fetch;
    expect(await analyticsImport(env(), NOW, fetcher)).toEqual({ installs: null, sources: 1 });
    expect(error).toHaveBeenCalledWith('[analytics-import] installs:', 'Error: google token 400');
    error.mockRestore();
  });
});
