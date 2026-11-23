#!/usr/bin/env node
// Flow 17 rule 5 · set up a fresh database for launch. Safe to repeat: every step checks first.
//   node tools/launch/setup.mjs --target staging|production [--apply]
//        [--admin-email you@arpedia.africa --admin-name "Full Name"] [--resend-invite]
// Without --apply it only reports. With --apply it:
//   1. stops before changing anything if production has seed accounts (@example.com, @test.local)
//   2. applies missing migrations (supabase db push), which create plans, credit packs, pricing
//      rules, genres, policy versions 1, app configuration, feature flags, scheduled jobs and queues
//   3. invites the first Super admin by email (rule 6) while there is none; they must turn on
//      two-step sign-in before the console shows any page
// It never creates sample users or books.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL (for --apply), ADMIN_URL,
//      RESEND_API_KEY (optional; without it the invite link is printed for the owner to send).
import { execFileSync } from 'node:child_process';
import {
  ROOT,
  SUPABASE_CLI,
  b64url,
  isSeedEmail,
  parseArgs,
  repoMigrations,
  report,
  requireEnv,
  restClient,
  runIfMain,
  sha256Hex,
  targetFrom,
} from './lib.mjs';

/** What migrations create; checked after they are applied. */
export const CONFIG_CHECKS = [
  'plans',
  'credit_packs',
  'pricing_rules',
  'genres',
  'policy_versions',
  'app_config',
  'feature_flags',
  'scheduled_jobs',
  'queues',
];

async function launchCheck(db) {
  try {
    return await db.rpc('launch_check', {});
  } catch (e) {
    // A database without the flow 17 migration (fresh, or behind) has no launch_check yet.
    if (e.status === 404 || e.code === 'PGRST202' || e.code === '42883') return null;
    throw e;
  }
}

/**
 * Run the set-up. Dependencies are passed in so tests can run it without a database:
 *   db          restClient-like: rpc(fn, args), authUsers(test)
 *   migrate()   applies the repo's migrations to the target
 *   sendInvite(email, name, link) → true when emailed
 */
