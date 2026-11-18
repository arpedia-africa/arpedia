#!/usr/bin/env node
// Run a Maestro flow on the connected emulator at each check width (CLAUDE.md: 320, 360, 375dp)
// by changing the display density, then restore it. Screenshots land in the current directory.
//   node tools/maestro-widths.mjs apps/mobile/.maestro/00-kit.yaml [320,360,375]
import { execSync } from 'node:child_process';

const flow = process.argv[2];
const widths = (process.argv[3] ?? '375,360,320').split(',').map(Number);
if (!flow) {
  console.error('usage: node tools/maestro-widths.mjs <flow.yaml> [widths]');
  process.exit(1);
}
const adb = (cmd) => execSync(`adb shell ${cmd}`, { encoding: 'utf8' }).trim();
const px = Number(adb('wm size').match(/(\d+)x\d+/)?.[1]);
if (!px) throw new Error('Could not read the emulator screen size');

let failed = false;
try {
  for (const w of widths) {
    const dpi = Math.round((px * 160) / w);
    adb(`wm density ${dpi}`);
    console.log(`\n▶ ${w}dp (density ${dpi})`);
    try {
      execSync(`maestro test ${flow} -e WIDTH=${w}`, { stdio: 'inherit' });
    } catch {
      failed = true;
      console.error(`✗ ${flow} failed at ${w}dp`);
    }
  }
} finally {
  adb('wm density reset');
}
process.exit(failed ? 1 : 0);
