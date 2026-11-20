#!/usr/bin/env node
// Pixel gate: compare built screens with their prototype references. Fails (exit 1) when more than
// --max percent (default 2) of pixels differ in any theme.
//
// App (Android, owner's phone c1212d5c at 375 dp, or --serial):
//   node tools/parity.mjs kit-a kit-b [--dev] [--themes sunflower,palm] [--serial <id>] [--max 2] [--ref chrome] [--raw]
//   - reference: tools/parity/<id>.html (prototype elements, verbatim) with the prototype's CSS inside
//     a 375-wide .device. By default it is drawn on the same phone, in the dev build's WebView (or the
//     release kit build's when no dev build is installed)
//     (arpedia://parity?…&ref=<port>, page served from this PC over adb reverse), so reference and
//     build share Android's text rasteriser. --ref chrome draws it in desktop Chrome instead
//     (DirectWrite glyphs; differs from Android by ~2-3% on text-heavy pages).
//   - build: the app's parity screen (arpedia://parity?page=<id>&theme=<theme>, kit builds only) in the
//     release app com.arpedia.reader (the gate), or with --dev in com.arpedia.reader.dev on Metro (fast loop)
//   - both captured with adb screencap below the status bar, scaled to 375 px wide, at text size 1.0
//     (the device's own text size is restored afterwards).
// Admin (Chrome headless, 1440×900, local console on --url, default http://127.0.0.1:3000):
//   node tools/parity.mjs --admin signin overview
//   - signin: whole page (fields filled with the prototype's values)
//   - overview: the shell (sidebar and top bar); the page body holds real data, compared by eye
// Output: .shots/parity/<id>-<theme>.png = reference | build | diff (red = differing pixels)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? def : argv.splice(i, 2)[1];
};
const admin = argv.includes('--admin');
const dev = argv.includes('--dev');
const keepRaw = argv.includes('--raw'); // also save the full-resolution captures (<name>-ref/-build.png in raw/)
const refOn = opt('ref', 'phone');
const RELEASE_PACKAGE = 'com.arpedia.reader';
const DEV_PACKAGE = 'com.arpedia.reader.dev';
const buildPackage = dev ? DEV_PACKAGE : RELEASE_PACKAGE;
const max = Number(opt('max', '2'));
const themes = opt('themes', admin ? 'light' : 'sunflower,palm,plum,night').split(',');
const serial = opt('serial', process.env.ANDROID_SERIAL || 'c1212d5c');
const baseUrl = opt('url', process.env.ADMIN_URL ?? 'http://127.0.0.1:3000');
const ids = argv.filter((a) => !a.startsWith('--'));
const outDir = resolve(root, '.shots/parity');
mkdirSync(outDir, { recursive: true });

const chrome =
  process.env.CHROME ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);
if (!chrome) throw new Error('Chrome not found; set CHROME=path');
// The prototype files have no doctype; published (and in shot.mjs) they render in standards mode.
const standards = (file) => {
  const out = join(outDir, `_${file.split('/')[0]}.html`);
  writeFileSync(out, `<!doctype html><meta charset=utf-8>${readFileSync(join(root, file), 'utf8')}`);
  return pathToFileURL(out).href;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal Chrome DevTools session (no extra packages). */
async function browser() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${resolve(root, '.shots/.chrome-parity')}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((r) => r.json())
      .then((l) => l.find((t) => t.type === 'page'))
      .catch(() => null);
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let n = 0;
  const pending = new Map();
  let loaded = false;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method === 'Page.loadEventFired') loaded = true;
  });
  const send = (method, params = {}) =>
    new Promise((res) => {
      const id = ++n;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Page.enable');
  return {
    send,
    async open(url, { width, height, dpr = 1, cookies = [] }) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: dpr,
        mobile: false,
      });
      for (const [name, value] of cookies) await send('Network.setCookie', { name, value, url });
      loaded = false;
      await send('Page.navigate', { url });
      for (let i = 0; i < 150 && !loaded; i++) await sleep(100);
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result?.result?.value;
    },
    async shot(clip) {
      const r = await send('Page.captureScreenshot', {
        format: 'png',
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      });
      return Buffer.from(r.result.data, 'base64');
    },
    close() {
      ws.close();
      proc.kill();
    },
  };
}

