#!/usr/bin/env node
// Smoke test the chat Worker end to end with two seeded readers in Grace Readers: live delivery,
// idempotent retry, persistence to Postgres, a reaction, a refused socket and a delete.
//   node tools/smoke-chat.mjs [chatUrl]   (default http://127.0.0.1:8788, local Supabase on 55321)
//   node tools/smoke-chat.mjs --spawn     starts `wrangler dev` for the run and stops it after
// Changes local data (adds a message, a reaction, a report): local stack only.
import { execSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { openSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spawnIt = process.argv.includes('--spawn');
const chat = process.argv.slice(2).find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:8788';
const GRACE = '00000000-0000-4000-d000-000000000001';
const DM = '00000000-0000-4000-d000-000000000006';

let url = process.env.SUPABASE_URL;
let anon = process.env.SUPABASE_ANON_KEY;
if (!url || !anon) {
  const out = execSync('pnpm -s exec supabase status -o env', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
  url ??= env.API_URL;
  anon ??= env.ANON_KEY;
}

let worker;
const stop = () => {
  if (!worker) return;
  if (process.platform === 'win32') execSync(`taskkill /pid ${worker.pid} /T /F`, { stdio: 'ignore' });
  else worker.kill('SIGTERM');
  worker = undefined;
};
const fail = (msg) => {
  console.error('FAIL', msg);
  stop();
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (spawnIt) {
  // --log=<path> keeps the Worker's output for debugging.
  const logArg = process.argv.find((a) => a.startsWith('--log='))?.slice(6);
  const log = logArg ? openSync(logArg, 'w') : 'ignore';
  worker = spawn('pnpm --filter @arpedia/chat exec wrangler dev --port 8788 --ip 127.0.0.1', {
    cwd: root,
    shell: true,
    stdio: ['ignore', log, log],
  });
  for (let i = 0; ; i++) {
    if (i > 60) fail('wrangler dev did not start in 60 s');
    if (
      await fetch(`${chat}/health`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      break;
    await sleep(1000);
  }
}

const signIn = async (email) => {
  const t = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'arpedia-local' }),
  }).then((r) => r.json());
  if (!t.access_token) fail(`sign-in ${email}: ${t.error_description ?? t.msg}`);
  return t;
};

function open(group, token) {
  const ws = new WebSocket(`${chat.replace(/^http/, 'ws')}/c/${group}?token=${token}`);
  const frames = [];
  const s = { ws, frames, closed: null };
  ws.addEventListener('message', (e) => frames.push(JSON.parse(e.data)));
  ws.addEventListener('close', (e) => (s.closed = e.code));
  return s;
}
async function waitFor(s, pred, what, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const f = s.frames.find(pred);
    if (f) return f;
    await sleep(50);
  }
  fail(`timed out waiting for ${what}; got ${JSON.stringify(s.frames)}`);
}

try {
  const health = await fetch(`${chat}/health`).then((r) => r.json());
  if (!health.ok) fail('/health');
  console.log('ok  /health', health.env);

  const ngozi = await signIn('ngozi@example.com');
  const chioma = await signIn('chioma@example.com');

  const a = open(GRACE, ngozi.access_token);
  const b = open(GRACE, chioma.access_token);
  await waitFor(a, (f) => f.type === 'hello', 'hello (ngozi)');
  await waitFor(b, (f) => f.type === 'hello', 'hello (chioma)');
  await waitFor(a, (f) => f.type === 'presence' && f.reading_now >= 2, 'reading now 2');
  console.log('ok  both members connected, reading now 2');

  const client_id = randomUUID();
  const body = `Smoke ${new Date().toISOString()}`;
  const t0 = Date.now();
  a.ws.send(JSON.stringify({ type: 'send', client_id, body }));
  const ack = await waitFor(a, (f) => f.type === 'ack' && f.client_id === client_id, 'ack');
  const got = await waitFor(b, (f) => f.type === 'message' && f.message.id === ack.id, 'delivery to chioma');
  console.log(`ok  delivered to the other member in ${Date.now() - t0} ms`, got.message.sender_name);

  a.ws.send(JSON.stringify({ type: 'send', client_id, body }));
  await sleep(500);
  if (a.frames.filter((f) => f.type === 'ack' && f.client_id === client_id).length !== 2)
    fail('retry not re-acked');
  if (b.frames.filter((f) => f.type === 'message' && f.client_id === client_id).length !== 1)
    fail('retry delivered twice');
  console.log('ok  retry with the same client_id re-acked, not delivered twice');

  await sleep(2000);
  const hist = await fetch(`${url}/rest/v1/rpc/get_messages`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${chioma.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_group: GRACE, p_limit: 10 }),
  }).then((r) => r.json());
  if (hist.filter((m) => m.body === body).length !== 1)
    fail(`history: ${JSON.stringify(hist).slice(0, 300)}`);
  console.log('ok  persisted once to Postgres');

  const act = (token, payload) =>
    fetch(`${chat}/c/${GRACE}/actions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const react = await act(chioma.access_token, { type: 'react', message_id: ack.id, emoji: '❤️' });
  if (react.status !== 200) fail(`react ${JSON.stringify(react)}`);
  await waitFor(
    a,
    (f) => f.type === 'reactions' && f.message_id === ack.id && f.reactions['❤️'] === 1,
    'reaction relay',
  );
  console.log('ok  reaction relayed live');

  const dm = open(DM, chioma.access_token);
  for (let i = 0; i < 100 && dm.closed === null; i++) await sleep(50);
  if (dm.closed !== 4403) fail(`non-member socket closed with ${dm.closed}`);
  console.log('ok  non-member socket refused with 4403');

  const del = await act(ngozi.access_token, { type: 'delete', message_id: ack.id });
  if (del.status !== 200) fail(`delete ${JSON.stringify(del)}`);
  await waitFor(
    b,
    (f) => f.type === 'state' && f.message_id === ack.id && f.state === 'deleted',
    'delete relay',
  );
  const notMine = await act(chioma.access_token, { type: 'delete', message_id: ack.id });
  if (notMine.status !== 400) fail(`deleting someone else's message returned ${notMine.status}`);
  console.log("ok  delete relayed; nobody deletes someone else's message");

  a.ws.close();
  b.ws.close();
  console.log('PASS chat smoke');
} finally {
  stop();
}