export async function runSetup({
  target,
  apply = false,
  adminEmail,
  adminName,
  resendInvite = false,
  adminUrl,
  db,
  migrate,
  sendInvite,
  versions = repoMigrations(),
  log = console.log,
}) {
  const items = [];
  const changed = [];

  // 1. Seed data never reaches production (and nothing else runs if it has).
  const seeds = await db.authUsers(isSeedEmail);
  if (seeds.length && target === 'production') {
    throw new Error(
      `Production has ${seeds.length} seed accounts (@example.com / @test.local). Stopped; nothing was changed.`,
    );
  }
  items.push({
    key: 'seed_users',
    status: seeds.length ? 'warn' : 'pass',
    detail: seeds.length ? `${seeds.length} seed accounts (allowed on ${target} only)` : 'none',
  });

  // 2. Migrations.
  let check = await launchCheck(db);
  const applied = new Set(check?.find((i) => i.key === 'migrations')?.versions ?? []);
  const missing = versions.filter((v) => !applied.has(v));
  if (missing.length && apply) {
    log(`Applying ${missing.length} migrations…`);
    await migrate();
    changed.push(`migrations: ${missing.length} applied`);
    check = await launchCheck(db);
  }
  const nowApplied = new Set(check?.find((i) => i.key === 'migrations')?.versions ?? []);
  const stillMissing = versions.filter((v) => !nowApplied.has(v));
  items.push({
    key: 'migrations',
    status: stillMissing.length ? 'fail' : 'pass',
    detail: stillMissing.length
      ? `${stillMissing.length} not applied (first ${stillMissing[0]})${apply ? '' : '; run with --apply'}`
      : `${versions.length} applied`,
  });

  // 3. What the migrations create.
  for (const key of CONFIG_CHECKS) {
    const c = check?.find((i) => i.key === key);
    items.push(
      c
        ? { key, status: c.status, detail: c.detail }
        : { key, status: 'fail', detail: 'unknown until migrations are applied' },
    );
  }

  // 4. First Super admin (rule 6).
  const sa = check?.find((i) => i.key === 'super_admin');
  if (sa?.status === 'pass') {
    items.push({ key: 'super_admin', status: 'pass', detail: sa.detail });
  } else if (sa?.status === 'warn' && (!resendInvite || sa.detail?.startsWith('signed up'))) {
    // Someone is on the way: a fresh invite would only replace their link (or, once they have
    // signed up, be refused).
    items.push({
      key: 'super_admin',
      status: 'pass',
      detail: sa.detail?.startsWith('signed up')
        ? 'signed up; waiting for them to turn on two-step'
        : 'invite sent; waiting for them to sign in and turn on two-step',
    });
  } else if (!apply || !sa) {
    items.push({
      key: 'super_admin',
      status: 'fail',
      detail: 'none yet; run with --apply --admin-email --admin-name',
    });
  } else if (!adminEmail || !adminName) {
    items.push({
      key: 'super_admin',
      status: 'fail',
      detail: '--admin-email and --admin-name are needed to invite one',
    });
  } else {
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await db.rpc('invite_first_super_admin', {
      p_email: adminEmail,
      p_name: adminName,
      p_token_hash: await sha256Hex(token),
    });
    const link = `${adminUrl.replace(/\/$/, '')}/invite/${token}`;
    const emailed = await sendInvite(adminEmail, adminName, link);
    if (!emailed)
      log(`Send this one-time invite link to ${adminEmail} yourself (it expires in 72 hours):\n${link}`);
    changed.push(`super_admin: invited ${adminEmail}${emailed ? ' by email' : ' (link printed)'}`);
    items.push({
      key: 'super_admin',
      status: 'warn',
      detail: `invited ${adminEmail}; waiting for sign-in and two-step`,
    });
  }

  return { items, changed };
}

async function resendInviteEmail(key, to, name, link) {
  if (!key) return false;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Arpedia Admin <admin@arpedia.africa>',
      to,
      subject: 'You’re invited to Arpedia Admin',
      text:
        `Hi ${name.split(/\s+/)[0]},\n\nYou’ve been invited to the Arpedia staff console as Super admin.\n\n` +
        `Create your password and set up two-step sign-in here:\n${link}\n\n` +
        `The link works once and expires in 72 hours. If you weren’t expecting this, ignore this email.`,
    }),
  });
  if (!r.ok) throw new Error(`invite email failed: ${r.status}`);
  return true;
}

async function main(argv) {
  const args = parseArgs(argv);
  const target = targetFrom(args);
  const apply = args.apply === true;
  const env = requireEnv(process.env, [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    ...(apply ? ['SUPABASE_DB_URL'] : []),
  ]);
  const adminUrl = process.env.ADMIN_URL ?? (target === 'local' ? 'http://localhost:3000' : null);
  if (apply && !adminUrl) throw new Error('Missing environment: ADMIN_URL');
  console.log(`Set-up for ${target}${apply ? '' : ' (report only; --apply to change)'}\n`);
  const { items, changed } = await runSetup({
    target,
    apply,
    adminEmail: args['admin-email'],
    adminName: args['admin-name'],
    resendInvite: args['resend-invite'] === true,
    adminUrl,
    db: restClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    migrate: () =>
      execFileSync(
        process.execPath,
        [SUPABASE_CLI, 'db', 'push', '--include-all', '--yes', '--db-url', env.SUPABASE_DB_URL],
        { cwd: ROOT, stdio: 'inherit' },
      ),
    sendInvite: (to, name, link) => resendInviteEmail(process.env.RESEND_API_KEY, to, name, link),
  });
  const ok = report(items);
  if (changed.length) console.log(`Changed: ${changed.join('; ')}`);
  return ok ? 0 : 1;
}

runIfMain(import.meta.url, main);