// Settle: fonts loaded, one-off animations finished, endless drifts parked at 0 (same in both captures).
const SETTLE = `(async()=>{await document.fonts.ready;await new Promise(r=>setTimeout(r,300));
for(const a of document.getAnimations()){const t=a.effect&&a.effect.getTiming();
if(t&&t.iterations===Infinity){a.pause();a.currentTime=0}else{try{a.finish()}catch(e){}}}
await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()`;

const adb = (...a) => execFileSync('adb', ['-s', serial, ...a], { maxBuffer: 64 << 20 });

/** Phone geometry: pixels per dp, from the screen width (the parity device is 375 dp wide). */
function phone() {
  const size = adb('shell', 'wm', 'size').toString();
  const density = adb('shell', 'wm', 'density').toString();
  const px = (size.match(/Override size: (\d+)x(\d+)/) || size.match(/Physical size: (\d+)x(\d+)/))
    .slice(1)
    .map(Number);
  const dpi = Number(
    (density.match(/Override density: (\d+)/) || density.match(/Physical density: (\d+)/))[1],
  );
  const dp = px[0] / (dpi / 160);
  return { widthPx: px[0], heightPx: px[1], dpr: dpi / 160, dp };
}

/** JS expression: hide the prototype, mount tools/parity/<id>.html in a 375-wide .device, settle, return its height. */
function referenceScript(id, theme) {
  const frag = readFileSync(join(root, 'tools/parity', `${id}.html`), 'utf8');
  return `(async()=>{
    for (const el of [...document.body.children]) if (el.tagName !== 'svg' && el.tagName !== 'SCRIPT') el.style.display = 'none';
    const st = document.createElement('style');
    st.textContent = '.pk{display:flex;flex-direction:column;gap:12px;padding:16px}.pk-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.pk-dev .hero{margin-top:0;padding-top:0}';
    document.head.appendChild(st);
    const d = document.createElement('div');
    d.className = 'device pk-dev';
    d.dataset.theme = ${JSON.stringify(theme)};
    d.style.cssText = 'position:absolute;left:0;top:0;width:375px;height:auto;border-radius:0;box-shadow:none;overflow:visible';
    d.innerHTML = '<div class="screen" style="position:relative;inset:auto;padding-top:0">' + ${JSON.stringify(frag)} + '</div>';
    document.body.appendChild(d);
    await ${SETTLE};
    return d.getBoundingClientRect().height; // exact: crops end at the last device px of the screen, not the page behind it
  })()`;
}

async function chromeReference(b, id, theme, dpr) {
  await b.open(standards('prototype/index.html'), { width: 375, height: 1400, dpr });
  const height = await b.eval(referenceScript(id, theme));
  const png = await b.shot({ x: 0, y: 0, width: 375, height: Math.ceil(height) });
  return { png, height };
}

/**
 * Serves the reference page to the dev build's WebView: GET /ref?page=&theme= is the prototype
 * (standards mode, phone viewport) that mounts the parity fragment and posts "ready:<height>".
 * Files under prototype/ are served for relative assets.
 */
async function referenceServer() {
  const proto = readFileSync(join(root, 'prototype/index.html'), 'utf8');
  const protoDir = resolve(root, 'prototype');
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/ref') {
      const id = url.searchParams.get('page');
      if (!existsSync(join(root, 'tools/parity', `${id}.html`))) return res.writeHead(404).end();
      const script = `addEventListener('load',()=>${referenceScript(id, url.searchParams.get('theme'))}.then(h=>window.ReactNativeWebView.postMessage('ready:'+h)))`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(
        `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><base href="/prototype/">${proto}<script>${script}</script>`,
      );
    }
    const file = resolve(protoDir, '.' + decodeURIComponent(url.pathname.replace(/^\/prototype/, '')));
    if (!file.startsWith(protoDir + sep) || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200).end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  adb('reverse', `tcp:${port}`, `tcp:${port}`);
  return {
    port,
    close() {
      try {
        adb('reverse', '--remove', `tcp:${port}`);
      } catch {}
      server.close();
    },
  };
}

