#!/usr/bin/env node
// Render prototype screens to PNG references for exact replication.
// Usage:
//   node tools/shot.mjs s-book s-unlock               -> .shots/app/sunflower/s-book.png ...
//   node tools/shot.mjs --theme palm s-book           themes: sunflower palm plum night
//   node tools/shot.mjs --admin books book-preview    -> .shots/admin/books.png
//   add --full to capture the whole scrolling screen (tall image)
// Needs Google Chrome (or set CHROME=/path/to/chrome).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const admin = args.includes('--admin');
const ti = args.indexOf('--theme');
const theme = ti !== -1 ? args[ti + 1] : 'sunflower';
const full = args.includes('--full'); // whole scrolling screen, not just the first phone viewport
const ids = args.filter((a, i) => !a.startsWith('--') && !(ti !== -1 && i === ti + 1));

const chrome = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(existsSync);
if (!chrome) { console.error('Chrome not found; set CHROME=path'); process.exit(1); }

const page = readFileSync(join(root, admin ? 'admin/index.html' : 'prototype/index.html'), 'utf8');
const outDir = resolve(root, '.shots', admin ? 'admin' : join('app', theme));
mkdirSync(outDir, { recursive: true });

for (const raw of ids) {
  const id = raw.replace(/^s-/, '');
  // wrapper: same page, theme set, animations finished, screen opened by hash
  const tall = full ? '.device,.device .screen,.device .body,.phone,.screen-wrap{height:auto!important;max-height:none!important;overflow:visible!important}.tabbar{position:static!important}' : '';
  const html = `<!doctype html><meta charset=utf8><style>body{margin:0}[hidden]{display:none!important}${tall}</style>${page}
<script>setTimeout(()=>{const d=document.querySelector('.device');if(d&&'${admin ? '' : theme}')d.dataset.theme='${theme}';
location.hash='${id}';setTimeout(()=>{document.getAnimations().forEach(a=>{try{a.finish()}catch(e){}})},400)},200)</script>`;
  const tmp = join(outDir, `_${id}.html`);
  writeFileSync(tmp, html);
  const png = join(outDir, `s-${id}.png`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${admin ? '1440,' + (full ? 2400 : 900) : '1200,' + (full ? 3200 : 900)}`, '--virtual-time-budget=3000',
    `--screenshot=${png}`, pathToFileURL(tmp).href], { stdio: 'ignore' });
  console.log(png);
}
