import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { backupKey, collect, copyCounts, decryptFile, encryptStream, expired, objectKey } from './backup.mjs';
import { NON_RELEASE_MARKERS, REQUIRED_SETTINGS, readReleaseBundle, runPreflight } from './preflight.mjs';
import { CONFIG_CHECKS, runSetup } from './setup.mjs';
import { toCsv } from './unmatched.mjs';

const VERSIONS = ['20261117000000', '20261123000000'];
const pass = (key, extra = {}) => ({ key, status: 'pass', detail: 'ok', ...extra });

/** A database the set-up talks to: migrations, launch_check, seed accounts, first-admin invites. */
function fakeTarget({ seeds = [], applied = [] } = {}) {
  const state = { applied: new Set(applied), invites: [], migrations: 0, superAdmin: false };
  const db = {
    async authUsers(test) {
      return seeds.filter((s) => test(s)).map((email) => ({ email }));
    },
    async rpc(fn, args) {
      if (fn === 'launch_check') {
        if (!state.applied.has('20261123000000')) {
          const e = new Error('function not found');
          e.code = 'PGRST202';
          throw e;
        }
        return [
          pass('migrations', { versions: [...state.applied] }),
          ...CONFIG_CHECKS.map((k) => pass(k)),
          {
            key: 'super_admin',
            status: state.superAdmin ? 'pass' : state.invites.length ? 'warn' : 'fail',
            detail: '',
          },
        ];
      }
      if (fn === 'invite_first_super_admin') {
        expect(args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
        state.invites.push(args.p_email);
        return 'invite-id';
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
  };
  const migrate = async () => {
    state.migrations++;
    VERSIONS.forEach((v) => state.applied.add(v));
  };
  const emails = [];
  const sendInvite = async (to, _name, link) => {
    emails.push({ to, link });
    return true;
  };
  return { db, migrate, sendInvite, state, emails };
}

const setup = (t, over = {}) =>
  runSetup({
    target: 'production',
    apply: true,
    adminEmail: 'amaka@arpedia.africa',
    adminName: 'Amaka Obi',
    adminUrl: 'https://admin.arpedia.africa',
    versions: VERSIONS,
    log: () => {},
    ...t,
    ...over,
  });

describe('setup.mjs', () => {
  it('sets up a fresh database, and a second run changes nothing', async () => {
    const t = fakeTarget();
    const first = await setup(t);
    expect(first.items.filter((i) => i.status === 'fail')).toEqual([]);
    expect(t.state.migrations).toBe(1);
    expect(t.state.invites).toEqual(['amaka@arpedia.africa']);
    expect(t.emails[0].link).toMatch(/^https:\/\/admin\.arpedia\.africa\/invite\/[\w-]{43}$/);

    const second = await setup(t);
    expect(second.changed).toEqual([]);
    expect(t.state.migrations).toBe(1);
    expect(t.state.invites).toHaveLength(1);
    expect(second.items.find((i) => i.key === 'super_admin').status).toBe('pass');
  });

  it('finishes the rest when an earlier run stopped halfway', async () => {
    const t = fakeTarget({ applied: VERSIONS });
    const res = await setup(t);
    expect(t.state.migrations).toBe(0);
    expect(res.changed).toEqual(['super_admin: invited amaka@arpedia.africa by email']);
  });

  it('refuses seed data in production before changing anything', async () => {
    const t = fakeTarget({ seeds: ['ngozi@example.com', 'amaka@arpedia.africa'] });
    await expect(setup(t)).rejects.toThrow(/seed accounts/);
    expect(t.state.migrations).toBe(0);
    expect(t.state.invites).toEqual([]);
  });

  it('allows seed data on staging, with a warning', async () => {
    const t = fakeTarget({ seeds: ['ngozi@example.com'] });
    const res = await setup(t, { target: 'staging' });
    expect(res.items.find((i) => i.key === 'seed_users').status).toBe('warn');
    expect(t.state.migrations).toBe(1);
  });

  it('only reports without --apply', async () => {
    const t = fakeTarget();
    const res = await setup(t, { apply: false });
    expect(t.state.migrations).toBe(0);
    expect(t.state.invites).toEqual([]);
    expect(res.items.find((i) => i.key === 'migrations').status).toBe('fail');
  });

  it('needs the admin email and name to invite', async () => {
    const t = fakeTarget({ applied: VERSIONS });
    const res = await setup(t, { adminEmail: undefined });
    expect(res.items.find((i) => i.key === 'super_admin').status).toBe('fail');
    expect(t.state.invites).toEqual([]);
  });
});

// ─── Preflight ──────────────────────────────────────────────────────────────
const DB_ITEMS = [
  'rls',
  'seed_users',
  'scheduled_jobs',
  'scheduled_job_runs',
  'queues',
  'super_admin',
  'live_books',
  'empty_genres',
  'empty_home_rails',
  'database_size',
  'unmatched_store_events',
];
const NOW = Date.parse('2026-12-01T12:00:00Z');

function healthy() {
  const check = [pass('migrations', { versions: VERSIONS }), ...DB_ITEMS.map((k) => pass(k))];
  const routes = {
    '/health': () => new Response(JSON.stringify({ ok: true, env: 'production' })),
    '/v1/payments/revenuecat': () => new Response('{}', { status: 401 }),
    '/v1/payments/flutterwave': () => new Response('{}', { status: 401 }),
  };
  return {
    check,
    routes,
    settings: { api: [...REQUIRED_SETTINGS.api], chat: [...REQUIRED_SETTINGS.chat] },
    publicBuckets: {},
    backups: [{ key: 'db/2026-12-01T0200Z.sql.gz.enc', lastModified: new Date('2026-12-01T02:05:00Z') }],
    sentry: 12,
    posthog: 340,
    bundle: {
      entries: ['base/assets/index.android.bundle'],
      text: 'https://api.arpedia.africa https://arpedia.supabase.co',
    },
  };
}

function preflight(w) {
  return runPreflight({
    target: 'production',
    versions: VERSIONS,
    now: NOW,
    apiUrl: 'https://api.arpedia.africa',
    db: { rpc: async () => w.check },
    fetchImpl: async (url) => w.routes[new URL(url).pathname](),
    settingNames: async (worker) => w.settings[worker],
    buckets: ['arpedia-books', 'arpedia-backups'],
    r2Public: async (b) => w.publicBuckets[b] ?? { managed: false, custom: 0 },
    backups: async () => w.backups,
    sentryEvents: async () => w.sentry,
    posthogEvents: async () => w.posthog,
    bundle: w.bundle,
  });
}

const failed = (items) => items.filter((i) => i.status === 'fail').map((i) => i.key);

describe('preflight.mjs', () => {
  it('passes when everything is in place', async () => {
    expect(failed(await preflight(healthy()))).toEqual([]);
  });

  const breaks = {
    migrations: (w) => (w.check[0].versions = VERSIONS.slice(0, 1)),
    rls: (w) => (w.check.find((i) => i.key === 'rls').status = 'fail'),
    seed_users: (w) => (w.check.find((i) => i.key === 'seed_users').status = 'fail'),
    scheduled_jobs: (w) => (w.check.find((i) => i.key === 'scheduled_jobs').status = 'fail'),
    scheduled_job_runs: (w) => (w.check.find((i) => i.key === 'scheduled_job_runs').status = 'fail'),
    queues: (w) => (w.check.find((i) => i.key === 'queues').status = 'fail'),
    super_admin: (w) => (w.check = w.check.filter((i) => i.key !== 'super_admin')),
    api_worker_settings: (w) => (w.settings.api = w.settings.api.filter((n) => n !== 'BOOK_MASTER_KEY')),
    chat_worker_settings: (w) => (w.settings.chat = []),
    api_health: (w) => (w.routes['/health'] = () => new Response('{}', { status: 502 })),
    webhook_revenuecat: (w) =>
      (w.routes['/v1/payments/revenuecat'] = () => new Response('{}', { status: 200 })),
    webhook_flutterwave: (w) =>
      (w.routes['/v1/payments/flutterwave'] = () => new Response('{}', { status: 503 })),
    'r2_private:arpedia-books': (w) => (w.publicBuckets['arpedia-books'] = { managed: true, custom: 0 }),
    'r2_private:arpedia-backups': (w) => (w.publicBuckets['arpedia-backups'] = { managed: false, custom: 1 }),
    backups: (w) => (w.backups[0].lastModified = new Date('2026-11-30T02:05:00Z')),
    sentry: (w) => (w.sentry = 0),
    posthog: (w) => (w.posthog = 0),
    release_endpoints: (w) => (w.bundle.text += ' https://arpedia-staging.supabase.co'),
    expo_public_kit: (w) => w.bundle.entries.push('base/res/xml/kit_network.xml'),
    release_build: (w) => (w.bundle = null),
  };

  it.each(Object.keys(breaks))('fails when %s is missing', async (key) => {
    const w = healthy();
    breaks[key](w);
    expect(failed(await preflight(w))).toEqual([key]);
  });

  it('fails a check whose source errors, without stopping the others', async () => {
    const w = healthy();
    const items = await runPreflight({
      target: 'production',
      versions: VERSIONS,
      now: NOW,
      apiUrl: 'https://api.arpedia.africa',
      db: { rpc: async () => w.check },
      fetchImpl: async (url) => w.routes[new URL(url).pathname](),
      settingNames: async () => {
        throw new Error('Missing environment: CLOUDFLARE_API_TOKEN');
      },
      buckets: [],
      r2Public: async () => ({ managed: false, custom: 0 }),
      backups: async () => w.backups,
      sentryEvents: async () => 1,
      posthogEvents: async () => 1,
      bundle: w.bundle,
    });
    expect(failed(items)).toEqual(['api_worker_settings', 'chat_worker_settings']);
    expect(items.find((i) => i.key === 'api_worker_settings').detail).toMatch(/CLOUDFLARE_API_TOKEN/);
  });

  it('warns (not fails) below the launch target of live books', async () => {
    const w = healthy();
    w.check.find((i) => i.key === 'live_books').status = 'warn';
    const items = await preflight(w);
    expect(failed(items)).toEqual([]);
    expect(items.find((i) => i.key === 'live_books').status).toBe('warn');
  });

  it('reads the bundle and resources out of an .aab', () => {
    const aab = zipSync({
      'base/assets/index.android.bundle': new TextEncoder().encode('x https://arpedia-staging.supabase.co y'),
      'base/res/xml/kit_network.xml': new Uint8Array([1]),
      'base/dex/classes.dex': new Uint8Array([2]),
    });
    const b = readReleaseBundle(aab);
    expect(b.entries.sort()).toEqual(['base/assets/index.android.bundle', 'base/res/xml/kit_network.xml']);
    expect(NON_RELEASE_MARKERS.some((m) => b.text.includes(m))).toBe(true);
  });
});

// ─── Backups ────────────────────────────────────────────────────────────────
describe('backup.mjs', () => {
  const key = backupKey(Buffer.alloc(32, 7).toString('base64'));
  const dir = mkdtempSync(join(tmpdir(), 'arpedia-backup-test-'));

  async function encryptTo(path, data) {
    const chunks = [];
    await pipeline(Readable.from([data]), encryptStream(key), collect(chunks));
    writeFileSync(path, Buffer.concat(chunks));
  }
  async function decrypt(path, k = key) {
    const chunks = [];
    for await (const c of decryptFile(path, k)) chunks.push(c);
    return Buffer.concat(chunks).toString();
  }

  it('round-trips through AES-256-GCM', async () => {
    const f = join(dir, 'a.enc');
    await encryptTo(f, Buffer.from('COPY public.genres (id) FROM stdin;\n1\n\\.\n'));
    expect(readFileSync(f).subarray(0, 6).toString()).toBe('ARPBK1');
    expect(await decrypt(f)).toContain('COPY public.genres');
  });

  it('refuses a tampered backup or the wrong key', async () => {
    const f = join(dir, 'b.enc');
    await encryptTo(f, Buffer.from('secret rows'));
    await expect(decrypt(f, backupKey(Buffer.alloc(32, 8).toString('base64')))).rejects.toThrow();
    const bytes = readFileSync(f);
    bytes[20] ^= 1;
    writeFileSync(f, bytes);
    await expect(decrypt(f)).rejects.toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => backupKey(Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });

  it('counts the rows of each table in a dump', () => {
    const sql = [
      'SET statement_timeout = 0;',
      'COPY auth.users (id, email) FROM stdin;',
      'a\ta@x',
      'b\tb@x',
      '\\.',
      'COPY public."credit_ledger" (id) FROM stdin;',
      '\\.',
      "SELECT pg_catalog.setval('public.credit_ledger_id_seq', 1, false);",
    ].join('\n');
    expect(copyCounts(sql)).toEqual({ 'auth.users': 2, 'public.credit_ledger': 0 });
  });

  it('keeps 30 days', () => {
    const now = Date.parse('2026-12-31T03:00:00Z');
    const objs = [31, 30.5, 29, 1].map((d) => ({
      key: `k${d}`,
      lastModified: new Date(now - d * 86_400_000),
    }));
    expect(expired(objs, now).map((o) => o.key)).toEqual(['k31', 'k30.5']);
    expect(objectKey(new Date('2026-12-01T02:07:09Z'))).toBe('db/2026-12-01T0207Z.sql.gz.enc');
  });
});

describe('unmatched.mjs', () => {
  it('exports CSV that a spreadsheet will not run as a formula', () => {
    const csv = toCsv([
      {
        id: 1,
        provider: 'revenuecat',
        event_id: 'e1',
        product_id: '=HYPERLINK("x")',
        app_user_id: 'u,1',
        received_at: 't',
      },
    ]);
    expect(csv.split('\n')[1]).toBe('1,revenuecat,e1,"\'=HYPERLINK(""x"")","u,1",t,,');
  });
});