/**
 * A cold-started dev build opens its launcher, not Metro, so a deep link alone shows nothing. Point it
 * at Metro (adb reverse tcp:8081) once per run and wait for the bundle to run (first build can be slow).
 */
let devLoaded = false;
async function loadDevBundle() {
  if (devLoaded) return;
  // No dev menu, intro sheet or floating Tools button in captures (expo-dev-menu's own prefs; written
  // while the app is stopped, since it saves its in-memory copy on exit).
  adb('shell', 'am', 'force-stop', DEV_PACKAGE);
  const prefs =
    "<?xml version='1.0' encoding='utf-8' standalone='yes' ?><map><boolean name='isOnboardingFinished' value='true' />" +
    "<boolean name='showsAtLaunch' value='false' /><boolean name='showFab' value='false' /></map>";
  adb(
    'shell',
    `run-as ${DEV_PACKAGE} sh -c "echo \\"${prefs}\\" > shared_prefs/expo.modules.devmenu.sharedpreferences.xml"`,
  );
  adb('reverse', 'tcp:8081', 'tcp:8081');
  adb('logcat', '-c');
  const metro = encodeURIComponent('http://127.0.0.1:8081');
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `exp+arpedia://expo-development-client/?url=${metro}`,
    DEV_PACKAGE,
  );
  for (let i = 0; i < 360 && !devLoaded; i++) {
    await sleep(500);
    devLoaded = /Running "main"/.test(adb('logcat', '-d', '-s', 'ReactNativeJS:I').toString());
  }
  if (!devLoaded)
    throw new Error(`${DEV_PACKAGE} did not load the bundle from Metro (is Metro running on :8081?)`);
  await sleep(3000); // a deep link sent while the router mounts is dropped
}

/**
 * The owner may pick up the phone: never capture unless our app is in front and no heads-up
 * notification (someone's message) is showing over it. Checks every 30 s for up to 10 minutes, then
 * gives up (no screenshot of anything else is ever taken).
 */
async function waitForFocus(pkg) {
  for (let i = 0; i <= 20; i++) {
    const focus =
      adb('shell', 'dumpsys', 'window')
        .toString()
        .match(/mCurrentFocus=.*/)?.[0] ?? '';
    const ok = focus.includes(`${pkg}/`);
    const banner = ok && headsUp();
    if (ok && !banner) return;
    if (i === 20) break;
    console.warn(
      banner
        ? 'a notification is showing; waiting 30 s'
        : `${pkg} is not in front (${focus.trim()}); waiting 30 s`,
    );
    await sleep(30_000);
  }
  throw new Error(`${pkg} was not clear in front for 10 minutes; no capture taken`);
}

/** A heads-up notification is pinned over the screen (SystemUI's own state; only flags are read). */
function headsUp() {
  const n = adb(
    'shell',
    "dumpsys activity service com.android.systemui/.SystemUIService | grep -c 'isPinned()=true' || true",
  )
    .toString()
    .trim();
  return Number(n) > 0;
}

/** Open a parity page in an app, wait for its PARITY_READY line, capture below the status bar. */
async function capture(pkg, query, id, theme, kind, g, height) {
  if (pkg === DEV_PACKAGE) await loadDevBundle();
  adb('logcat', '-c');
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `arpedia://parity?page=${id}\\&theme=${theme}${query}`,
    pkg,
  );
  let m = null;
  for (let i = 0; i < 80 && !m; i++) {
    await sleep(250);
    const log = adb('logcat', '-d', '-s', 'ReactNativeJS:I').toString();
    m = [...log.matchAll(/PARITY_READY page=(\S+) theme=(\S+) kind=(\S+) top=(\d+)(?: h=(\d+(?:\.\d+)?))?/g)]
      .filter((x) => x[1] === id && x[2] === theme && x[3] === kind)
      .pop();
  }
  if (!m)
    throw new Error(
      `${pkg} parity ${kind} did not report ready (is a kit/dev build installed on ${serial}?)`,
    );
  const top = Number(m[4]);
  height ??= Number(m[5]);
  await sleep(900); // arrive animations
  let raw;
  for (let tries = 0; !raw; tries++) {
    await waitForFocus(pkg);
    raw = adb('exec-out', 'screencap', '-p');
    // A notification that arrived during the capture: throw the capture away.
    if (headsUp()) {
      raw = null;
      if (tries === 5) throw new Error('notifications kept arriving; no capture kept');
    }
  }
  const h = Math.min(Math.floor(height * g.dpr), g.heightPx - top);
  return {
    png: await sharp(raw).extract({ left: 0, top, width: g.widthPx, height: h }).png().toBuffer(),
    height,
  };
}

