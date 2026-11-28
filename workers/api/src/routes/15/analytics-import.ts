// Flow 15 · Server: analytics-import (rule 26, spec check 15-21). Nightly, the Growth tab's
// numbers that live outside the database:
// - installs: the Google Play Console export (OPEN-QUESTIONS 100). Play writes a monthly CSV per
//   app to its reports bucket (`stats/installs/installs_<package>_<YYYYMM>_overview.csv`, UTF-16);
//   a service account with "View app information and download bulk reports" reads it.
// - signups by source: PostHog `signup_completed` events by their `source` property, grouped into
//   the sources rule 26 names (anything else is Unknown).
// Each part runs only when its settings are present and saves through analytics_import_save
// (service role), replacing the days it covers. Nothing about a single reader leaves PostHog.
import type { Json } from '@arpedia/core';
import type { Env } from '../../env';
import { serviceDb } from '../../db';

export type SignupSource = 'play_search' | 'book_link' | 'church' | 'instagram' | 'author_code' | 'unknown';

export type DayValue = { day: string; value: number };

const DEFAULT_PACKAGE = 'com.arpedia.reader';
const DEFAULT_POSTHOG = 'https://eu.posthog.com';
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only';
/** Days of signups each night re-reads (late events and restated days settle within a month). */
const SOURCE_DAYS = 35;

/** 03:30 in Lagos (02:30 UTC), after Play's daily export has landed. */
export const isImportTime = (scheduledTime: number) => {
  const d = new Date(scheduledTime);
  return d.getUTCHours() === 2 && d.getUTCMinutes() === 30;
};

/** The rule 26 source for what the app sent as `source` (B sends these names; a few aliases too). */
export function signupSource(raw: unknown): SignupSource {
  const s =
    typeof raw === 'string'
      ? raw
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      : '';
  if (!s) return 'unknown';
  if (['play_search', 'play_store', 'google_play', 'play', 'organic'].includes(s)) return 'play_search';
  if (['book_link', 'shared_book', 'share', 'book'].includes(s)) return 'book_link';
  if (s.startsWith('church')) return 'church';
  if (s === 'ig' || s.includes('instagram')) return 'instagram';
  if (['author_code', 'author_referral', 'author'].includes(s)) return 'author_code';
  return 'unknown';
}

/** Text of a Play report: UTF-16 with a byte-order mark, or UTF-8. */
export function decodeReport(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, '');
}

/** Daily new-user installs from a Play installs overview CSV. */
export function parseInstalls(csv: string): DayValue[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const cells = (l: string) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
  const head = cells(lines[0]!).map((h) => h.toLowerCase());
  const day = head.indexOf('date');
  // New users who installed (Play's "user installs"); older exports only have device installs.
  let col = head.indexOf('daily user installs');
  if (col < 0) col = head.indexOf('daily device installs');
  if (day < 0 || col < 0) throw new Error('play installs report: Date or installs column missing');
  const out: DayValue[] = [];
  for (const l of lines.slice(1)) {
    const c = cells(l);
    const d = c[day] ?? '';
    const v = c[col] ? Number(c[col]) : Number.NaN;
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v) && v >= 0) out.push({ day: d, value: v });
  }
  return out;
}

