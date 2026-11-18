#!/usr/bin/env node
// Smoke test the admin console's staff gate against the local stack.
//   node tools/smoke-admin.mjs [adminUrl]    (default http://127.0.0.1:3000)
// Signs in through Supabase as a seeded reader and seeded staff (two-step with the seeded TOTP
// secret), hands the session to the console as the @supabase/ssr cookie, and checks who gets what.
import { localEnv, passwordSession, staffSession } from './staff-session.mjs';

const admin = process.argv[2] ?? process.env.ADMIN_URL ?? 'http://127.0.0.1:3000';
const env = localEnv();
const url = env.API_URL;
const fail = (msg) => {
  console.error('FAIL', msg);
  process.exit(1);
};

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

r = await get('/', cookieFor(await passwordSession(env, 'ngozi@example.com')));
if (r.status === 200) fail('a reader (non-staff) got the console');
console.log(`ok  reader is refused (${r.status} → ${r.headers.get('location')})`);

r = await get('/', cookieFor(await passwordSession(env, 'amaka@arpedia.africa')));
if (r.status !== 307 || !r.headers.get('location')?.includes('/sign-in/two-step'))
  fail(`staff without two-step got ${r.status} ${r.headers.get('location')}`);
console.log('ok  staff without two-step is sent to /sign-in/two-step');

const amaka = cookieFor(await staffSession(env, 'amaka@arpedia.africa'));
r = await get('/', amaka);
let html = await r.text();
if (r.status !== 200 || !html.includes('Admin console') || !html.includes('Amaka Okafor'))
  fail(`staff got ${r.status}`);
console.log('ok  staff (Amaka, Super admin) with two-step gets the shell');

r = await get('/sign-in/two-step', amaka);
if (r.status !== 307) fail(`two-step page for a verified session returned ${r.status}`);
console.log('ok  two-step page skips once verified');

const tunde = cookieFor(await staffSession(env, 'tunde@arpedia.africa'));
r = await get('/curation', tunde);
html = await r.text();
if (r.status !== 200 || !html.includes('Discover curation')) fail(`section page returned ${r.status}`);
if (html.includes('href="/royalties"')) fail('Publisher sidebar shows Author earnings');
console.log('ok  Publisher opens Discover curation; money links are hidden');

r = await get('/royalties', tunde);
html = await r.text();
if (
  r.status !== 200 ||
  !html.includes('access to Author earnings') ||
  !html.includes('Your role is Publisher')
)
  fail(`forbidden page returned ${r.status} without s-no-access`);
console.log('ok  a pasted forbidden link shows s-no-access');
