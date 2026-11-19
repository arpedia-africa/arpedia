#!/usr/bin/env node
// Run a command against a live admin console (and, with --api, the api Worker) in the
// foreground, then stop them.
//   node tools/with-admin.mjs node tools/smoke-admin.mjs
//   node tools/with-admin.mjs --api node tools/smoke-team.mjs
//   node tools/with-admin.mjs node tools/parity.mjs --admin signin signin-2fa
// Starts `next dev` on :3000 and `wrangler dev` on :8787 unless something already answers there,
// waits until they respond, runs the command, and kills the process trees it started.
// --prod serves the last `next build` with `next start` (stable for parity: no compile reloads).
// ADMIN_PORT / API_PORT move both (run `pnpm dev:vars` with the same values first); the command
// gets ADMIN_URL and API_URL in its environment.
import { spawn, spawnSync } from 'node:child_process';

let args = process.argv.slice(2);
const flags = new Set();
while (args[0] === '--api' || args[0] === '--prod') flags.add(args.shift());
const withApi = flags.has('--api');
if (!args.length) {
  console.error('usage: node tools/with-admin.mjs [--api] [--prod] <command> [args…]');
  process.exit(2);
}

const adminPort = process.env.ADMIN_PORT ?? '3000';
const apiPort = process.env.API_PORT ?? '8787';
process.env.ADMIN_URL = `http://127.0.0.1:${adminPort}`;
process.env.API_URL = `http://127.0.0.1:${apiPort}`;
process.env.ARPEDIA_API_URL = process.env.API_URL;
const servers = [
  {
    name: 'admin',
    probe: `${process.env.ADMIN_URL}/sign-in`,
    cmd: [
      '--filter',
      '@arpedia/admin',
      'exec',
      'next',
      flags.has('--prod') ? 'start' : 'dev',
      '--port',
      adminPort,
    ],
  },
  ...(withApi
    ? [
        {
          name: 'api',
          probe: `${process.env.API_URL}/health`,
          cmd: ['--filter', '@arpedia/api', 'exec', 'wrangler', 'dev', '--port', apiPort],
        },
      ]
    : []),
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
  started.push(spawn('pnpm', s.cmd, { stdio: 'ignore', shell: true }));
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
