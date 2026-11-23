#!/usr/bin/env node
// Flow 17 rule 7 · pass or fail for everything a launch needs, before each rollout step.
//   node tools/launch/preflight.mjs --target staging|production --bundle path/to/app-release.aab
//        [--live-target 50]
// Exits 1 when any check fails (warnings don't). Prints names only, never a secret's value.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, API_URL; CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
// (Worker secrets, R2); R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (backups);
// SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECTS (comma list); POSTHOG_HOST, POSTHOG_PROJECT_ID,
// POSTHOG_PERSONAL_API_KEY.
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import {
  parseArgs,
  repoMigrations,
  report,
  requireEnv,
  restClient,
  runIfMain,
  targetFrom,
  wranglerConfig,
} from './lib.mjs';
import { BACKUP_MAX_AGE_HOURS, newest } from './backup.mjs';
import { backupBucket, r2FromEnv } from './r2.mjs';

/** Worker settings that must exist as a secret or a var on staging and production (names only). */
export const REQUIRED_SETTINGS = {
  api: [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
    'BOOK_MASTER_KEY',
    'UPLOAD_SIGNING_KEY',
    'PAYOUT_ACCOUNT_KEY',
    'RESEND_API_KEY',
    'RESEND_WEBHOOK_SECRET',
    'REVENUECAT_WEBHOOK_AUTH',
    'REVENUECAT_API_KEY',
    'FLUTTERWAVE_SECRET_KEY',
    'FLUTTERWAVE_WEBHOOK_HASH',
    'ADMIN_URL',
    'PUBLIC_API_URL',
    'PUSH_MODE',
  ],
  chat: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'],
};

/** Strings that only a local or staging build contains. */
export const NON_RELEASE_MARKERS = [
  'arpedia-staging',
  'api-staging.',
  '10.0.2.2',
  '127.0.0.1:556',
  '127.0.0.1:553',
  ':8787',
  ':8788',
];

