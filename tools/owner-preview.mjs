#!/usr/bin/env node
// Owner preview on a real phone: the release app talks to this PC's local stack over adb reverse.
//   node --env-file=<env with SUPABASE_WORKDIR/API_PORT> tools/owner-preview.mjs --serial c1212d5c
// Before: the stack is running, `node tools/dev-vars.mjs --phone` wrote 127.0.0.1 URLs and the
// release APK was built with them. This reverses the Supabase API and api Worker ports, starts the
// api Worker detached (it keeps running after the builder's run ends; log in .shots/api-worker.log)
// unless something already listens on its port, and opens the app.
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { connect } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const serial = argv.includes('--serial') ? argv[argv.indexOf('--serial') + 1] : process.env.ANDROID_SERIAL;
if (!serial) throw new Error('pass --serial');
const apiPort = process.env.API_PORT ?? '8787';
const status = execSync('pnpm -s exec supabase status -o env', {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const supaUrl = status.match(/^API_URL="?([^"\r\n]+)"?/m)?.[1];
if (!supaUrl) throw new Error('Local Supabase is not running');
const supaPort = new URL(supaUrl).port;

const listening = (port) =>
  new Promise((done) => {
    const s = connect(Number(port), '127.0.0.1');
    s.once('connect', () => (s.destroy(), done(true)));
    s.once('error', () => done(false));
  });

const adb = (args) => execSync(`adb -s ${serial} ${args}`, { encoding: 'utf8' }).trim();
for (const p of [supaPort, apiPort]) adb(`reverse tcp:${p} tcp:${p}`);
console.log(`adb reverse: Supabase ${supaPort}, api Worker ${apiPort}`);

if (await listening(apiPort)) {
  console.log(`api Worker port ${apiPort} already in use; left as is`);
} else {
  mkdirSync(join(root, '.shots'), { recursive: true });
  const log = openSync(join(root, '.shots/api-worker.log'), 'a');
  const child = spawn('pnpm', ['--filter', '@arpedia/api', 'exec', 'wrangler', 'dev', '--port', apiPort], {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
    shell: true,
    windowsHide: true,
  });
  child.unref();
  for (let i = 0; i < 60 && !(await listening(apiPort)); i++) await new Promise((r) => setTimeout(r, 1000));
  if (!(await listening(apiPort))) throw new Error('api Worker did not start; see .shots/api-worker.log');
  console.log(`api Worker started on ${apiPort} (detached)`);
}
const health = await fetch(`http://127.0.0.1:${apiPort}/health`).then(
  (r) => r.status,
  () => 'unreachable',
);
console.log(`api /health: ${health}`);
adb('shell monkey -p com.arpedia.reader -c android.intent.category.LAUNCHER 1');
console.log('App opened');
