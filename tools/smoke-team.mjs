#!/usr/bin/env node
// Smoke test staff invites end to end against the local stack and api Worker (flow 16 pass 1).
//   node tools/with-admin.mjs --api node tools/smoke-team.mjs
// Amaka (Super admin, two-step) invites a new Support person; the link opens, the invite is
// accepted with a password, the new person signs in and still owes two-step setup; Amaka then
// disables and re-enables them. Leaves the new staff row behind (db:reset clears it).
import { localEnv, passwordSession, staffSession } from './staff-session.mjs';

const api = process.argv[2] ?? process.env.API_URL ?? 'http://127.0.0.1:8787';
const env = localEnv();
const fail = (msg) => {
  console.error('FAIL', msg);
  process.exit(1);
};
const rpc = async (s, fn, body = {}) => {
  const r = await fetch(`${env.API_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: env.ANON_KEY,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const email = `smoke.${Date.now()}@arpedia.africa`;
const amaka = await staffSession(env, 'amaka@arpedia.africa');

const aal1 = await passwordSession(env, 'amaka@arpedia.africa');
let r = await fetch(`${api}/v1/staff-invites`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${aal1.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, full_name: 'Smoke Test', role: 'support' }),
});
if (r.status !== 403) fail(`invite without two-step returned ${r.status}`);
console.log('ok  inviting needs two-step');

r = await fetch(`${api}/v1/staff-invites`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${amaka.access_token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, full_name: 'Smoke Test', role: 'support' }),
});
const sent = await r.json();
if (r.status !== 200 || !sent.link) fail(`invite returned ${r.status} ${JSON.stringify(sent)}`);
const token = sent.link.split('/invite/')[1];
console.log('ok  Super admin invites; local link returned');

r = await fetch(`${api}/v1/staff-invites/${token}`);
const inv = await r.json();
if (inv.state !== 'open' || inv.email !== email) fail(`invite lookup ${JSON.stringify(inv)}`);
console.log('ok  invite link opens');

r = await fetch(`${api}/v1/staff-invites/${token}/accept`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'short' }),
});
if (r.status !== 400) fail(`short password returned ${r.status}`);
r = await fetch(`${api}/v1/staff-invites/${token}/accept`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'a-long-staff-password' }),
});
if (r.status !== 200) fail(`accept returned ${r.status} ${await r.text()}`);
console.log('ok  accept needs 12+ characters, then creates the account');

r = await fetch(`${api}/v1/staff-invites/${token}/accept`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'a-long-staff-password' }),
});
if (r.status !== 410) fail(`second accept returned ${r.status}`);
console.log('ok  the link works once');

const fresh = await passwordSession(env, email, 'a-long-staff-password');
const ctx = (await rpc(fresh, 'get_staff_context')).body;
if (ctx?.role !== 'support' || ctx.mfa_enrolled || ctx.mfa_ok)
  fail(`new staff context ${JSON.stringify(ctx)}`);
if ((await rpc(fresh, 'has_permission', { p_permission: 'answer_support' })).body !== false)
  fail('new staff has permissions before two-step');
console.log('ok  new staff is Support, owes two-step setup, has no permissions yet');

const list = (await rpc(amaka, 'list_staff')).body;
const row = list.find((x) => x.email === email && x.kind === 'staff');
if (!row || row.mfa_on) fail('new staff missing from the Team list');
console.log('ok  Team list shows them as Not set up');

if ((await rpc(amaka, 'set_staff_status', { p_user: row.id, p_active: false })).status !== 204)
  fail('disable failed');
if ((await rpc(fresh, 'get_staff_context')).body !== null) fail('disabled staff still has a context');
if ((await rpc(amaka, 'set_staff_status', { p_user: row.id, p_active: true })).status !== 204)
  fail('enable failed');
console.log('ok  disable cuts access at once; switch on again works');

// Sign-in lockout (rule 8): only the Worker, after a real password check, counts failures.
const anonRpc = await fetch(`${env.API_URL}/rest/v1/rpc/note_staff_signin_failure`, {
  method: 'POST',
  headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_email: email }),
});
if (anonRpc.ok) fail('anyone signed out can note sign-in failures');
const signIn = (password) =>
  fetch(`${api}/v1/staff-sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
r = await signIn('a-long-staff-password');
if (r.status !== 200 || !(await r.json()).refresh_token) fail(`good password returned ${r.status}`);
for (let i = 0; i < 5; i++) {
  r = await signIn('wrong-password');
  if (r.status !== 401) fail(`wrong password ${i + 1} returned ${r.status}`);
}
r = await signIn('a-long-staff-password');
if (r.status !== 423) fail(`sixth try after 5 wrong passwords returned ${r.status}`);
console.log('ok  staff sign-in: 5 wrong passwords lock the email; failures only counted by the Worker');
