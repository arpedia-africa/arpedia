#!/usr/bin/env node
// App launcher icon and splash image from the real logo in assets/brand (DESIGN.md "Logo": don't redraw).
// Replaces the Expo template art the app shipped with (found by the flow 17 whole-app check).
//   icon.png                     1024 px tile (store listing, legacy launchers)
//   android-icon-foreground.png  1024 px canvas, the rounded tile (mark.png) inside the adaptive-icon
//                                safe zone; the launcher's own mask and the white background frame it
//   android-icon-background.png  plain white
//   splash-icon.png              mark.png, drawn at imageWidth on the orange splash (app.json)
//   node tools/gen-app-icons.mjs   (then prebuild: the icons are copied into android/ at prebuild)
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(join(root, 'apps/mobile/package.json'))('sharp');
const brand = (f) => join(root, 'assets/brand', f);
const out = (f) => join(root, 'apps/mobile/assets', f);
const SIZE = 1024;
// Adaptive icons show the middle 66% of the canvas for sure; keep the tile just inside it.
const TILE = Math.round(SIZE * 0.62);

await sharp(brand('icon.png')).resize(SIZE, SIZE, { kernel: 'lanczos3' }).png().toFile(out('icon.png'));
const tile = await sharp(brand('mark.png')).resize(TILE, TILE, { kernel: 'lanczos3' }).png().toBuffer();
const pad = Math.round((SIZE - TILE) / 2);
await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: tile, left: pad, top: pad }])
  .png()
  .toFile(out('android-icon-foreground.png'));
await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: '#FFFFFF' } })
  .png()
  .toFile(out('android-icon-background.png'));
await sharp(brand('mark.png')).resize(512, 512, { kernel: 'lanczos3' }).png().toFile(out('splash-icon.png'));
console.log('Wrote icon, adaptive foreground/background and splash icon from assets/brand');
