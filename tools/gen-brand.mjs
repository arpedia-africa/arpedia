#!/usr/bin/env node
// Extract the prototype's brand images (the same bytes the prototype draws) into packages/ui:
//   .wmk         wordmark for light surfaces      → packages/ui/src/brand/wordmark.png
//   .wmk--night  wordmark on the orange hero       → packages/ui/src/brand/wordmark-night.png
//   #i-appicon   app icon (the sprite's <image>)   → packages/ui/src/brand/appicon.png
//   node tools/gen-brand.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'prototype/src');
const src = readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .sort()
  .map((f) => readFileSync(join(dir, f), 'utf8'))
  .join('\n');
const pick = (re, what) => {
  const m = src.match(re);
  if (!m) throw new Error(`not found: ${what}`);
  return Buffer.from(m[1], 'base64');
};
const out = join(root, 'packages/ui/src/brand');
mkdirSync(out, { recursive: true });
const files = {
  'wordmark.png': pick(/\.wmk\{[^}]*?url\(data:image\/png;base64,([A-Za-z0-9+/=]+)\)/, '.wmk'),
  'wordmark-night.png': pick(
    /\.wmk--night\{[^}]*?url\(data:image\/png;base64,([A-Za-z0-9+/=]+)\)/,
    '.wmk--night',
  ),
  'appicon.png': pick(
    /<symbol id="i-appicon"[^>]*>\s*<image[^>]*href="data:image\/png;base64,([A-Za-z0-9+/=]+)"/,
    '#i-appicon',
  ),
};
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(out, name), buf);
  console.log(`wrote packages/ui/src/brand/${name} (${buf.length} bytes)`);
}
