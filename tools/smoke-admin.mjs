#!/usr/bin/env node
// Smoke test the admin console's staff gate against the local stack.
//   node tools/smoke-admin.mjs [adminUrl]    (default http://127.0.0.1:3000)
// Signs in through Supabase as a seeded reader and a seeded staff member, hands the session to the
// console as the @supabase/ssr cookie, and checks who gets the shell.
import { execSync } from 'node:child_process';

const admin = process.argv[2] ?? 'http://127.0.0.1:3000';
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
const url = env.API_URL;
const fail = (msg) => {
  console.error('FAIL', msg);
  process.exit(1);
};

async function session(email) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'arpedia-local' }),
  });
  const s = await r.json();
  if (!s.access_token) fail(`sign-in failed for ${email}`);
  return s;
}

// @supabase/ssr cookie: sb-<first host label>-auth-token = "base64-" + base64url(JSON), chunked at 3180.
function cookieFor(s) {
  const name = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const value = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url');
  if (value.length <= 3180) return `${name}=${value}`;
  const parts = value.match(/.{1,3180}/g);
  return parts.map((p, i) => `${name}.${i}=${p}`).join('; ');
}

const get = (path, cookie) =>
  fetch(`${admin}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });

let r = await get('/sign-in');
if (r.status !== 200) fail(`/sign-in returned ${r.status}`);
console.log('ok  /sign-in renders');

r = await get('/');
if (r.status !== 307 || !r.headers.get('location')?.includes('/sign-in'))
  fail(`/ without session returned ${r.status}`);
console.log('ok  / without a session redirects to /sign-in');

r = await get('/', cookieFor(await session('ngozi@example.com')));
if (r.status === 200) fail('a reader (non-staff) got the console');
console.log(`ok  reader is refused (${r.status} → ${r.headers.get('location')})`);

r = await get('/', cookieFor(await session('amaka@arpedia.africa')));
const html = await r.text();
if (r.status !== 200 || !html.includes('Admin console') || !html.includes('Amaka Okafor'))
  fail(`staff got ${r.status}`);
console.log('ok  staff (Amaka, Super admin) gets the shell');

r = await get('/curation', cookieFor(await session('tunde@arpedia.africa')));
if (r.status !== 200 || !(await r.text()).includes('Discover curation'))
  fail(`section page returned ${r.status}`);
console.log('ok  section pages render for staff');
