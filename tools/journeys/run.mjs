#!/usr/bin/env node
// Flow 17 whole-app check (rules 10 and 11): run Maestro journeys on the release build with a fresh
// `pnpm db:reset` before each journey and width. A journey is a list of steps: Maestro files, and node
// helpers for the staff parts (tools/journeys/staff.mjs calls the same RPCs as the staff user).
// After each journey the money check (tools/journeys/money-check.mjs) must pass.
//   node tools/journeys/run.mjs reader [community …] [--widths 375,320] [--serial emulator-5554]
//   node tools/journeys/run.mjs --existing 03-unlock [--widths 375]   (any flow's own Maestro file)
//   node tools/journeys/run.mjs all
// Needs: local Supabase, `pnpm dev:workers`, the release app built after `node tools/dev-vars.mjs --phone`,
// and `adb reverse` for 55321, 8787 and 8788. Screenshots: .shots/journeys/<journey>/<width>/.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, utimesSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const maestroDir = join(root, 'apps/mobile/.maestro');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const serial = opt('--serial', process.env.ANDROID_SERIAL ?? 'emulator-5554');
const widths = opt('--widths', '375,320').split(',');
const existing = args.includes('--existing');
const names = args.filter((a) => !a.startsWith('--'));

const m = (file) => ({ maestro: file });
const staff = (...a) => ({ node: ['tools/journeys/staff.mjs', ...a] });
export const JOURNEYS = {
  reader: [m('17-reader.yaml')],
  payg: [m('17-payg.yaml'), staff('check-undo', 'ngozi@example.com')],
  community: [m('17-community.yaml'), staff('check-report', 'ngozi@example.com')],
  author: [
    m('17-author-apply.yaml'),
    staff('approve-author', 'tobi@example.com'),
    m('17-author-upload.yaml'),
    staff('publish-book', 'tobi@example.com'),
    m('17-author-sale.yaml'),
    m('17-author-earnings.yaml'),
  ],
  account: [m('17-account.yaml'), staff('check-deleted', 'ngozi@example.com')],
};

const locks = join(homedir(), 'projects/arpedia-locks');
function heartbeat() {
  const now = new Date();
  for (const l of ['db.lock', `dev-${serial}.lock`]) {
    if (existsSync(join(locks, l))) utimesSync(join(locks, l), now, now);
  }
}

function sh(cmd, argv) {
  heartbeat();
  console.log(`\n▶ ${cmd} ${argv.join(' ')}`);
  execFileSync(cmd, argv, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  heartbeat();
}

function runJourney(name, steps) {
  let ok = true;
  for (const w of widths) {
    console.log(`\n══ ${name} at ${w}dp ══`);
    sh('pnpm', ['db:reset']);
    // Seal the seed books into the api Worker's local R2 (the reader needs real chapter files).
    sh('node', ['tools/seed-reader-files.mjs']);
    try {
      for (const step of steps) {
        if (step.maestro) {
          const out = join(root, '.shots/journeys', name, w);
          mkdirSync(out, { recursive: true });
          sh('node', [
            'tools/maestro-widths.mjs',
            join(maestroDir, step.maestro),
            w,
            '--serial',
            serial,
            `--test-output-dir=${out}`,
          ]);
        } else {
          sh('node', step.node);
        }
      }
      if (!existing) sh('node', ['tools/journeys/money-check.mjs']);
      console.log(`✓ ${name} at ${w}dp`);
    } catch {
      ok = false;
      console.error(`✗ ${name} at ${w}dp`);
    }
  }
  return ok;
}

if (!names.length) {
  console.error('usage: node tools/journeys/run.mjs <journey|all> … | --existing <flow> …');
  process.exit(1);
}
execSync(`adb -s ${serial} shell input keyevent KEYCODE_WAKEUP`);
// The release app talks to 127.0.0.1 (dev-vars --phone); a restarted emulator forgets the reverses.
for (const port of [55321, 8787, 8788]) execSync(`adb -s ${serial} reverse tcp:${port} tcp:${port}`);
const list = existing
  ? names.map((n) => [n, [m(n.endsWith('.yaml') ? n : `${n}.yaml`)]])
  : (names[0] === 'all' ? Object.keys(JOURNEYS) : names).map((n) => {
      if (!JOURNEYS[n]) throw new Error(`Unknown journey ${n}`);
      return [n, JOURNEYS[n]];
    });
const failed = list.filter(([n, steps]) => !runJourney(n, steps)).map(([n]) => n);
console.log(failed.length ? `\nFailed: ${failed.join(', ')}` : '\nAll passed');
process.exit(failed.length ? 1 : 0);
