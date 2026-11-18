#!/usr/bin/env node
// Smoke test the API Worker's health routes with a real seeded user.
//   node tools/smoke-api.mjs [apiUrl]   (default http://127.0.0.1:8787, local Supabase on 55321)
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SMOKE_EMAIL, SMOKE_PASSWORD override the local defaults.
import { execSync } from 'node:child_process';

const api = process.argv[2] ?? 'http://127.0.0.1:8787';
let url = process.env.SUPABASE_URL;
let anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon) {
  const out = execSync('pnpm -s exec supabase status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  url ??= env.API_URL;
  anon ??= env.ANON_KEY;
}
const email = process.env.SMOKE_EMAIL ?? 'ngozi@example.com';
const password = process.env.SMOKE_PASSWORD ?? 'arpedia-local';

const fail = (msg) => {
  console.error('FAIL', msg);
  process.exit(1);
};

const pub = await fetch(`${api}/health`).then((r) => r.json());
if (!pub.ok) fail(`/health ${JSON.stringify(pub)}`);
console.log('ok  /health', pub.env);

const noAuth = await fetch(`${api}/v1/health`);
if (noAuth.status !== 401) fail(`/v1/health without token returned ${noAuth.status}`);
console.log('ok  /v1/health rejects no token');

const bad = await fetch(`${api}/v1/health`, { headers: { Authorization: 'Bearer nope.nope.nope' } });
if (bad.status !== 401) fail(`/v1/health with a bad token returned ${bad.status}`);
console.log('ok  /v1/health rejects a bad token');

const tok = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());
if (!tok.access_token) fail(`sign-in failed: ${tok.error_description ?? tok.msg ?? 'unknown'}`);

const res = await fetch(`${api}/v1/health`, { headers: { Authorization: `Bearer ${tok.access_token}` } });
const body = await res.json();
if (res.status !== 200 || body.db !== 'ok' || body.user !== tok.user.id)
  fail(`/v1/health ${res.status} ${JSON.stringify(body)}`);
console.log('ok  /v1/health with a valid JWT', JSON.stringify(body));