async function compare(name, refPng, buildPng, width, height, regions) {
  const norm = (png) =>
    sharp(png).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer();
  const [a, bb] = await Promise.all([norm(refPng), norm(buildPng)]);
  const diff = Buffer.alloc(width * height * 4);
  pixelmatch(a, bb, diff, width, height, { threshold: 0.1 });
  // Count differing (red) pixels inside the compared regions only.
  const areas = regions ?? [{ x: 0, y: 0, width, height }];
  let total = 0;
  let bad = 0;
  for (const r of areas)
    for (let y = r.y; y < r.y + r.height; y++)
      for (let x = r.x; x < r.x + r.width; x++) {
        total++;
        const i = (y * width + x) * 4;
        if (diff[i] === 255 && diff[i + 1] === 0 && diff[i + 2] === 0) bad++;
      }
  const pct = (100 * bad) / total;
  const raw = { raw: { width, height, channels: 4 } };
  const gap = 12;
  const file = join(outDir, `${name}.png`);
  await sharp({ create: { width: width * 3 + gap * 2, height, channels: 4, background: '#808080' } })
    .composite([
      { input: a, ...raw, left: 0, top: 0 },
      { input: bb, ...raw, left: width + gap, top: 0 },
      { input: diff, ...raw, left: (width + gap) * 2, top: 0 },
    ])
    .png()
    .toFile(file);
  return { pct, file };
}

