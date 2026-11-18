#!/usr/bin/env node
// Run a command against a live admin console (and, with --api, the api Worker) in the
// foreground, then stop them.
//   node tools/with-admin.mjs node tools/smoke-admin.mjs
//   node tools/with-admin.mjs --api node tools/smoke-team.mjs
//   node tools/with-admin.mjs node tools/parity.mjs --admin signin signin-2fa
// Starts `next dev` on :3000 and `wrangler dev` on :8787 unless something already answers there,
// waits until they respond, runs the command, and kills the process trees it started.
import { spawn, spawnSync } from 'node:child_process';

let args = process.argv.slice(2);
const withApi = args[0] === '--api';
if (withApi) args = args.slice(1);
if (!args.length) {
  console.error('usage: node tools/with-admin.mjs [--api] <command> [args…]');
  process.exit(2);
}

const servers = [
  { name: 'admin', probe: 'http://127.0.0.1:3000/sign-in', pkg: '@arpedia/admin' },
  ...(withApi ? [{ name: 'api', probe: 'http://127.0.0.1:8787/health', pkg: '@arpedia/api' }] : []),
];

const up = async (probe) => {
  try {
    return (await fetch(probe, { redirect: 'manual' })).status === 200;
  } catch {
    return false;
  }
};

const started = [];
function stop() {
  for (const p of started) {
    if (!p.pid) continue;
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-p.pid, 'SIGTERM');
  }
}

for (const s of servers) {
  if (await up(s.probe)) continue;
  started.push(spawn('pnpm', ['--filter', s.pkg, 'dev'], { stdio: 'ignore', shell: true }));
  const until = Date.now() + 180_000;
  while (!(await up(s.probe))) {
    if (Date.now() > until) {
      stop();
      console.error(`${s.name} did not start within 3 minutes`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const run = spawnSync(args[0], args.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' });
stop();
process.exit(run.status ?? 1);