const DB_KEYS = [
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

async function guard(key, fn) {
  try {
    return await fn();
  } catch (e) {
    return { key, status: 'fail', detail: e.message ?? String(e) };
  }
}

/** Read an .aab or .apk: its JS bundle as text and the list of entries. */
export function readReleaseBundle(bytes) {
  const files = unzipSync(bytes, {
    filter: (f) =>
      /(^|\/)assets\/index\.android\.bundle$|(^|\/)res\/xml\/|(^|\/)resources\.(arsc|pb)$/.test(f.name),
  });
  const bundle = Object.entries(files).find(([n]) => n.endsWith('index.android.bundle'));
  if (!bundle) throw new Error('no index.android.bundle in this file');
  // An APK shortens resource file names; the resource table (arsc, or pb in an .aab) keeps them.
  const table = Object.entries(files).find(([n]) => /resources\.(arsc|pb)$/.test(n));
  return {
    entries: Object.keys(files),
    text: Buffer.from(bundle[1]).toString('latin1'),
    resources: table ? Buffer.from(table[1]).toString('latin1') : '',
  };
}

/** Kit builds (EXPO_PUBLIC_KIT=1) carry the kit_network security config (plugins/kit-localhost.js). */
export const isKitBuild = (bundle) =>
  bundle.entries.some((e) => e.endsWith('res/xml/kit_network.xml')) ||
  (bundle.resources ?? '').includes('kit_network');

/**
 * All checks. Each dependency may throw; that check then fails with the message.
 *   db                 restClient-like (rpc)
 *   fetch              for the api Worker
 *   settingNames(w)    names of a Worker's secrets and vars on the target
 *   r2Public(bucket)   { managed: boolean, custom: number }
 *   backups()          [{ key, lastModified }] in the backup bucket
 *   sentryEvents()     events received in the last 24 hours
 *   posthogEvents()    events received in the last 24 hours
 *   bundle             readReleaseBundle() result, or null when --bundle wasn't given
 */
export async function runPreflight({
  target,
  liveTarget = 50,
  db,
  apiUrl,
  fetchImpl = fetch,
  settingNames,
  buckets,
  r2Public,
  backups,
  sentryEvents,
  posthogEvents,
  bundle,
  versions = repoMigrations(),
  now = Date.now(),
}) {
  const items = [];

  // Database (launch_check).
  const check = await db.rpc('launch_check', { p_live_target: liveTarget }).catch((e) => e);
  if (check instanceof Error) {
    items.push({ key: 'database', status: 'fail', detail: `launch_check: ${check.message}` });
  } else {
    const applied = new Set(check.find((i) => i.key === 'migrations')?.versions ?? []);
    const missing = versions.filter((v) => !applied.has(v));
    items.push({
      key: 'migrations',
      status: missing.length ? 'fail' : 'pass',
      detail: missing.length
        ? `${missing.length} not applied: ${missing.join(', ')}`
        : `all ${versions.length} applied`,
    });
    for (const key of DB_KEYS) {
      const c = check.find((i) => i.key === key);
      items.push(
        c
          ? { key, status: c.status, detail: c.detail }
          : { key, status: 'fail', detail: 'missing from launch_check' },
      );
    }
  }

  // Worker settings, names only.
  for (const [worker, required] of Object.entries(REQUIRED_SETTINGS)) {
    items.push(
      await guard(`${worker}_worker_settings`, async () => {
        const have = new Set(await settingNames(worker));
        const missing = required.filter((n) => !have.has(n));
        return {
          key: `${worker}_worker_settings`,
          status: missing.length ? 'fail' : 'pass',
          detail: missing.length ? `missing: ${missing.join(', ')}` : `${required.length} present`,
        };
      }),
    );
  }

  // Webhooks: reachable, and a bad signature is refused.
  const api = apiUrl?.replace(/\/$/, '');
  items.push(
    await guard('api_health', async () => {
      const r = await fetchImpl(`${api}/health`);
      const body = await r.json().catch(() => ({}));
      const okEnv = body.env === target;
      return {
        key: 'api_health',
        status: r.ok && okEnv ? 'pass' : 'fail',
        detail: r.ok ? (okEnv ? 'up' : `answers as ${body.env}, not ${target}`) : `HTTP ${r.status}`,
      };
    }),
  );
  for (const [key, path, header] of [
    ['webhook_revenuecat', '/v1/payments/revenuecat', 'Authorization'],
    ['webhook_flutterwave', '/v1/payments/flutterwave', 'verif-hash'],
  ]) {
    items.push(
      await guard(key, async () => {
        const r = await fetchImpl(`${api}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [header]: 'preflight-bad-signature' },
          body: JSON.stringify({ event: { id: 'preflight', type: 'TEST' } }),
        });
        return {
          key,
          status: r.status === 401 ? 'pass' : 'fail',
          detail: r.status === 401 ? 'reachable, rejects a bad signature' : `expected 401, got ${r.status}`,
        };
      }),
    );
  }

  // R2 buckets private (no r2.dev URL, no custom domain).
  for (const bucket of buckets) {
    items.push(
      await guard(`r2_private:${bucket}`, async () => {
        const p = await r2Public(bucket);
        const open = p.managed || p.custom > 0;
        return {
          key: `r2_private:${bucket}`,
          status: open ? 'fail' : 'pass',
          detail: open
            ? `public${p.managed ? ' (r2.dev on)' : ''}${p.custom ? ` (${p.custom} custom domains)` : ''}`
            : 'private',
        };
      }),
    );
  }

  // Backups (rule 8): one in the last BACKUP_MAX_AGE_HOURS.
  items.push(
    await guard('backups', async () => {
      const list = (await backups()).filter((o) => o.key.endsWith('.enc'));
      const latest = newest(list);
      const age = latest ? (now - latest.lastModified.getTime()) / 3_600_000 : Infinity;
      return {
        key: 'backups',
        status: age <= BACKUP_MAX_AGE_HOURS ? 'pass' : 'fail',
        detail: latest ? `latest ${latest.key}, ${Math.round(age)} h old, ${list.length} kept` : 'none found',
      };
    }),
  );

  // Monitoring receives events.
  for (const [key, fn] of [
    ['sentry', sentryEvents],
    ['posthog', posthogEvents],
  ]) {
    items.push(
      await guard(key, async () => {
        const n = await fn();
        return { key, status: n > 0 ? 'pass' : 'fail', detail: `${n} events in 24 hours` };
      }),
    );
  }

  // The release build.
  if (!bundle) {
    items.push({ key: 'release_build', status: 'fail', detail: 'pass --bundle <app-release.aab>' });
  } else {
    const found = NON_RELEASE_MARKERS.filter((m) => bundle.text.includes(m));
    items.push({
      key: 'release_endpoints',
      status: found.length ? 'fail' : 'pass',
      detail: found.length
        ? `local or staging endpoints in the bundle: ${found.join(', ')}`
        : 'no staging or local endpoints',
    });
    const kit = isKitBuild(bundle);
    items.push({
      key: 'expo_public_kit',
      status: kit ? 'fail' : 'pass',
      detail: kit ? 'built with EXPO_PUBLIC_KIT=1 (kit gallery and cleartext localhost)' : 'off',
    });
  }

  return items;
}

// ─── Real dependencies ──────────────────────────────────────────────────────
const cf = (env) => async (path) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}${path}`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.success)
    throw new Error(`Cloudflare ${path}: ${r.status} ${body.errors?.[0]?.message ?? ''}`);
  return body.result;
};

function workerName(worker, target) {
  const cfg = wranglerConfig(worker);
  return {
    name: cfg.env?.[target]?.name ?? cfg.name,
    vars: Object.keys({ ...cfg.vars, ...cfg.env?.[target]?.vars }),
  };
}

async function main(argv) {
  const args = parseArgs(argv);
  const target = targetFrom(args);
  const env = requireEnv(process.env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'API_URL']);
  const e = process.env;
  const api = cf(e);
  const need = (names) => requireEnv(e, names);
  const books = wranglerConfig('api').env?.[target]?.r2_buckets?.map((b) => b.bucket_name) ?? [
    'arpedia-books-local',
  ];

  const items = await runPreflight({
    target,
    liveTarget: Number(args['live-target'] ?? 50),
    db: restClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    apiUrl: env.API_URL,
    async settingNames(worker) {
      need(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
      const { name, vars } = workerName(worker, target);
      const secrets = await api(`/workers/scripts/${name}/secrets`);
      return [...vars, ...secrets.map((s) => s.name)];
    },
    buckets: [...books, backupBucket(target)],
    async r2Public(bucket) {
      need(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
      const managed = await api(`/r2/buckets/${bucket}/domains/managed`);
      const custom = await api(`/r2/buckets/${bucket}/domains/custom`);
      return { managed: Boolean(managed?.enabled), custom: custom?.domains?.length ?? 0 };
    },
    async backups() {
      need(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);
      return r2FromEnv(e).list(backupBucket(target), 'db/');
    },
    async sentryEvents() {
      need(['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECTS']);
      let n = 0;
      for (const p of e.SENTRY_PROJECTS.split(',').map((s) => s.trim())) {
        const r = await fetch(
          `https://sentry.io/api/0/organizations/${e.SENTRY_ORG}/stats_v2/?field=sum(quantity)&statsPeriod=24h&outcome=accepted&project=${encodeURIComponent(p)}&groupBy=category`,
          { headers: { Authorization: `Bearer ${e.SENTRY_AUTH_TOKEN}` } },
        );
        if (!r.ok) throw new Error(`Sentry ${p}: ${r.status}`);
        const body = await r.json();
        n += (body.groups ?? []).reduce((s, g) => s + (g.totals?.['sum(quantity)'] ?? 0), 0);
      }
      return n;
    },
    async posthogEvents() {
      need(['POSTHOG_HOST', 'POSTHOG_PROJECT_ID', 'POSTHOG_PERSONAL_API_KEY']);
      const r = await fetch(
        `${e.POSTHOG_HOST.replace(/\/$/, '')}/api/projects/${e.POSTHOG_PROJECT_ID}/query/`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${e.POSTHOG_PERSONAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: {
              kind: 'HogQLQuery',
              query: 'select count() from events where timestamp > now() - interval 1 day',
            },
          }),
        },
      );
      if (!r.ok) throw new Error(`PostHog: ${r.status}`);
      return Number((await r.json()).results?.[0]?.[0] ?? 0);
    },
    bundle: typeof args.bundle === 'string' ? readReleaseBundle(readFileSync(args.bundle)) : null,
  });

  console.log(`Preflight for ${target}\n`);
  return report(items) ? 0 : 1;
}

runIfMain(import.meta.url, main);
