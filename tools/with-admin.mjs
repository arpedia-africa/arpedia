#!/usr/bin/env node
// Runs a command while the admin console and the api Worker are up, then stops both. For headless
// runs, where background servers are not allowed: everything stays in one foreground command.
//   node tools/with-admin.mjs [--prod] [--port 3012] <command...>
//   node tools/with-admin.mjs --prod node tools/parity.mjs --admin books --url http://127.0.0.1:3012
// --prod serves the last `next build` (run it first; it settles faster than `next dev`).
import { execSync, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const prod = args[0] === '--prod' && args.shift();
const port = args[0] === '--port' ? (args.shift(), args.shift()) : '3012';
if (!args.length) {
  console.error('usage: node tools/with-admin.mjs [--prod] [--port 3012] <command...>');
  process.exit(2);
}

const kids = [];
const start = (cmd, cwd) => kids.push(spawn(cmd, { cwd, shell: true, stdio: 'ignore' }));
const stop = () => {
  for (const k of kids.splice(0)) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${k.pid} /T /F`, { stdio: 'ignore' });
      else process.kill(-k.pid);
    } catch {}
  }
};
const up = async (url, ms = 300_000) => {
  for (const t = Date.now(); Date.now() - t < ms; await new Promise((r) => setTimeout(r, 1000))) {
    if (
      await fetch(url).then(
        () => true,
        () => false,
      )
    )
      return;
  }
  throw new Error(`not up after ${ms / 1000}s: ${url}`);
};
process.on('exit', stop);
process.on('SIGINT', () => process.exit(130));

try {
  start('npx wrangler dev --port 8787', resolve(root, 'workers/api'));
  start(`npx next ${prod ? 'start' : 'dev'} --port ${port}`, resolve(root, 'apps/admin'));
  await up('http://127.0.0.1:8787/');
  await up(`http://127.0.0.1:${port}/sign-in`);
  console.log(`admin on :${port} (${prod ? 'build' : 'dev'}), api Worker on :8787`);
  const code = await new Promise((r) =>
    spawn(args.join(' '), { cwd: root, shell: true, stdio: 'inherit' }).on('exit', r),
  );
  stop();
  process.exit(code ?? 1);
} catch (e) {
  console.error(e.message);
  stop();
  process.exit(1);
}
