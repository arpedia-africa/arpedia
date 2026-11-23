#!/usr/bin/env node
// Screenshot a running page (the built admin console) for side-by-side checks with tools/shot.mjs.
//   node tools/shot-url.mjs <url> <out.png> [width] [height] [--as <email>]
//   add --db2 for the second local stack.
// --as signs in a seeded local user (password arpedia-local) and sends the @supabase/ssr session
// cookie, so console pages can be captured. Uses Chrome's DevTools protocol (no extra packages).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { localEnv, passwordSession, staffSession } from './staff-session.mjs';

const args = process.argv.slice(2);
const ai = args.indexOf('--as');
const as = ai !== -1 ? args.splice(ai, 2)[1] : null;
// --workdir .shots/sb15: sign in on a private Supabase stack (see tools/staff-session.mjs).
const wi = args.indexOf('--workdir');
if (wi !== -1) process.env.SUPABASE_WORKDIR = args.splice(wi, 2)[1];
// --db2: sign in against the second local stack (tools/db2.mjs), as builders without the phone use.
const di = args.indexOf('--db2');
if (di !== -1) (args.splice(di, 1), (process.env.DB2 = '1'));
const [url, out, w = '1440', h = '900'] = args;
if (!url || !out) {
  console.error('usage: node tools/shot-url.mjs <url> <out.png> [width] [height] [--as email]');
  process.exit(1);
}
const chrome =
  process.env.CHROME ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find(existsSync);
if (!chrome) {
  console.error('Chrome not found; set CHROME=path');
  process.exit(1);
}

// Staff (@arpedia.africa) also pass two-step with the seeded authenticator, as the console needs.
async function sessionCookies(email) {
  const env = localEnv();
  const s = email.endsWith('@arpedia.africa')
    ? await staffSession(env, email)
    : await passwordSession(env, email);
  const name = `sb-${new URL(env.API_URL).hostname.split('.')[0]}-auth-token`;
  const value = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url');
  return value.length <= 3180
    ? [[name, value]]
    : value.match(/.{1,3180}/g).map((p, i) => [`${name}.${i}`, p]);
}

const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${resolve('.shots/.chrome')}`,
    `--window-size=${w},${h}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await new Promise((r) => setTimeout(r, 200));
    target = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((r) => r.json())
      .then((l) => l.find((t) => t.type === 'page'))
      .catch(() => null);
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else events.push(m.method);
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const n = ++id;
      pending.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: +w,
    height: +h,
    deviceScaleFactor: 1,
    mobile: false,
  });
  if (as) {
    for (const [name, value] of await sessionCookies(as))
      await send('Network.setCookie', { name, value, url });
  }
  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++)
    await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 800)); // fonts and arrive animations
  const { result } = await send('Page.captureScreenshot', { format: 'png' });
  const file = resolve(out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(result.data, 'base64'));
  console.log(file);
  ws.close();
} finally {
  proc.kill();
}
