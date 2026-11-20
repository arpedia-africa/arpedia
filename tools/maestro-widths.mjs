#!/usr/bin/env node
// Run a Maestro flow on the connected emulator at each check width (CLAUDE.md: 320, 360, 375dp)
// by changing the display density, then restore it. Screenshots land in the current directory.
//   node tools/maestro-widths.mjs apps/mobile/.maestro/00-kit.yaml [320,360,375]
//   Device: --serial or ANDROID_SERIAL. CLI: MAESTRO, else .shots/maestro/bin (unzipped release), else `maestro` on PATH.
//   Other --flags pass through to `maestro test`. MIUI (owner's phone): install the driver once (its
//   "Install via USB" prompt needs a tap), allow it to start activities from the background
//   (`appops set dev.mobile.maestro 10021 allow`, else launchApp silently opens nothing), then run
//   with --no-reinstall-driver so Maestro keeps that driver.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const si = args.indexOf('--serial');
const serial = si >= 0 ? args.splice(si, 2)[1] : process.env.ANDROID_SERIAL;
// Other --flags go to `maestro test` (e.g. --no-reinstall-driver on MIUI, see the header).
const extra = args.filter((a) => a.startsWith('--')).join(' ');
const [flow, widthArg] = args.filter((a) => !a.startsWith('--'));
const widths = (widthArg ?? '375,360,320').split(',').map(Number);
if (!flow) {
  console.error('usage: node tools/maestro-widths.mjs <flow.yaml> [widths] [--serial <serial>]');
  process.exit(1);
}
const local = resolve('.shots/maestro/bin', process.platform === 'win32' ? 'maestro.bat' : 'maestro');
const maestro = process.env.MAESTRO ?? (existsSync(local) ? `"${local}"` : 'maestro');
const adb = (cmd) =>
  execSync(`adb ${serial ? `-s ${serial} ` : ''}shell ${cmd}`, { encoding: 'utf8' }).trim();
const px = Number(adb('wm size').match(/(\d+)x\d+/)?.[1]);
if (!px) throw new Error('Could not read the emulator screen size');
// Restore the device's own setting afterwards (the owner's phone keeps an override, 461 = 375dp).
const saved = adb('wm density').match(/Override density: (\d+)/)?.[1];
// Both the release app and the dev build (com.arpedia.reader.dev) handle arpedia:// links, so an
// openLink step would stop on Android's "Open with" chooser. Disable the dev build while Maestro runs.
const DEV = 'com.arpedia.reader.dev';
const hasDev = adb(`pm list packages ${DEV}`).split(/\s+/).includes(`package:${DEV}`);
if (hasDev) adb(`pm disable-user --user 0 ${DEV}`);

let failed = false;
try {
  for (const w of widths) {
    const dpi = Math.round((px * 160) / w);
    adb(`wm density ${dpi}`);
    console.log(`\n▶ ${w}dp (density ${dpi})`);
    try {
      execSync(`${maestro} ${serial ? `--device ${serial} ` : ''}test ${extra} ${flow} -e WIDTH=${w}`, {
        stdio: 'inherit',
      });
    } catch {
      failed = true;
      console.error(`✗ ${flow} failed at ${w}dp`);
    }
  }
} finally {
  adb(saved ? `wm density ${saved}` : 'wm density reset');
  if (hasDev) adb(`pm enable --user 0 ${DEV}`);
}
process.exit(failed ? 1 : 0);
