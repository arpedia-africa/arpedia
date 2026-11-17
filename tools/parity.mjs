#!/usr/bin/env node
// Pixel gate: compare built screens with their prototype references. Fails (exit 1) when more than
// --max percent (default 2) of pixels differ in any theme.
//
// App (Android, owner's phone c1212d5c at 375 dp, or --serial):
//   node tools/parity.mjs kit-a kit-b [--themes sunflower,palm] [--serial <id>] [--max 2]
//   - reference: tools/parity/<id>.html (prototype elements, verbatim) rendered with the prototype's CSS
//     inside a 375-wide .device at the phone's pixel density, then scaled to 375 px wide
//   - build: the app's parity screen (arpedia://parity?page=<id>&theme=<theme>, kit builds only),
//     captured with adb screencap below the status bar, scaled to 375 px wide, at text size 1.0
//     (the device's own text size is restored afterwards)
// Admin (Chrome headless, 1440×900, local console on --url, default http://127.0.0.1:3000):
//   node tools/parity.mjs --admin signin overview
//   - signin: whole page (fields filled with the prototype's values)
//   - overview: the shell (sidebar and top bar); the page body holds real data, compared by eye
// Output: .shots/parity/<id>-<theme>.png = reference | build | diff (red = differing pixels)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
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
const max = Number(opt('max', '2'));
const themes = opt('themes', admin ? 'light' : 'sunflower,palm,plum,night').split(',');
const serial = opt('serial', process.env.ANDROID_SERIAL || 'c1212d5c');
const baseUrl = opt('url', 'http://127.0.0.1:3000');
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

async function appReference(b, id, theme, dpr) {
  const frag = readFileSync(join(root, 'tools/parity', `${id}.html`), 'utf8');
  await b.open(standards('prototype/index.html'), { width: 375, height: 1400, dpr });
  const height = await b.eval(`(async()=>{
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
    return Math.ceil(d.getBoundingClientRect().height);
  })()`);
  const png = await b.shot({ x: 0, y: 0, width: 375, height });
  return { png, height };
}

async function appBuild(id, theme, g, height) {
  adb('logcat', '-c');
  adb(
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `arpedia://parity?page=${id}\\&theme=${theme}`,
    'com.arpedia.reader',
  );
  let top = null;
  for (let i = 0; i < 40 && top === null; i++) {
    await sleep(250);
    const log = adb('logcat', '-d', '-s', 'ReactNativeJS:I').toString();
    const m = [...log.matchAll(/PARITY_READY page=(\S+) theme=(\S+) top=(\d+)/g)]
      .filter((x) => x[1] === id && x[2] === theme)
      .pop();
    if (m) top = Number(m[3]);
  }
  if (top === null)
    throw new Error(`parity screen did not report ready (is a kit build installed on ${serial}?)`);
  await sleep(900); // arrive animations
  const raw = adb('exec-out', 'screencap', '-p');
  const h = Math.min(Math.round(height * g.dpr), g.heightPx - top);
  return sharp(raw).extract({ left: 0, top, width: g.widthPx, height: h }).png().toBuffer();
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
const b = await browser();
// The gate is at the default font size. If the device has a different text size (the owner's phone
// is at 0.9), set 1.0 for the captures and always put the owner's value back.
let fontScale = null;
try {
  if (!admin) {
    fontScale = adb('shell', 'settings', 'get', 'system', 'font_scale').toString().trim();
    if (fontScale === 'null' || Number(fontScale) === 1) fontScale = null;
    else {
      adb('shell', 'settings', 'put', 'system', 'font_scale', '1.0');
      adb('shell', 'am', 'force-stop', 'com.arpedia.reader');
    }
    const g = phone();
    if (Math.abs(g.dp - 375) > 1) console.warn(`warning: ${serial} is ${g.dp.toFixed(1)} dp wide, not 375`);
    for (const id of ids)
      for (const theme of themes) {
        const ref = await appReference(b, id, theme, g.dpr);
        const build = await appBuild(id, theme, g, ref.height);
        const buildH = (await sharp(build).metadata()).height;
        const height = Math.min(ref.height, Math.floor(buildH / g.dpr));
        const refCrop = await sharp(ref.png)
          .extract({ left: 0, top: 0, width: Math.round(375 * g.dpr), height: Math.round(height * g.dpr) })
          .toBuffer();
        results.push({
          name: `${id}-${theme}`,
          ...(await compare(`${id}-${theme}`, refCrop, build, 375, height)),
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
    const cookies = async (email) => {
      const { execSync } = await import('node:child_process');
      const st = execSync('pnpm -s exec supabase status -o env', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const env = Object.fromEntries(
        st
          .split(/\r?\n/)
          .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
          .filter(Boolean)
          .map((m) => [m[1], m[2]]),
      );
      const s = await fetch(`${env.API_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'arpedia-local' }),
      }).then((r) => r.json());
      if (!s.access_token) throw new Error(`sign-in failed for ${email}`);
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
    };
    for (const id of ids) {
      const p = pages[id];
      if (!p) throw new Error(`no admin parity page "${id}" (have: ${Object.keys(pages).join(', ')})`);
      const ref = await adminRef(id);
      await b.open(baseUrl + p.path, { width: W, height: H, cookies: p.as ? await cookies(p.as) : [] });
      await b.eval(`(async()=>{${p.fill ?? ''};await ${SETTLE};return true})()`);
      const build = await b.shot();
      results.push({ name: `admin-${id}`, ...(await compare(`admin-${id}`, ref, build, W, H, p.regions)) });
    }
  }
} finally {
  if (fontScale) adb('shell', 'settings', 'put', 'system', 'font_scale', fontScale);
  b.close();
}

let failed = false;
for (const r of results) {
  const ok = r.pct <= max;
  failed ||= !ok;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${r.name.padEnd(22)} ${r.pct.toFixed(2)}% differ  ${r.file}`);
}
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ max, results }, null, 2));
process.exit(failed ? 1 : 0);