const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/** A Google OAuth token for a service account (JWT bearer grant, RS256 with WebCrypto). */
export async function googleToken(
  serviceAccountJson: string,
  fetcher: typeof fetch,
  now = Date.now(),
): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as {
    client_email?: string;
    private_key?: string;
    token_uri?: string;
  };
  if (!sa.client_email || !sa.private_key)
    throw new Error('play reports key: client_email or private_key missing');
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 }),
  )}`;
  const der = Uint8Array.from(
    atob(sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')),
    (c) => c.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const res = await fetcher(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('google token: no access_token');
  return body.access_token;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Today's date in Lagos (UTC+1, no daylight saving). */
const lagosToday = (now: number) => new Date(now + 3_600_000);

/** This month and last month in Lagos, as {yyyymm, first day, last day}. */
export function reportMonths(now: number) {
  const t = lagosToday(now);
  return [1, 0].map((back) => {
    const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - back, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    return { yyyymm: iso(first).slice(0, 7).replace('-', ''), from: iso(first), to: iso(last) };
  });
}

async function save(env: Env, metric: string, from: string, to: string, rows: Json[]) {
  const { data, error } = await serviceDb(env).rpc('analytics_import_save', {
    p_metric: metric,
    p_from: from,
    p_to: to,
    p_rows: rows,
  });
  if (error) throw error;
  return (data as number | null) ?? 0;
}

/** Installs from the Play Console export, last month and this month. Returns days saved. */
export async function importPlayInstalls(env: Env, fetcher: typeof fetch, now: number): Promise<number> {
  if (!env.PLAY_REPORTS_BUCKET || !env.PLAY_REPORTS_SERVICE_ACCOUNT) return 0;
  const token = await googleToken(env.PLAY_REPORTS_SERVICE_ACCOUNT, fetcher, now);
  const pkg = env.PLAY_PACKAGE_NAME || DEFAULT_PACKAGE;
  let saved = 0;
  for (const m of reportMonths(now)) {
    const object = `stats/installs/installs_${pkg}_${m.yyyymm}_overview.csv`;
    const res = await fetcher(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(env.PLAY_REPORTS_BUCKET)}/o/${encodeURIComponent(object)}?alt=media`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    // No report for the month yet (a new app, or the 1st before Play writes it): keep what is there.
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`play installs report ${m.yyyymm}: ${res.status}`);
    const rows = parseInstalls(decodeReport(new Uint8Array(await res.arrayBuffer()))).filter(
      (r) => r.day >= m.from && r.day <= m.to,
    );
    saved += await save(env, 'installs', m.from, m.to, rows);
  }
  return saved;
}

/** Signups by source from PostHog for the last 35 days to yesterday (Lagos). Returns rows saved. */
export async function importSignupSources(env: Env, fetcher: typeof fetch, now: number): Promise<number> {
  if (!env.POSTHOG_PROJECT_ID || !env.POSTHOG_PERSONAL_API_KEY) return 0;
  if (!/^\d+$/.test(env.POSTHOG_PROJECT_ID)) throw new Error('POSTHOG_PROJECT_ID must be the project number');
  // Private API calls go to the app host, not the ingestion host (eu.i.posthog.com → eu.posthog.com).
  const host = (
    env.POSTHOG_API_HOST ||
    env.POSTHOG_HOST?.replace('.i.posthog.com', '.posthog.com') ||
    DEFAULT_POSTHOG
  ).replace(/\/+$/, '');
  if (!host.startsWith('https://')) return 0;
  const today = lagosToday(now);
  const to = iso(new Date(today.getTime() - 86_400_000));
  const from = iso(new Date(today.getTime() - SOURCE_DAYS * 86_400_000));
  const query =
    "select toDate(toTimeZone(timestamp, 'Africa/Lagos')) as d, toString(properties.source) as s, " +
    'count(distinct distinct_id) as n from events ' +
    "where event = 'signup_completed' " +
    `and toDate(toTimeZone(timestamp, 'Africa/Lagos')) between toDate('${from}') and toDate('${to}') ` +
    'group by d, s order by d limit 10000';
  const res = await fetcher(`${host}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`posthog query ${res.status}`);
  const body = (await res.json()) as { results?: unknown[][] };
  const sums = new Map<string, number>();
  for (const [d, s, n] of body.results ?? []) {
    const day = String(d).slice(0, 10);
    const count = Number(n);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < from || day > to || !Number.isFinite(count) || count < 0)
      continue;
    const k = `${day}|${signupSource(s)}`;
    sums.set(k, (sums.get(k) ?? 0) + count);
  }
  const rows = [...sums].map(([k, value]) => {
    const [day, source] = k.split('|');
    return { day, dim: { source }, value };
  });
  return save(env, 'signups_by_source', from, to, rows);
}

/** The nightly import: each part on its own, so one failing source does not stop the other. */
export async function analyticsImport(env: Env, scheduledTime: number, fetcher: typeof fetch = fetch) {
  const [installs, sources] = await Promise.allSettled([
    importPlayInstalls(env, fetcher, scheduledTime),
    importSignupSources(env, fetcher, scheduledTime),
  ]);
  for (const [name, r] of [
    ['installs', installs],
    ['signup sources', sources],
  ] as const)
    if (r.status === 'rejected') console.error(`[analytics-import] ${name}:`, String(r.reason));
  return {
    installs: installs.status === 'fulfilled' ? installs.value : null,
    sources: sources.status === 'fulfilled' ? sources.value : null,
  };
}
