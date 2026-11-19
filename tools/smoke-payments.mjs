#!/usr/bin/env node
// Smoke test the payment webhooks against the local stack (flow 09):
// RevenueCat auth → TEST ignored → top-up grants → the same event again changes nothing →
// initial plan purchase grants plan credits → a store refund claws the top-up back →
// Flutterwave answers 503 without its secrets.
//   node tools/smoke-payments.mjs   (needs `pnpm db:start`, `pnpm db:reset` and `pnpm dev:vars`)
// Starts the api Worker in-process with a local-only webhook secret and stops it at the end.
// Flutterwave charges are not exercised here: the Worker re-queries Flutterwave's API (pgTAP covers
// the apply step in 09_webhooks_test.sql).
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unstable_startWorker } from 'wrangler';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = join(root, 'workers/api/wrangler.jsonc');

const out = execSync('pnpm -s exec supabase status -o env', {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const sb = Object.fromEntries(
  out
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!sb.API_URL) {
  console.error('Local Supabase is not running. Start it with `pnpm db:start`.');
  process.exit(1);
}

const SECRET = 'smoke-local-webhook-secret';
const persist = mkdtempSync(join(tmpdir(), 'arpedia-smoke-payments-'));
let worker;
const done = async (code) => {
  await worker?.dispose().catch(() => {});
  rmSync(persist, { recursive: true, force: true });
  process.exit(code);
};
const fail = async (msg) => {
  console.error('FAIL', msg);
  await done(1);
};
const ok = (msg) => console.log('ok ', msg);

// Musa (seeded reader with no subscription and no credits).
const USER = '00000000-0000-4000-a000-000000000006';

const balance = async () => {
  const res = await fetch(`${sb.API_URL}/rest/v1/credit_balances?user_id=eq.${USER}&select=plan,topup`, {
    headers: { apikey: sb.SERVICE_ROLE_KEY, Authorization: `Bearer ${sb.SERVICE_ROLE_KEY}` },
  });
  const [row] = await res.json();
  return row ?? { plan: 0, topup: 0 };
};

let api;
const hook = async (path, body, headers = { Authorization: SECRET }) => {
  const res = await fetch(`${api}/v1/payments/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const now = Date.now();
const rc = (type, extra = {}) => ({
  event: {
    id: `smoke-${type}-${now}`,
    type,
    app_user_id: USER,
    store: 'PLAY_STORE',
    currency: 'NGN',
    takehome_percentage: 0.85,
    event_timestamp_ms: now,
    purchased_at_ms: now,
    ...extra,
  },
});

worker = await unstable_startWorker({
  config,
  bindings: { REVENUECAT_WEBHOOK_AUTH: { type: 'plain_text', value: SECRET } },
  dev: { server: { hostname: '127.0.0.1', port: 0 }, inspector: false, watch: false, persist },
});
api = (await worker.url).origin;
ok(`api Worker on ${api}`);

const before = await balance();

const noAuth = await hook('revenuecat', rc('TEST'), { Authorization: 'wrong' });
if (noAuth.status !== 401) await fail(`wrong secret answered ${noAuth.status}`);
const test = await hook('revenuecat', rc('TEST'));
if (test.status !== 200 || !test.json?.ignored) await fail(`TEST event ${JSON.stringify(test)}`);
ok('RevenueCat: wrong secret 401, TEST event ignored');

const topup = rc('NON_RENEWING_PURCHASE', {
  product_id: 'arpedia_topup_200',
  transaction_id: `GPA.smoke-topup-${now}`,
  price_in_purchased_currency: 600,
});
const first = await hook('revenuecat', topup);
if (first.status !== 200 || first.json?.duplicate) await fail(`top-up ${JSON.stringify(first)}`);
const afterTopup = await balance();
if (afterTopup.topup !== before.topup + 200)
  await fail(`top-up bucket ${before.topup} → ${afterTopup.topup}`);
const again = await hook('revenuecat', topup);
if (again.status !== 200 || !again.json?.duplicate) await fail(`replay ${JSON.stringify(again)}`);
if ((await balance()).topup !== afterTopup.topup) await fail('replayed top-up granted twice');
ok(`top-up: +200 credits (${first.json.outcome}); replay is a duplicate and grants nothing`);

const initial = await hook(
  'revenuecat',
  rc('INITIAL_PURCHASE', {
    product_id: 'arpedia_monthly',
    transaction_id: `GPA.smoke-plan-${now}`,
    price_in_purchased_currency: 900,
    expiration_at_ms: now + 30 * 86400_000,
  }),
);
if (initial.status !== 200) await fail(`initial purchase ${JSON.stringify(initial)}`);
const afterPlan = await balance();
if (afterPlan.plan !== before.plan + 300) await fail(`plan bucket ${before.plan} → ${afterPlan.plan}`);
ok(`plan: monthly bought, +300 plan credits (${initial.json.outcome})`);

const refund = await hook(
  'revenuecat',
  rc('CANCELLATION', {
    id: `smoke-refund-${now}`,
    cancel_reason: 'CUSTOMER_SUPPORT',
    product_id: 'arpedia_topup_200',
    transaction_id: `GPA.smoke-topup-${now}`,
    price_in_purchased_currency: 600,
  }),
);
if (refund.status !== 200) await fail(`refund ${JSON.stringify(refund)}`);
const afterRefund = await balance();
if (afterRefund.topup !== before.topup) await fail(`refund left top-up at ${afterRefund.topup}`);
ok(`store refund: unspent top-up clawed back (${refund.json.outcome})`);

const flw = await hook('flutterwave', { event: 'charge.completed', data: { id: 1 } }, { 'verif-hash': 'x' });
if (flw.status !== 503) await fail(`Flutterwave without secrets answered ${flw.status}`);
ok('Flutterwave: 503 until its secrets are set');

console.log('PASS smoke-payments');
await done(0);
