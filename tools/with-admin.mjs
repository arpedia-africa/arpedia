#!/usr/bin/env node
// Run a command against a live admin console, in the foreground, then stop the console.
//   node tools/with-admin.mjs node tools/smoke-admin.mjs
//   node tools/with-admin.mjs node tools/parity.mjs --admin signin signin-2fa
// Starts `next dev` on :3000 (unless something already answers there), waits for /sign-in,
// runs the command, and kills the dev server's process tree whatever happens.
import { spawn, spawnSync } from 'node:child_process';

const base = 'http://127.0.0.1:3000';
const cmd = process.argv.slice(2);
if (!cmd.length) {
  console.error('usage: node tools/with-admin.mjs <command> [args…]');
  process.exit(2);
}

const up = async () => {
  try {
    return (await fetch(`${base}/sign-in`, { redirect: 'manual' })).status === 200;
  } catch {
    return false;
  }
};

let server;
if (!(await up())) {
  server = spawn('pnpm', ['--filter', '@arpedia/admin', 'dev'], { stdio: 'ignore', shell: true });
  const until = Date.now() + 180_000;
  while (!(await up())) {
    if (Date.now() > until) {
      stop();
      console.error('admin did not start within 3 minutes');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function stop() {
  if (!server?.pid) return;
  if (process.platform === 'win32')
    spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(-server.pid, 'SIGTERM');
}

const run = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' });
stop();
process.exit(run.status ?? 1);
