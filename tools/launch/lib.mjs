// Shared helpers for the flow 17 launch tools (setup, preflight, unmatched, backup).
// Every tool takes --target local|staging|production and reads its connection from the
// environment, never from a file in the repo:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   REST + RPC (service role)
//   SUPABASE_DB_URL                           Postgres URL (migrations, backups)
//   API_URL                                   the api Worker's public origin
// The owner exports these for staging or production; builders only use local and staging.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TARGETS = ['local', 'staging', 'production'];
/** The repo's Supabase CLI, run with `node` so it works the same on Windows and Linux. */
export const SUPABASE_CLI = join(ROOT, 'node_modules', 'supabase', 'dist', 'supabase.js');

/** `--flag value`, `--flag=value` and bare `--flag` (true). */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split(/=(.*)/s, 2);
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

export function targetFrom(args) {
  const t = args.target;
  if (!TARGETS.includes(t)) throw new Error(`--target must be one of ${TARGETS.join(', ')}`);
  return t;
}

export function requireEnv(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new Error(`Missing environment: ${missing.join(', ')}`);
  return Object.fromEntries(names.map((n) => [n, env[n]]));
}

/** Migration versions in the repo (the timestamp before the first underscore). */
export function repoMigrations(dir = join(ROOT, 'supabase', 'migrations')) {
  return readdirSync(dir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .map((f) => f.slice(0, 14))
    .sort();
}

/** JSON with comments (wrangler.jsonc): drops // and /* *\/ comments outside strings, and trailing commas. */
export function parseJsonc(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i === 0) break;
    } else out += ch;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export function wranglerConfig(worker) {
  return parseJsonc(readFileSync(join(ROOT, 'workers', worker, 'wrangler.jsonc'), 'utf8'));
}

/** A minimal PostgREST client for the service role (no SDK, so the tools run anywhere Node runs). */
export function restClient(url, serviceKey, fetchImpl = fetch) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  const call = async (path, init = {}) => {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`${path}: ${res.status} ${body?.message ?? text}`);
      err.status = res.status;
      err.code = body?.code;
      throw err;
    }
    return body;
  };
  return {
    rpc: (fn, args = {}) => call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
    select: (table, query = 'select=*') => call(`/rest/v1/${table}?${query}`),
    /** Every auth user whose email matches `test` (paged through the admin API). */
    async authUsers(test) {
      const found = [];
      for (let page = 1; ; page++) {
        const body = await call(`/auth/v1/admin/users?page=${page}&per_page=1000`);
        const users = body?.users ?? [];
        found.push(...users.filter((u) => test(u.email ?? '')));
        if (users.length < 1000) return found;
      }
    },
  };
}

export const isSeedEmail = (email) => /@(example\.com|test\.local)$/i.test(email);

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const MARK = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };

/** Print checks as aligned rows; returns true when nothing failed. */
export function report(items, log = console.log) {
  const w = Math.max(...items.map((i) => i.key.length), 4);
  for (const i of items)
    log(`${MARK[i.status] ?? i.status.toUpperCase()}  ${i.key.padEnd(w)}  ${i.detail ?? ''}`);
  const fails = items.filter((i) => i.status === 'fail').length;
  const warns = items.filter((i) => i.status === 'warn').length;
  log(
    `\n${fails ? `${fails} failed` : 'All required checks pass'}${warns ? `, ${warns} warning${warns > 1 ? 's' : ''}` : ''}.`,
  );
  return fails === 0;
}

/** Run `main` when the file is executed directly (not when a test imports it). */
export function runIfMain(metaUrl, main) {
  if (process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).then(
      (code) => process.exit(code ?? 0),
      (e) => {
        console.error(e.message ?? e);
        process.exit(1);
      },
    );
  }
}