const results = [];
const b = admin || refOn === 'chrome' ? await browser() : null;
const server = admin || refOn === 'chrome' ? null : await referenceServer();
// The gate is at the default font size. If the device has a different text size (the owner's phone
// is at 0.9), set 1.0 for the captures and always put the owner's value back.
let fontScale = null;
try {
  if (!admin) {
    fontScale = adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim();
    if (fontScale === 'null' || Number(fontScale) === 1) fontScale = null;
    else {
      adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
      for (const pkg of [RELEASE_PACKAGE, DEV_PACKAGE]) adb('shell', 'am', 'force-stop', pkg);
    }
    const g = phone();
    if (Math.abs(g.dp - 375) > 1) console.warn(`warning: ${serial} is ${g.dp.toFixed(1)} dp wide, not 375`);
    // Reference app: the dev build when installed, else the release kit build (kit builds may load
    // http from 127.0.0.1 only, apps/mobile/plugins/kit-localhost.js).
    const devInstalled = adb('shell', 'pm', 'list', 'packages', DEV_PACKAGE)
      .toString()
      .split(/\r?\n/)
      .some((l) => l.trim() === `package:${DEV_PACKAGE}`);
    const refPackage = dev || devInstalled ? DEV_PACKAGE : RELEASE_PACKAGE;
    for (const id of ids)
      for (const theme of themes) {
        const ref = server
          ? await capture(refPackage, `\\&ref=${server.port}`, id, theme, 'ref', g)
          : await chromeReference(b, id, theme, g.dpr);
        const build = await capture(buildPackage, '', id, theme, 'build', g, ref.height);
        const buildH = (await sharp(build.png).metadata()).height;
        const refH = (await sharp(ref.png).metadata()).height;
        const px = Math.min(buildH, refH);
        const crop = (png) =>
          sharp(png).extract({ left: 0, top: 0, width: g.widthPx, height: px }).toBuffer();
        if (keepRaw) {
          mkdirSync(join(outDir, 'raw'), { recursive: true });
          writeFileSync(join(outDir, 'raw', `${id}-${theme}-ref.png`), await crop(ref.png));
          writeFileSync(join(outDir, 'raw', `${id}-${theme}-build.png`), await crop(build.png));
        }
        results.push({
          name: `${id}-${theme}`,
          ...(await compare(
            `${id}-${theme}`,
            await crop(ref.png),
            await crop(build.png),
            375,
            Math.floor(px / g.dpr),
          )),
        });
      }
  } else {
    const W = 1440;
    const H = 900;
    const adminRef = async (id) => {
      await b.open(standards('admin/index.html') + `#${id}`, { width: W, height: H });
      await b.eval(
        `(async()=>{const st=document.createElement('style');st.textContent='[hidden]{display:none!important}:root{--pbar-h:0px}.pbar,.pidx,.pnotes,.fb-btn{display:none!important}';document.head.appendChild(st);location.hash=${JSON.stringify(id)};await new Promise(r=>setTimeout(r,400));await ${SETTLE};return true})()`,
      );
      return b.shot();
    };
    // Types into a React-controlled input (the native setter, then an input event).
    const typeInto = `((s,v)=>{const el=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))})`;
    // `as` signs in a seeded staff member with two-step; `aal1` stops after the password.
    const cookies = async (email, aal1 = false) => {
      const { localEnv, passwordSession, staffSession } = await import('./staff-session.mjs');
      const env = localEnv();
      const s = aal1 ? await passwordSession(env, email) : await staffSession(env, email);
      const name = `sb-${new URL(env.API_URL).hostname.split('.')[0]}-auth-token`;
      const value = 'base64-' + Buffer.from(JSON.stringify(s)).toString('base64url');
      return value.length <= 3180
        ? [[name, value]]
        : value.match(/.{1,3180}/g).map((p, i) => [`${name}.${i}`, p]);
    };
    const pages = {
      signin: {
        path: '/sign-in',
        fill: `document.getElementById('si-e').value='amaka@arpedia.africa';document.getElementById('si-p').value='password123';`,
      },
      overview: {
        path: '/',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 60 },
        ],
      },
      'signin-2fa': {
        path: '/sign-in/two-step',
        as: 'amaka@arpedia.africa',
        aal1: true,
        fill: `${typeInto}('input[name=code]','4812');document.querySelector('input[name=code]').focus();`,
      },
      'signin-reset': {
        path: '/sign-in/reset',
        // Wait for hydration first, or the click posts the form natively and navigates away.
        fill: `await new Promise(r=>setTimeout(r,1500));${typeInto}('#rs-e','amaka@arpedia.africa');document.querySelector('button[type=submit]').click();await new Promise(r=>setTimeout(r,1500));`,
      },
      // Page content only: the prototype draws a Moderator with the full sidebar, but flow 16
      // rule 11 hides links the role can't use (flow file wins).
      'no-access': {
        path: '/royalties',
        as: 'zainab@arpedia.africa',
        regions: [{ x: 248, y: 60, width: W - 248, height: H - 60 }],
      },
      team: { path: '/team', as: 'amaka@arpedia.africa' },
      'team-invite': {
        path: '/team?invite=1',
        as: 'amaka@arpedia.africa',
        fill: `${typeInto}('#iv-e','adaora@arpedia.africa');${typeInto}('#iv-n','Adaora Nnadi');await new Promise(r=>setTimeout(r,300));document.activeElement.blur();`,
      },
      roles: { path: '/roles', as: 'amaka@arpedia.africa' },
      // Flow 12. Shell, band, tabs, toolbar and table head; the rows hold real (seeded) data.
      books: {
        path: '/books',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 297 },
        ],
      },
      // Shell, band and tabs; the jobs and rows below hold seeded data.
      'book-processing': {
        path: '/books/processing',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 200 },
        ],
      },
      'books-sentback': {
        path: '/books/sent-back',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 200 },
        ],
      },
      // Shell and page header of the seeded Needs fixes book (Market Day in Onitsha).
      'book-formatter': {
        path: '/books/00000000-0000-4000-d100-000000000001/fix',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 150 },
        ],
      },
      // The Send back modal over Fix flagged issues; issue wording comes from the seeded flags.
      'book-changes': {
        path: '/books/00000000-0000-4000-d100-000000000001/changes',
        as: 'amaka@arpedia.africa',
        regions: [{ x: 0, y: 0, width: W, height: H }],
      },
      // Quick review of the seeded Ready for review book (Garden of Small Mercies): shell and page
      // header. Seeded books have no working copy, so the phone pages show their error state.
      'book-preview': {
        path: '/books/00000000-0000-4000-d100-000000000003/review',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 200 },
        ],
      },
      // The two modals over Quick review: shell, topbar and the whole modal box. The dimmed page
      // behind is Quick review itself (gated above), whose phone pages hold the book's own text.
      'book-sendback': {
        path: '/books/00000000-0000-4000-d100-000000000003/sendback',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 60 },
          { x: 444, y: 107, width: 800, height: 473 },
        ],
      },
      'book-approve': {
        path: '/books/00000000-0000-4000-d100-000000000003/approve',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 60 },
          { x: 544, y: 107, width: 600, height: 343 },
        ],
      },
      // Flow 03. Harmattan Letters' Details, Pricing and access and Stats tabs: shell, page header and
      // tabs are gated; the panels hold seeded data (no Discover shelves or history yet), compared by eye.
      book: {
        path: '/books/00000000-0000-4000-c000-000000000001',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 200 },
        ],
      },
      'book-access': {
        path: '/books/00000000-0000-4000-c000-000000000001/access',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 200 },
        ],
      },
      'book-stats': {
        path: '/books/00000000-0000-4000-c000-000000000001/stats',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 200 },
        ],
      },
      // Revisions of the seeded update (The Alignment r4): shell, page header, tabs and the revisions
      // table head. Rows, panels and the fast-lane list hold seeded data, compared by eye.
      'book-revisions': {
        path: '/books/00000000-0000-4000-d100-000000000099/revisions',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 200 },
        ],
      },
      // Unpublish over a live seeded book (Harmattan Letters), title typed as in the prototype. The
      // page behind is the book's Details tab in the prototype (flow 03), so only the modal box is gated.
      'book-unpublish': {
        path: '/books/00000000-0000-4000-c000-000000000001/unpublish',
        as: 'amaka@arpedia.africa',
        // Wait for hydration, then type through React's value setter so the "Matches" hint updates.
        fill: `const i=document.getElementById('unpublish-title');for(let k=0;k<50&&!Object.keys(i).some(x=>x.startsWith('__reactProps'));k++)await new Promise(r=>setTimeout(r,100));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'Harmattan Letters');i.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,300));`,
        regions: [{ x: 564, y: 135, width: 556, height: 711 }],
      },
      // Upload a book, searching "Ifeoma" with the first author picked, as in the prototype.
      'book-new': {
        path: '/books/new?q=Ifeoma',
        as: 'amaka@arpedia.africa',
        fill: `for(let k=0;k<50&&!document.querySelector('.tbl tbody tr');k++)await new Promise(r=>setTimeout(r,100));const tr=document.querySelector('.tbl tbody tr');for(let k=0;k<50&&!Object.keys(tr).some(x=>x.startsWith('__react'));k++)await new Promise(r=>setTimeout(r,100));tr.click();await new Promise(r=>setTimeout(r,300));`,
        regions: [{ x: 0, y: 0, width: W, height: H }],
      },
      // Flow 06: seeded channels (real names and counts differ from the prototype's sample data).
      community: { path: '/community', as: 'zainab@arpedia.africa' },
      channel: { path: '/community/00000000-0000-4000-d000-000000000002', as: 'zainab@arpedia.africa' },
      // Flow 09. Shell and page header are gated; tables and panels hold seeded data
      // (supabase/seeds/09_credits.sql), compared by eye.
      ...Object.fromEntries(
        [
          ['pricing', '/pricing'],
          ['pricing-rules', '/pricing-rules'],
          ['promos', '/promos'],
          ['credits', '/credits'],
          ['revenue', '/revenue'],
          ['transactions', '/transactions'],
          ['refunds', '/refunds'],
          ['subscriptions', '/subscriptions'],
          ['subscription', '/subscriptions/00000000-0000-4000-e920-000000000001'],
          ['user-credits', '/credits/00000000-0000-4000-a000-000000000001'],
        ].map(([id, path]) => [
          id,
          {
            path,
            as: 'amaka@arpedia.africa',
            regions: [
              { x: 0, y: 0, width: 248, height: H },
              { x: 248, y: 0, width: W - 248, height: 150 },
            ],
          },
        ]),
      ),
      // Modals: shell and topbar gated, the modal box compared by eye (its size follows real data).
      'plan-edit': {
        path: '/pricing/quarterly',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 60 },
        ],
      },
      'promo-new': {
        path: '/promos/new',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 60 },
        ],
      },
      'unlock-return': {
        path: '/credits/00000000-0000-4000-a000-000000000001/return/900001',
        as: 'amaka@arpedia.africa',
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 60 },
        ],
      },
      // Words per page typed as 275, then "Review and save" opens the confirm step.
      'pricing-rules-confirm': {
        path: '/pricing-rules',
        as: 'amaka@arpedia.africa',
        fill: `const i=document.getElementById('pr-w');for(let k=0;k<50&&!Object.keys(i).some(x=>x.startsWith('__reactProps'));k++)await new Promise(r=>setTimeout(r,100));${typeInto}('#pr-w','275');await new Promise(r=>setTimeout(r,300));[...document.querySelectorAll('.ph__acts .btn-p')][0].click();for(let k=0;k<50&&!document.querySelector('.modal');k++)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,300));`,
        regions: [
          { x: 0, y: 0, width: 248, height: H },
          { x: 248, y: 0, width: W - 248, height: 60 },
        ],
      },
      // Flow 13. Shell and page header gated; tables and panels hold the seeded months
      // (supabase/seeds/13_earnings.sql), compared by eye. Overlays gate the shell and top bar.
      ...Object.fromEntries(
        [
          ['royalties', '/royalties', 150],
          ['royalty-cycle', '/royalties/00000000-0000-4000-e130-000000000002', 150],
          ['royalty-settings', '/royalties/settings', 150],
          ['payouts', '/payouts', 150],
          ['bank-accounts', '/bank-accounts', 150],
          ['bank-account', '/bank-accounts/00000000-0000-4000-e131-000000000004', 150],
          ['author-payout', '/authors/00000000-0000-4000-a000-000000000002/payout', 150],
          ['royalty-release', '/royalties/00000000-0000-4000-e130-000000000002/release', 60],
          ['payout-retry', '/payouts/00000000-0000-4000-e132-000000000001/retry', 60],
        ].map(([id, path, head]) => [
          id,
          {
            path,
            as: 'amaka@arpedia.africa',
            regions: [
              { x: 0, y: 0, width: 248, height: H },
              { x: 248, y: 0, width: W - 248, height: head },
            ],
          },
        ]),
      ),
    };
    for (const id of ids) {
      const p = pages[id];
      if (!p) throw new Error(`no admin parity page "${id}" (have: ${Object.keys(pages).join(', ')})`);
      const ref = await adminRef(id);
      // PARITY_MEASURE=<selector> prints the matching elements' top, height, line height and font in
      // the reference and the build, to find where a layout drifts.
      const M = process.env.PARITY_MEASURE;
      const measure = `JSON.stringify([...document.querySelectorAll(${JSON.stringify(M)})].filter(e=>e.offsetParent).slice(0,60).map(e=>{const r=e.getBoundingClientRect();return e.tagName+'.'+e.className+' '+r.top.toFixed(2)+' '+r.height.toFixed(2)+' lh='+getComputedStyle(e).lineHeight+' ff='+getComputedStyle(e).fontFamily.slice(0,20)}))`;
      if (M) console.log('REF', await b.eval(measure));
      await b.open(baseUrl + p.path, {
        width: W,
        height: H,
        cookies: p.as ? await cookies(p.as, p.aal1) : [],
      });
      await b.eval(`(async()=>{${p.fill ?? ''};await ${SETTLE};return true})()`);
      if (M) console.log('BUILD', await b.eval(measure));
      const build = await b.shot();
      results.push({ name: `admin-${id}`, ...(await compare(`admin-${id}`, ref, build, W, H, p.regions)) });
    }
  }
} finally {
  if (fontScale) adb('shell', 'settings', 'put', 'system', 'font_scale', fontScale);
  b?.close();
  server?.close();
}

let failed = false;
for (const r of results) {
  const ok = r.pct <= max;
  failed ||= !ok;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${r.name.padEnd(22)} ${r.pct.toFixed(2)}% differ  ${r.file}`);
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ max, results }, null, 2));
process.exit(failed ? 1 : 0);
